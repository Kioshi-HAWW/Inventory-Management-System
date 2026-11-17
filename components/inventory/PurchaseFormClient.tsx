'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  ShoppingCart,
  Receipt,
  Calculator,
  Calendar,
  CheckCircle2,
} from 'lucide-react';

interface SupplierOption {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  name: string;
  unit: string;
  cost_price: number;
  current_stock?: number;
  sku?: string | null;
}

interface LineItem {
  id: string;
  product_id: string;
  quantity: string;
  unit_cost: string;
}

interface Props {
  suppliers: SupplierOption[];
  products: ProductOption[];
}

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);

export default function PurchaseFormClient({ suppliers, products }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const todayStr = new Date().toISOString().split('T')[0];
  const autoPo = (() => {
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const rand = Math.floor(100 + Math.random() * 900);
    return `PO-${ymd}-${rand}`;
  })();

  const [supplierId, setSupplierId] = useState<string>('');
  const [purchaseNumber, setPurchaseNumber] = useState<string>(autoPo);
  const [purchaseDate, setPurchaseDate] = useState<string>(todayStr);
  const [paymentStatus, setPaymentStatus] = useState<'paid' | 'unpaid' | 'partially_paid'>('paid');
  const [notes, setNotes] = useState<string>('');

  // Financial charges
  const [discountAmount, setDiscountAmount] = useState<string>('0');
  const [taxAmount, setTaxAmount] = useState<string>('0');
  const [otherCharges, setOtherCharges] = useState<string>('0');

  // Multiple product line items
  const [lines, setLines] = useState<LineItem[]>([
    { id: '1', product_id: '', quantity: '', unit_cost: '' },
  ]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handleProductChange(lineId: string, productId: string) {
    const prod = products.find((p) => p.id === productId);
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== lineId) return l;
        return {
          ...l,
          product_id: productId,
          unit_cost: prod && prod.cost_price > 0 ? String(prod.cost_price) : l.unit_cost,
        };
      })
    );
  }

  function handleQuantityChange(lineId: string, qty: string) {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, quantity: qty } : l)));
  }

  function handleCostChange(lineId: string, cost: string) {
    setLines((prev) => prev.map((l) => (l.id === lineId ? { ...l, unit_cost: cost } : l)));
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        product_id: '',
        quantity: '',
        unit_cost: '',
      },
    ]);
  }

  function removeLine(lineId: string) {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((l) => l.id !== lineId));
  }

  // Calculated totals
  const subtotal = lines.reduce((sum, l) => {
    const q = parseFloat(l.quantity) || 0;
    const c = parseFloat(l.unit_cost) || 0;
    return sum + q * c;
  }, 0);

  const numDiscount = Math.max(0, parseFloat(discountAmount) || 0);
  const numTax = Math.max(0, parseFloat(taxAmount) || 0);
  const numOther = Math.max(0, parseFloat(otherCharges) || 0);

  const grandTotal = Math.max(0, subtotal - numDiscount + numTax + numOther);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!purchaseNumber.trim()) {
      setError('Purchase invoice / reference number is required.');
      return;
    }

    const validLines = lines.filter((l) => l.product_id && parseFloat(l.quantity) > 0);
    if (validLines.length === 0) {
      setError('Please select at least one product with a valid quantity greater than zero.');
      return;
    }

    for (const l of validLines) {
      if (parseFloat(l.unit_cost) < 0) {
        setError('Unit purchase cost cannot be negative.');
        return;
      }
    }

    setSaving(true);

    const p_items = validLines.map((l) => ({
      product_id: l.product_id,
      quantity: parseFloat(l.quantity),
      unit_cost: parseFloat(l.unit_cost) || 0,
    }));

    const { error: rpcError } = await supabase.rpc('purchase_stock', {
      p_supplier_id: supplierId || null,
      p_purchase_number: purchaseNumber.trim(),
      p_purchase_date: purchaseDate || todayStr,
      p_notes: notes.trim() || null,
      p_items,
      p_discount_amount: numDiscount,
      p_tax_amount: numTax,
      p_other_charges: numOther,
      p_payment_status: paymentStatus,
    });

    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.push('/dashboard/inventory/purchases');
    router.refresh();
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <Link
          href="/dashboard/inventory/purchases"
          className="subtle-button"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
        >
          <ArrowLeft size={14} /> Back to Purchase Orders
        </Link>
      </div>

      <div className="inv-header">
        <div>
          <p className="eyebrow">INVENTORY &bull; PURCHASE ORDER</p>
          <h1>Record Supplier Purchase</h1>
          <p className="muted">
            Receive multiple items in a single supplier bill. Stock counts and weighted average costs are updated atomically.
          </p>
        </div>
      </div>

      {error && <div className="notice error" style={{ marginBottom: 18 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        {/* Invoice Header Details */}
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-heading">
            <div>
              <h2>Invoice &amp; Supplier Information</h2>
              <p>Reference numbers and vendor billing details</p>
            </div>
            <Receipt size={18} style={{ color: '#246bfd' }} />
          </div>

          <div className="form-stack" style={{ marginTop: 16 }}>
            <div className="form-row three">
              <label>
                Purchase Ref / Invoice # <span style={{ color: '#c0392b' }}>*</span>
                <div className="input-wrap">
                  <input
                    required
                    value={purchaseNumber}
                    onChange={(e) => setPurchaseNumber(e.target.value)}
                    placeholder="e.g. INV-2026-9041"
                  />
                </div>
              </label>

              <label>
                Purchase Date <span style={{ color: '#c0392b' }}>*</span>
                <div className="input-wrap">
                  <Calendar size={15} style={{ color: '#9aa5b4' }} />
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                  />
                </div>
              </label>

              <label>
                Supplier / Vendor
                <div style={{ marginTop: 7 }}>
                  <select
                    className="select-input"
                    style={{ width: '100%', height: 43 }}
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">Direct / Cash Purchase (Unspecified)</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
            </div>

            <div className="form-row">
              <label>
                Payment Status
                <div style={{ marginTop: 7 }}>
                  <select
                    className="select-input"
                    style={{ width: '100%', height: 43 }}
                    value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as 'paid' | 'unpaid' | 'partially_paid')}
                  >
                    <option value="paid">Paid in Full (Cash / Bank Transfer)</option>
                    <option value="unpaid">Unpaid / Supplier Credit (Accounts Payable)</option>
                    <option value="partially_paid">Partially Paid / Advance Given</option>
                  </select>
                </div>
              </label>

              <label>
                Notes &amp; Delivery Reference (optional)
                <div className="input-wrap">
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Delivery challan #7821, received at Main Site"
                  />
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Multiple Product Line Items Panel */}
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-heading">
            <div>
              <h2>Purchased Items ({lines.length})</h2>
              <p>Add one or multiple items received in this invoice</p>
            </div>
            <button
              type="button"
              className="subtle-button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={addLine}
            >
              <Plus size={14} /> Add Product Row
            </button>
          </div>

          <div style={{ marginTop: 18 }}>
            {lines.map((l, index) => {
              const selectedProd = products.find((p) => p.id === l.product_id);
              const q = parseFloat(l.quantity) || 0;
              const c = parseFloat(l.unit_cost) || 0;
              const lineTotal = q * c;

              // Weighted Average Cost calculation preview
              const oldStock = Number(selectedProd?.current_stock ?? 0);
              const oldCost = Number(selectedProd?.cost_price ?? 0);
              const newWac =
                q > 0
                  ? oldStock <= 0
                    ? c
                    : ((oldStock * oldCost + q * c) / (oldStock + q)).toFixed(2)
                  : oldCost.toFixed(2);

              return (
                <div
                  key={l.id}
                  style={{
                    padding: '16px 0',
                    borderBottom: '1px solid #f0f2f5',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(220px, 2.5fr) 130px 140px 140px 44px',
                    gap: 12,
                    alignItems: 'start',
                  }}
                >
                  {/* Product selector */}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#8795a6', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                      Product Item #{index + 1} <span style={{ color: '#c0392b' }}>*</span>
                    </label>
                    <select
                      className="select-input"
                      style={{ width: '100%', height: 43 }}
                      value={l.product_id}
                      onChange={(e) => handleProductChange(l.id, e.target.value)}
                      required
                    >
                      <option value="">Select a product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} {p.sku ? `(${p.sku})` : ''} — [{p.unit}]
                        </option>
                      ))}
                    </select>

                    {selectedProd && (
                      <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                        Current in stock: {selectedProd.current_stock ?? 0} {selectedProd.unit} &bull; Current cost: ₹{Number(selectedProd.cost_price).toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Quantity */}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#8795a6', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                      Quantity ({selectedProd?.unit ?? 'pcs'}) <span style={{ color: '#c0392b' }}>*</span>
                    </label>
                    <div className="input-wrap" style={{ marginTop: 0 }}>
                      <input
                        type="number"
                        step="any"
                        min="0.001"
                        required
                        value={l.quantity}
                        onChange={(e) => handleQuantityChange(l.id, e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* Unit Purchase Price */}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#8795a6', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                      Unit Cost (₹) <span style={{ color: '#c0392b' }}>*</span>
                    </label>
                    <div className="input-wrap" style={{ marginTop: 0 }}>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={l.unit_cost}
                        onChange={(e) => handleCostChange(l.id, e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    {q > 0 && c > 0 && selectedProd && (
                      <span style={{ fontSize: 10, color: '#246bfd', marginTop: 4, display: 'block' }}>
                        New WAC: ₹{newWac}
                      </span>
                    )}
                  </div>

                  {/* Line Total */}
                  <div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#8795a6', textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                      Line Total
                    </label>
                    <div
                      style={{
                        height: 43,
                        display: 'flex',
                        alignItems: 'center',
                        fontWeight: 700,
                        fontSize: 14,
                        color: 'var(--text)',
                      }}
                    >
                      {money(lineTotal)}
                    </div>
                  </div>

                  {/* Remove line */}
                  <div style={{ paddingTop: 24 }}>
                    <button
                      type="button"
                      className="icon-btn red"
                      disabled={lines.length <= 1}
                      onClick={() => removeLine(l.id)}
                      title="Remove row"
                      style={{
                        opacity: lines.length <= 1 ? 0.3 : 1,
                        cursor: lines.length <= 1 ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 14 }}>
            <button
              type="button"
              className="subtle-button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={addLine}
            >
              <Plus size={14} /> Add Another Product
            </button>
          </div>
        </div>

        {/* Calculation & Financial Breakdown Panel */}
        <div className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-heading">
            <div>
              <h2>Billing Breakdown &amp; Grand Total</h2>
              <p>Subtotal, discounts, taxes, and additional charges</p>
            </div>
            <Calculator size={18} style={{ color: '#246bfd' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, marginTop: 18 }}>
            {/* Optional adjustments input */}
            <div className="form-stack">
              <div className="form-row three">
                <label>
                  Discount (₹)
                  <div className="input-wrap">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                    Subtracted from subtotal
                  </span>
                </label>

                <label>
                  Tax / GST (₹)
                  <div className="input-wrap">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={taxAmount}
                      onChange={(e) => setTaxAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                    Added to invoice total
                  </span>
                </label>

                <label>
                  Shipping / Other (₹)
                  <div className="input-wrap">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={otherCharges}
                      onChange={(e) => setOtherCharges(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <span className="muted" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                    Freight or loading fees
                  </span>
                </label>
              </div>

              {/* Informative Business Logic Checklist */}
              <div
                style={{
                  background: '#f8fafd',
                  border: '1px solid var(--line)',
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginTop: 8,
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#4b5563', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>
                  Automatic Inventory Transactions on Submission:
                </div>
                <div style={{ display: 'grid', gap: 6, fontSize: 12, color: 'var(--muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <CheckCircle2 size={14} style={{ color: '#139b72' }} />
                    Increases available physical stock atomically for all line products
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <CheckCircle2 size={14} style={{ color: '#139b72' }} />
                    Recalculates Weighted Average Cost (WAC) for inventory valuation
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <CheckCircle2 size={14} style={{ color: '#139b72' }} />
                    Preserves latest purchase price and creates immutable stock transactions
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <CheckCircle2 size={14} style={{ color: '#139b72' }} />
                    Guards against duplicate invoice numbers and negative stock mutations
                  </div>
                </div>
              </div>
            </div>

            {/* Grand Total Summary Box */}
            <div
              style={{
                background: '#fafbfd',
                border: '1px solid var(--line)',
                borderRadius: '12px',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8795a6', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 14 }}>
                  Invoice Summary
                </div>

                <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Items Subtotal:</span>
                    <strong>{money(subtotal)}</strong>
                  </div>

                  {numDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#139b72' }}>
                      <span>Discount:</span>
                      <strong>- {money(numDiscount)}</strong>
                    </div>
                  )}

                  {numTax > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">Tax / GST:</span>
                      <strong>+ {money(numTax)}</strong>
                    </div>
                  )}

                  {numOther > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">Other Charges:</span>
                      <strong>+ {money(numOther)}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ borderTop: '2px solid var(--line)', paddingTop: 16, marginTop: 16 }}>
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Grand Total (Net Payable)
                </span>
                <div
                  style={{
                    font: '800 28px Manrope, sans-serif',
                    letterSpacing: '-0.8px',
                    color: 'var(--text)',
                    marginTop: 4,
                  }}
                >
                  {money(grandTotal)}
                </div>
                <div style={{ marginTop: 6, fontSize: 11 }}>
                  Status:{' '}
                  <span
                    className={`badge ${
                      paymentStatus === 'paid' ? 'green' : paymentStatus === 'partially_paid' ? 'amber' : 'red'
                    }`}
                  >
                    {paymentStatus.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', alignItems: 'center' }}>
          <button
            type="button"
            className="subtle-button"
            onClick={() => router.push('/dashboard/inventory/purchases')}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={saving}
            style={{ minWidth: 220 }}
          >
            {saving ? (
              <>
                <Loader2 className="spin" size={16} /> Recording Purchase &amp; Stock...
              </>
            ) : (
              <>
                <ShoppingCart size={16} /> Confirm &amp; Receive Stock
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
