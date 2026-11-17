'use client';

import { useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  Download,
  Trash2,
  Plus,
  ArrowRight,
  Loader2,
  Search,
} from 'lucide-react';
import {
  detectColumnMapping,
  normalizeUnit,
  generateCsvTemplate,
} from '@/lib/inventory/column-detector';
import { validateRow } from '@/lib/inventory/duplicate-detector';
import type {
  ExtractedProductRow,
  ImportMode,
  ColumnMapping,
  ImportResultSummary,
} from '@/lib/types/import';

interface SupplierOption {
  id: string;
  name: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

interface ExistingProductRef {
  id: string;
  name: string;
  sku: string | null;
  cost_price: number;
  selling_price: number;
  current_stock: number;
  unit: string;
}

interface Props {
  existingProducts: ExistingProductRef[];
  suppliers: SupplierOption[];
  categories: CategoryOption[];
  userRole: string;
}

const UNIT_OPTIONS = ['pcs', 'meters', 'box', 'roll', 'kg', 'set'];

export default function SmartImportClient({
  existingProducts,
  suppliers,
  categories,
  userRole,
}: Props) {
  const router = useRouter();

  // Wizard steps: 'upload' | 'mapping' | 'preview' | 'summary'
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'summary'>('upload');

  // Mode settings
  const [mode, setMode] = useState<ImportMode>('catalogue');
  const [supplierId, setSupplierId] = useState('');
  const [purchaseNumber, setPurchaseNumber] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);

  // Upload & File state
  const [dragOver, setDragOver] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [progressPct, setProgressPct] = useState(0);

  // Column mapping state (for CSV/Excel)
  const [rawSheetData, setRawSheetData] = useState<any[]>([]);
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    name: '',
    sku: '',
    category: '',
    unit: '',
    description: '',
    quantity: '',
    purchase_price: '',
    selling_price: '',
    minimum_stock: '',
  });

  // Extracted rows state
  const [rows, setRows] = useState<ExtractedProductRow[]>([]);
  const [previewQuery, setPreviewQuery] = useState('');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'valid' | 'warnings' | 'errors'>('all');

  // Execution state
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<ImportResultSummary | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download template
  function handleDownloadTemplate() {
    const csvContent = generateCsvTemplate();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'voltdesk_inventory_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Handle file selection
  async function handleFileSelect(file: File) {
    setUploadError('');
    setUploadedFile(file);

    const ext = file.name.split('.').pop()?.toLowerCase();
    const isSpreadsheet = ['csv', 'xlsx', 'xls'].includes(ext || '');
    const isDocumentOrImage = ['jpg', 'jpeg', 'png', 'webp', 'pdf'].includes(ext || '');

    if (!isSpreadsheet && !isDocumentOrImage) {
      setUploadError('Unsupported file format. Please upload CSV, XLSX, JPG, PNG, or PDF files.');
      return;
    }

    if (isSpreadsheet) {
      await processSpreadsheetFile(file);
    } else {
      await processDocumentOrImageFile(file);
    }
  }

  // Process CSV / XLSX in browser using SheetJS
  async function processSpreadsheetFile(file: File) {
    setProcessing(true);
    setProgressPct(20);
    setProgressMsg('Reading spreadsheet data...');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];

      const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
        defval: '',
        raw: false,
      });

      if (jsonData.length === 0) {
        throw new Error('Spreadsheet appears to be empty or has no readable rows.');
      }

      setProgressPct(60);
      setProgressMsg('Detecting column headers and synonyms...');

      // Extract headers from first row keys
      const headers = Object.keys(jsonData[0]);
      setSheetHeaders(headers);
      setRawSheetData(jsonData);

      const detected = detectColumnMapping(headers);
      setColumnMapping(detected);

      setProgressPct(100);
      setProcessing(false);

      // If key columns (like product name) are detected, proceed to preview; otherwise show mapping screen
      if (detected.name) {
        applyMappingToRows(jsonData, detected);
      } else {
        setStep('mapping');
      }
    } catch (err: any) {
      setProcessing(false);
      setUploadError(err.message || 'Failed to parse spreadsheet file.');
    }
  }

  // Apply mapped columns to produce ExtractedProductRow array
  function applyMappingToRows(data: any[], mapping: ColumnMapping) {
    const parsedRows: ExtractedProductRow[] = data.map((item, idx) => {
      const rawName = item[mapping.name] ? String(item[mapping.name]).trim() : '';
      const rawSku = mapping.sku && item[mapping.sku] ? String(item[mapping.sku]).trim() : '';
      const rawCat = mapping.category && item[mapping.category] ? String(item[mapping.category]).trim() : '';
      const rawUnit = mapping.unit && item[mapping.unit] ? String(item[mapping.unit]).trim() : 'pcs';
      const rawDesc = mapping.description && item[mapping.description] ? String(item[mapping.description]).trim() : '';

      const rawQty = mapping.quantity ? parseFloat(String(item[mapping.quantity]).replace(/[^0-9.-]/g, '')) : 0;
      const rawCost = mapping.purchase_price ? parseFloat(String(item[mapping.purchase_price]).replace(/[^0-9.-]/g, '')) : 0;
      const rawPrice = mapping.selling_price ? parseFloat(String(item[mapping.selling_price]).replace(/[^0-9.-]/g, '')) : 0;
      const rawMin = mapping.minimum_stock ? parseFloat(String(item[mapping.minimum_stock]).replace(/[^0-9.-]/g, '')) : 0;

      const rowObj: ExtractedProductRow = {
        id: `row-${Date.now()}-${idx}`,
        name: rawName,
        sku: rawSku,
        category: rawCat || 'General Electrical',
        unit: normalizeUnit(rawUnit),
        description: rawDesc,
        quantity: isNaN(rawQty) ? 0 : Math.max(0, rawQty),
        purchase_price: isNaN(rawCost) ? 0 : Math.max(0, rawCost),
        selling_price: isNaN(rawPrice) ? 0 : Math.max(0, rawPrice),
        minimum_stock: isNaN(rawMin) ? 0 : Math.max(0, rawMin),
        confidence: 'high',
        uncertain_fields: [],
        duplicate: null,
        action: 'create',
        errors: [],
        warnings: [],
      };

      return rowObj;
    });

    // Validate and check duplicates
    const validated = parsedRows.map((row) => {
      const { errors, warnings, duplicate } = validateRow(row, existingProducts, parsedRows);
      return {
        ...row,
        errors,
        warnings,
        duplicate,
        action: duplicate ? ('skip' as const) : ('create' as const),
      };
    });

    setRows(validated);
    setStep('preview');
  }

  // Process Document or Image via Server-Side AI Vision / OCR
  async function processDocumentOrImageFile(file: File) {
    setProcessing(true);
    setProgressPct(20);
    setProgressMsg('Uploading invoice / document to server...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      setProgressPct(50);
      setProgressMsg('Running AI Vision & OCR extraction for electrical products...');

      const res = await fetch('/api/inventory/import/extract', {
        method: 'POST',
        body: formData,
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Failed to extract items from file.');
      }

      setProgressPct(85);
      setProgressMsg('Checking duplicates against catalogue...');

      if (result.invoiceMeta?.invoiceNumber && !purchaseNumber) {
        setPurchaseNumber(result.invoiceMeta.invoiceNumber);
      }
      if (result.invoiceMeta?.invoiceDate) {
        setPurchaseDate(result.invoiceMeta.invoiceDate);
      }

      // Check duplicates for AI extracted rows
      const validated: ExtractedProductRow[] = (result.items || []).map((row: ExtractedProductRow) => {
        const { errors, warnings, duplicate } = validateRow(row, existingProducts, result.items);
        return {
          ...row,
          errors,
          warnings,
          duplicate,
          action: duplicate ? ('skip' as const) : ('create' as const),
        };
      });

      setRows(validated);
      setProgressPct(100);
      setProcessing(false);
      setStep('preview');
    } catch (err: any) {
      setProcessing(false);
      setUploadError(err.message || 'Error processing document with AI Vision.');
    }
  }

  // Row update helpers in Preview screen
  function updateRowField(id: string, field: keyof ExtractedProductRow, val: any) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: val };
        // Re-validate row
        const { errors, warnings, duplicate } = validateRow(updated, existingProducts, prev);
        return {
          ...updated,
          errors,
          warnings,
          duplicate,
        };
      })
    );
  }

  function deleteRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addEmptyRow() {
    const newRow: ExtractedProductRow = {
      id: `manual-${Date.now()}`,
      name: '',
      sku: '',
      category: 'General Electrical',
      unit: 'pcs',
      description: '',
      quantity: 1,
      purchase_price: 0,
      selling_price: 0,
      minimum_stock: 0,
      confidence: 'high',
      uncertain_fields: [],
      duplicate: null,
      action: 'create',
      errors: ['Product name is required'],
      warnings: [],
      isManual: true,
    };
    setRows((prev) => [newRow, ...prev]);
  }

  // Filtered rows in Preview
  const filteredRows = useMemo(() => {
    const q = previewQuery.toLowerCase().trim();
    return rows.filter((r) => {
      const matchesSearch =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (previewFilter === 'valid') return r.errors.length === 0 && !r.duplicate;
      if (previewFilter === 'warnings') return r.warnings.length > 0 || r.duplicate !== null;
      if (previewFilter === 'errors') return r.errors.length > 0;
      return true;
    });
  }, [rows, previewQuery, previewFilter]);

  // Statistics
  const stats = useMemo(() => {
    const total = rows.length;
    const errors = rows.filter((r) => r.errors.length > 0).length;
    const duplicates = rows.filter((r) => r.duplicate !== null).length;
    const ready = rows.filter((r) => r.errors.length === 0 && r.action !== 'skip').length;
    const skipped = rows.filter((r) => r.action === 'skip').length;
    return { total, errors, duplicates, ready, skipped };
  }, [rows]);

  // Execute Import
  async function handleConfirmImport() {
    if (stats.errors > 0) {
      alert(`Please resolve the ${stats.errors} invalid rows before importing.`);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/inventory/import/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          items: rows,
          supplierId: supplierId || null,
          purchaseNumber: purchaseNumber.trim() || null,
          purchaseDate,
          purchaseNotes: `Smart imported on ${new Date().toLocaleDateString('en-IN')}`,
        }),
      });

      const resData = await res.json();
      setSaving(false);

      if (!res.ok) {
        throw new Error(resData.error || 'Failed to complete import.');
      }

      setSummary(resData);
      setStep('summary');
    } catch (err: any) {
      setSaving(false);
      alert(err.message || 'An error occurred during import.');
    }
  }

  return (
    <div>
      {/* Sub-nav tabs */}
      <div className="tab-bar">
        <Link href="/dashboard/inventory" className="tab">
          Products
        </Link>
        <Link href="/dashboard/inventory/categories" className="tab">
          Categories
        </Link>
        <Link href="/dashboard/inventory/suppliers" className="tab">
          Suppliers
        </Link>
        <Link href="/dashboard/inventory/purchases" className="tab">
          Purchases
        </Link>
        <Link href="/dashboard/inventory/import" className="tab active">
          Smart Import
        </Link>
      </div>

      {/* Header */}
      <div className="inv-header">
        <div>
          <p className="eyebrow">INVENTORY &bull; SMART IMPORT</p>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            Smart Product Import
            <span
              className="badge blue"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 700 }}
            >
              <Sparkles size={12} /> AI &amp; Bulk OCR
            </span>
          </h1>
          <p className="muted">
            Bulk import from CSV, Excel spreadsheets, supplier invoices, or photos of material lists
          </p>
        </div>

        <button
          className="subtle-button"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={handleDownloadTemplate}
          title="Download pre-formatted CSV template with sample electrical products"
        >
          <Download size={14} /> Download CSV Template
        </button>
      </div>

      {/* ───────────────────────────────────────────── */}
      {/* STEP 1: UPLOAD STAGE                         */}
      {/* ───────────────────────────────────────────── */}
      {step === 'upload' && (
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {/* Mode Selector Panel */}
          <div className="panel" style={{ padding: '20px 24px', marginBottom: 20 }}>
            <div style={{ marginBottom: 14 }}>
              <strong style={{ fontSize: 13, display: 'block', color: 'var(--text)' }}>
                1. Select Import Workflow Mode
              </strong>
              <p className="muted" style={{ fontSize: 11, margin: '3px 0 0' }}>
                Determine how imported items affect your warehouse stock and ledger
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}
            >
              <label
                style={{
                  border: `2px solid ${mode === 'catalogue' ? '#246bfd' : 'var(--line)'}`,
                  background: mode === 'catalogue' ? '#f5f8ff' : '#fff',
                  borderRadius: 10,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'block',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input
                    type="radio"
                    name="importMode"
                    value="catalogue"
                    checked={mode === 'catalogue'}
                    onChange={() => setMode('catalogue')}
                  />
                  <strong style={{ fontSize: 13 }}>Catalogue Only</strong>
                </div>
                <p className="muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.4 }}>
                  Creates/updates items in your product catalogue. Initial stock level remains 0.
                </p>
              </label>

              <label
                style={{
                  border: `2px solid ${mode === 'opening_stock' ? '#246bfd' : 'var(--line)'}`,
                  background: mode === 'opening_stock' ? '#f5f8ff' : '#fff',
                  borderRadius: 10,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'block',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input
                    type="radio"
                    name="importMode"
                    value="opening_stock"
                    checked={mode === 'opening_stock'}
                    onChange={() => setMode('opening_stock')}
                  />
                  <strong style={{ fontSize: 13 }}>Opening Stock Migration</strong>
                </div>
                <p className="muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.4 }}>
                  Sets initial warehouse inventory counts and cost prices. Creates an atomic opening stock ledger.
                </p>
              </label>

              <label
                style={{
                  border: `2px solid ${mode === 'purchase' ? '#246bfd' : 'var(--line)'}`,
                  background: mode === 'purchase' ? '#f5f8ff' : '#fff',
                  borderRadius: 10,
                  padding: 14,
                  cursor: 'pointer',
                  display: 'block',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <input
                    type="radio"
                    name="importMode"
                    value="purchase"
                    checked={mode === 'purchase'}
                    onChange={() => setMode('purchase')}
                  />
                  <strong style={{ fontSize: 13 }}>Actual Purchase Invoice</strong>
                </div>
                <p className="muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.4 }}>
                  Records a supplier bill, increases available stock, and calculates Weighted Average Cost (WAC).
                </p>
              </label>
            </div>

            {/* Mode 3 extra options */}
            {mode === 'purchase' && (
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: '1px solid var(--line)',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 12,
                }}
              >
                <label>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                    SUPPLIER (OPTIONAL)
                  </span>
                  <div style={{ marginTop: 5 }}>
                    <select
                      className="select-input"
                      style={{ width: '100%', height: 40 }}
                      value={supplierId}
                      onChange={(e) => setSupplierId(e.target.value)}
                    >
                      <option value="">— Direct / Unspecified —</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </label>

                <label>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                    INVOICE / PO NUMBER
                  </span>
                  <div className="input-wrap" style={{ marginTop: 5, height: 40 }}>
                    <input
                      placeholder="e.g. INV-2026-089"
                      value={purchaseNumber}
                      onChange={(e) => setPurchaseNumber(e.target.value)}
                    />
                  </div>
                </label>

                <label>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                    PURCHASE DATE
                  </span>
                  <div className="input-wrap" style={{ marginTop: 5, height: 40 }}>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                    />
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* Drag & Drop Upload Card */}
          <div
            className="panel"
            style={{
              padding: '40px 30px',
              textAlign: 'center',
              border: `2px dashed ${dragOver ? '#246bfd' : 'var(--line)'}`,
              background: dragOver ? '#f0f5ff' : '#fff',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFileSelect(file);
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: 'none' }}
              accept=".csv,.xlsx,.xls,.jpg,.jpeg,.png,.webp,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelect(file);
              }}
            />

            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background: '#edf3ff',
                color: '#246bfd',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 16px',
              }}
            >
              <UploadCloud size={30} />
            </div>

            <h3 style={{ font: '700 18px Manrope, sans-serif', margin: '0 0 6px' }}>
              Drag and drop your file here, or browse
            </h3>
            <p className="muted" style={{ fontSize: 12, margin: '0 auto 20px', maxWidth: 440 }}>
              Upload <strong>.CSV</strong> or <strong>.XLSX</strong> spreadsheets, or take a picture of an electrical supplier invoice / material slip (<strong>.JPG, .PNG, .PDF</strong>).
            </p>

            <button
              type="button"
              className="primary-button"
              style={{ margin: '0 auto', display: 'inline-flex' }}
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
            >
              Select File to Upload
            </button>

            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 20,
                marginTop: 24,
                fontSize: 11,
                color: 'var(--muted)',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <FileSpreadsheet size={14} /> CSV / Excel
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <ImageIcon size={14} /> Photos of Bills &amp; Slips
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <FileText size={14} /> PDF Invoices
              </span>
            </div>
          </div>

          {uploadError && (
            <div className="notice error" style={{ marginTop: 16 }}>
              {uploadError}
            </div>
          )}

          {/* Processing / Progress Indicator */}
          {processing && (
            <div className="panel" style={{ marginTop: 18, padding: 22, textAlign: 'center' }}>
              <Loader2 className="spin" size={28} style={{ color: '#246bfd', margin: '0 auto 10px' }} />
              <p style={{ font: '600 14px Manrope, sans-serif', margin: '0 0 6px' }}>
                {progressMsg}
              </p>
              <div
                style={{
                  height: 6,
                  background: '#eef2f7',
                  borderRadius: 3,
                  maxWidth: 360,
                  margin: '12px auto 0',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progressPct}%`,
                    background: '#246bfd',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* STEP 2: MANUAL COLUMN MAPPING                */}
      {/* ───────────────────────────────────────────── */}
      {step === 'mapping' && (
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div className="panel" style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <p className="eyebrow" style={{ margin: '0 0 4px' }}>COLUMN CONFIGURATION</p>
                <h2 style={{ margin: 0 }}>Map Spreadsheet Columns</h2>
                <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  Match each VoltDesk field to the corresponding column header in{' '}
                  <strong>{uploadedFile?.name}</strong>.
                </p>
              </div>
              <button
                className="subtle-button"
                onClick={() => setStep('upload')}
              >
                Change File
              </button>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 16,
                marginTop: 20,
              }}
            >
              {[
                { key: 'name', label: 'Product Name *', required: true },
                { key: 'sku', label: 'SKU / Item Code' },
                { key: 'category', label: 'Category' },
                { key: 'unit', label: 'Unit of Measure' },
                { key: 'quantity', label: 'Quantity' },
                { key: 'purchase_price', label: 'Purchase Price' },
                { key: 'selling_price', label: 'Selling Price' },
                { key: 'minimum_stock', label: 'Minimum Stock' },
                { key: 'description', label: 'Description' },
              ].map(({ key, label, required }) => (
                <div key={key}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', display: 'block', marginBottom: 5 }}>
                    {label} {required && <span style={{ color: '#c0392b' }}>*</span>}
                  </label>
                  <select
                    className="select-input"
                    style={{ width: '100%', height: 40 }}
                    value={columnMapping[key as keyof ColumnMapping]}
                    onChange={(e) =>
                      setColumnMapping((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                  >
                    <option value="">— Do Not Map / None —</option>
                    {sheetHeaders.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 26, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button
                type="button"
                className="subtle-button"
                onClick={() => setStep('upload')}
              >
                Back
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={!columnMapping.name}
                onClick={() => applyMappingToRows(rawSheetData, columnMapping)}
              >
                Apply Mapping &amp; Preview Items <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* STEP 3: EDITABLE PREVIEW & CONFIRMATION      */}
      {/* ───────────────────────────────────────────── */}
      {step === 'preview' && (
        <div>
          {/* Top KPI Bar */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div className="panel" style={{ padding: '14px 18px' }}>
              <div className="eyebrow">TOTAL ROWS</div>
              <div style={{ font: '800 22px Manrope, sans-serif', marginTop: 4 }}>
                {stats.total}
              </div>
            </div>

            <div className="panel" style={{ padding: '14px 18px' }}>
              <div className="eyebrow">READY TO IMPORT</div>
              <div style={{ font: '800 22px Manrope, sans-serif', color: '#139b72', marginTop: 4 }}>
                {stats.ready}
              </div>
            </div>

            <div className="panel" style={{ padding: '14px 18px' }}>
              <div className="eyebrow">DUPLICATES &amp; WARNINGS</div>
              <div style={{ font: '800 22px Manrope, sans-serif', color: stats.duplicates > 0 ? '#c98724' : 'var(--muted)', marginTop: 4 }}>
                {stats.duplicates}
              </div>
            </div>

            <div className="panel" style={{ padding: '14px 18px' }}>
              <div className="eyebrow">ERRORS (BLOCKING)</div>
              <div style={{ font: '800 22px Manrope, sans-serif', color: stats.errors > 0 ? '#c0392b' : 'var(--muted)', marginTop: 4 }}>
                {stats.errors}
              </div>
            </div>
          </div>

          {/* Mode Banner & Tools */}
          <div
            className="panel"
            style={{
              padding: '14px 18px',
              marginBottom: 16,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="badge blue" style={{ padding: '4px 9px', textTransform: 'capitalize' }}>
                Mode: {mode.replace('_', ' ')}
              </span>
              {mode === 'purchase' && purchaseNumber && (
                <span className="muted" style={{ fontSize: 12 }}>
                  PO Ref: <strong>{purchaseNumber}</strong>
                </span>
              )}
              {uploadedFile && (
                <span className="muted" style={{ fontSize: 12 }}>
                  File: <strong>{uploadedFile.name}</strong>
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="subtle-button"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                onClick={addEmptyRow}
              >
                <Plus size={13} /> Add Row Manually
              </button>
              <button
                type="button"
                className="subtle-button"
                onClick={() => setStep('upload')}
              >
                Upload Different File
              </button>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="inv-toolbar">
            <div className="inv-search">
              <Search size={15} />
              <input
                placeholder="Search extracted products in table..."
                value={previewQuery}
                onChange={(e) => setPreviewQuery(e.target.value)}
              />
            </div>

            <select
              className="select-input"
              value={previewFilter}
              onChange={(e) => setPreviewFilter(e.target.value as any)}
            >
              <option value="all">Show All Rows ({rows.length})</option>
              <option value="valid">Valid Rows Only</option>
              <option value="warnings">Duplicates &amp; Warnings</option>
              <option value="errors">Errors Only</option>
            </select>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="primary-button"
                disabled={saving || stats.errors > 0 || stats.ready === 0}
                onClick={handleConfirmImport}
              >
                {saving ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                Confirm &amp; Import ({stats.ready} Products)
              </button>
            </div>
          </div>

          {/* Editable Preview Table */}
          <div className="table-wrap" style={{ overflowX: 'auto', maxHeight: 600 }}>
            <table className="data-table" style={{ minWidth: 1050 }}>
              <thead>
                <tr>
                  <th style={{ width: 100 }}>STATUS</th>
                  <th style={{ width: 140 }}>DUPLICATE ACTION</th>
                  <th>PRODUCT NAME *</th>
                  <th style={{ width: 130 }}>SKU</th>
                  <th style={{ width: 130 }}>CATEGORY</th>
                  <th style={{ width: 90 }}>UNIT</th>
                  <th style={{ width: 85 }}>QTY</th>
                  <th style={{ width: 100 }}>COST (₹)</th>
                  <th style={{ width: 100 }}>SELLING (₹)</th>
                  <th style={{ width: 80 }}>MIN</th>
                  <th style={{ width: 45, textAlign: 'center' }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: 'center', padding: '30px' }}>
                      <p className="muted">No rows match your current filter.</p>
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => {
                    const hasError = row.errors.length > 0;
                    const hasWarning = row.warnings.length > 0;

                    return (
                      <tr
                        key={row.id}
                        style={{
                          background: hasError
                            ? '#fff5f5'
                            : row.action === 'skip'
                            ? '#fbfbfb'
                            : hasWarning
                            ? '#fffdf5'
                            : undefined,
                        }}
                      >
                        {/* Status / Confidence badge */}
                        <td>
                          <div>
                            {hasError ? (
                              <span className="badge red" title={row.errors.join(', ')}>
                                <AlertCircle size={10} /> Error
                              </span>
                            ) : hasWarning ? (
                              <span className="badge amber" title={row.warnings.join(', ')}>
                                <AlertTriangle size={10} /> Duplicate
                              </span>
                            ) : (
                              <span className="badge green">
                                <CheckCircle2 size={10} /> Valid
                              </span>
                            )}
                            {row.confidence && (
                              <div
                                className="muted"
                                style={{
                                  fontSize: 9,
                                  marginTop: 3,
                                  textTransform: 'uppercase',
                                  letterSpacing: 0.5,
                                }}
                              >
                                {row.confidence} conf.
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Duplicate Action selector */}
                        <td>
                          {row.duplicate ? (
                            <select
                              className="select-input"
                              style={{ height: 32, fontSize: 11, width: '100%', padding: '0 6px' }}
                              value={row.action}
                              onChange={(e) =>
                                updateRowField(row.id, 'action', e.target.value)
                              }
                            >
                              <option value="skip">Skip Row</option>
                              <option value="update">Update Existing</option>
                              <option value="create">Create New (Copy)</option>
                            </select>
                          ) : (
                            <span className="muted" style={{ fontSize: 11 }}>
                              New Product
                            </span>
                          )}
                        </td>

                        {/* Product Name */}
                        <td>
                          <input
                            type="text"
                            required
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              border: hasError && !row.name ? '1px solid #e53935' : '1px solid var(--line)',
                              borderRadius: 6,
                              fontSize: 12,
                              fontWeight: 600,
                            }}
                            value={row.name}
                            onChange={(e) => updateRowField(row.id, 'name', e.target.value)}
                          />
                          {row.duplicate && (
                            <div className="muted" style={{ fontSize: 10, marginTop: 2, color: '#c98724' }}>
                              Matches: {row.duplicate.matchedProductName}
                            </div>
                          )}
                        </td>

                        {/* SKU */}
                        <td>
                          <input
                            type="text"
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              fontSize: 11,
                              fontFamily: 'monospace',
                            }}
                            value={row.sku}
                            onChange={(e) => updateRowField(row.id, 'sku', e.target.value)}
                          />
                        </td>

                        {/* Category */}
                        <td>
                          <input
                            type="text"
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              fontSize: 11,
                            }}
                            value={row.category}
                            onChange={(e) => updateRowField(row.id, 'category', e.target.value)}
                          />
                        </td>

                        {/* Unit */}
                        <td>
                          <select
                            className="select-input"
                            style={{ height: 32, fontSize: 11, width: '100%', padding: '0 4px' }}
                            value={row.unit}
                            onChange={(e) => updateRowField(row.id, 'unit', e.target.value)}
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Quantity */}
                        <td>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            style={{
                              width: '100%',
                              padding: '6px 6px',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              fontSize: 12,
                              textAlign: 'right',
                            }}
                            value={row.quantity}
                            onChange={(e) =>
                              updateRowField(row.id, 'quantity', parseFloat(e.target.value) || 0)
                            }
                          />
                        </td>

                        {/* Purchase Price */}
                        <td>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            style={{
                              width: '100%',
                              padding: '6px 6px',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              fontSize: 12,
                              textAlign: 'right',
                            }}
                            value={row.purchase_price}
                            onChange={(e) =>
                              updateRowField(row.id, 'purchase_price', parseFloat(e.target.value) || 0)
                            }
                          />
                        </td>

                        {/* Selling Price */}
                        <td>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            style={{
                              width: '100%',
                              padding: '6px 6px',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              fontSize: 12,
                              textAlign: 'right',
                            }}
                            value={row.selling_price}
                            onChange={(e) =>
                              updateRowField(row.id, 'selling_price', parseFloat(e.target.value) || 0)
                            }
                          />
                        </td>

                        {/* Minimum Stock */}
                        <td>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            style={{
                              width: '100%',
                              padding: '6px 6px',
                              border: '1px solid var(--line)',
                              borderRadius: 6,
                              fontSize: 12,
                              textAlign: 'right',
                            }}
                            value={row.minimum_stock}
                            onChange={(e) =>
                              updateRowField(row.id, 'minimum_stock', parseFloat(e.target.value) || 0)
                            }
                          />
                        </td>

                        {/* Delete action */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="icon-btn red"
                            style={{ padding: 4 }}
                            onClick={() => deleteRow(row.id)}
                            title="Remove row from import"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Confirmation Bar */}
          <div
            style={{
              marginTop: 18,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div className="muted" style={{ fontSize: 12 }}>
              {stats.skipped > 0 && <span>{stats.skipped} rows marked to skip &bull; </span>}
              Ready to import: <strong>{stats.ready} products</strong>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className="subtle-button"
                onClick={() => setStep('upload')}
              >
                Back to Upload
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={saving || stats.errors > 0 || stats.ready === 0}
                onClick={handleConfirmImport}
              >
                {saving ? (
                  <Loader2 className="spin" size={15} />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                Confirm &amp; Import Products
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───────────────────────────────────────────── */}
      {/* STEP 4: FINAL IMPORT SUMMARY                 */}
      {/* ───────────────────────────────────────────── */}
      {step === 'summary' && summary && (
        <div style={{ maxWidth: 640, margin: '20px auto' }}>
          <div className="panel" style={{ padding: 32, textAlign: 'center' }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: summary.failed === 0 ? '#eaf8f2' : '#fff6e8',
                color: summary.failed === 0 ? '#139b72' : '#c98724',
                display: 'grid',
                placeItems: 'center',
                margin: '0 auto 16px',
              }}
            >
              <CheckCircle2 size={28} />
            </div>

            <h2 style={{ font: '800 22px Manrope, sans-serif', margin: '0 0 6px' }}>
              Import Completed Successfully
            </h2>
            <p className="muted" style={{ fontSize: 13, margin: '0 0 24px' }}>
              Your inventory records have been processed and saved to the database.
            </p>

            {/* Results Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 12,
                marginBottom: 24,
              }}
            >
              <div style={{ background: '#f8fafd', padding: 14, borderRadius: 8 }}>
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                  Total
                </span>
                <strong style={{ display: 'block', fontSize: 18, marginTop: 4 }}>
                  {summary.total}
                </strong>
              </div>
              <div style={{ background: '#f8fafd', padding: 14, borderRadius: 8 }}>
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                  Created
                </span>
                <strong style={{ display: 'block', fontSize: 18, color: '#139b72', marginTop: 4 }}>
                  {summary.created}
                </strong>
              </div>
              <div style={{ background: '#f8fafd', padding: 14, borderRadius: 8 }}>
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                  Updated
                </span>
                <strong style={{ display: 'block', fontSize: 18, color: '#246bfd', marginTop: 4 }}>
                  {summary.updated}
                </strong>
              </div>
              <div style={{ background: '#f8fafd', padding: 14, borderRadius: 8 }}>
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>
                  Skipped
                </span>
                <strong style={{ display: 'block', fontSize: 18, color: '#788496', marginTop: 4 }}>
                  {summary.skipped}
                </strong>
              </div>
            </div>

            {summary.purchaseNumber && (
              <div
                style={{
                  background: '#f0f5ff',
                  border: '1px solid #d8e5ff',
                  borderRadius: 8,
                  padding: '12px 16px',
                  marginBottom: 20,
                  fontSize: 13,
                  textAlign: 'left',
                }}
              >
                Purchase Order created:{' '}
                <strong>{summary.purchaseNumber}</strong> with stock ledger entries.
              </div>
            )}

            {summary.errors.length > 0 && (
              <div className="notice error" style={{ textAlign: 'left', marginBottom: 20 }}>
                <strong>Warnings during batch processing:</strong>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {summary.errors.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                className="subtle-button"
                onClick={() => {
                  setStep('upload');
                  setUploadedFile(null);
                  setRows([]);
                  setSummary(null);
                }}
              >
                Import Another File
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={() => router.push('/dashboard/inventory')}
              >
                Go to Inventory Products
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
