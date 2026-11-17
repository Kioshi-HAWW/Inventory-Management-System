'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BriefcaseBusiness,
  MapPin,
  TrendingUp,
  Package,
  Loader2,
  X,
  RotateCcw,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Project, Customer, ProjectMaterial, ProjectStatus } from '@/lib/types/projects';

interface ProductOption {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  cost_price: number;
  sku?: string | null;
}

interface StockTxn {
  id: string;
  transaction_type: string;
  quantity: number;
  unit_cost: number;
  notes: string | null;
  created_at: string;
  products?: { name: string; unit: string; sku?: string | null } | null;
}

interface Props {
  project: Project;
  customers: Customer[];
  materials: ProjectMaterial[];
  transactions: StockTxn[];
  availableProducts: ProductOption[];
  userRole: string;
}

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateTime = (d: string) =>
  new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function ProjectDetailClient({
  project: initialProject,
  customers,
  materials: initialMaterials,
  transactions: initialTransactions,
  availableProducts,
  userRole,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [project, setProject] = useState<Project>(initialProject);
  const [materials, setMaterials] = useState<ProjectMaterial[]>(initialMaterials);
  const [transactions, setTransactions] = useState<StockTxn[]>(initialTransactions);
  const [activeTab, setActiveTab] = useState<'materials' | 'ledger' | 'details'>('materials');

  // Issue modal state
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [issueQty, setIssueQty] = useState('');
  const [issueNotes, setIssueNotes] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState('');

  // Return modal state
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnMaterial, setReturnMaterial] = useState<ProjectMaterial | null>(null);
  const [returnQty, setReturnQty] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState('');

  // Status updating state
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Edit details form
  const [editName, setEditName] = useState(project.name);
  const [editCustomerId, setEditCustomerId] = useState(project.customer_id || '');
  const [editSiteAddress, setEditSiteAddress] = useState(project.site_address || '');
  const [editStartDate, setEditStartDate] = useState(project.start_date || '');
  const [editEndDate, setEditEndDate] = useState(project.expected_end_date || '');
  const [editNotes, setEditNotes] = useState(project.notes || '');
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [detailsSuccess, setDetailsSuccess] = useState('');

  // KPI calculations
  const totalCostSnapshot = materials.reduce((sum, m) => {
    const net = Math.max(0, m.quantity_issued - m.quantity_returned);
    return sum + net * m.unit_cost_snapshot;
  }, 0);

  const totalUnitsIssued = materials.reduce((sum, m) => sum + Number(m.quantity_issued || 0), 0);
  const totalUnitsReturned = materials.reduce((sum, m) => sum + Number(m.quantity_returned || 0), 0);
  const selectedProduct = availableProducts.find((p) => p.id === selectedProductId);

  async function handleStatusChange(newStatus: ProjectStatus) {
    setUpdatingStatus(true);
    const { error } = await supabase.rpc('upsert_project', {
      p_id: project.id,
      p_project_code: project.project_code,
      p_name: project.name,
      p_customer_id: project.customer_id,
      p_site_address: project.site_address,
      p_start_date: project.start_date,
      p_expected_end_date: project.expected_end_date,
      p_status: newStatus,
      p_notes: project.notes,
    });
    setUpdatingStatus(false);
    if (!error) {
      setProject((prev) => ({ ...prev, status: newStatus }));
      router.refresh();
    }
  }

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(issueQty);
    if (!selectedProductId) {
      setIssueError('Please select a material product to issue.');
      return;
    }
    if (!qty || qty <= 0) {
      setIssueError('Enter a valid quantity greater than zero.');
      return;
    }
    if (selectedProduct && qty > selectedProduct.current_stock) {
      setIssueError(`Cannot issue ${qty} units: only ${selectedProduct.current_stock} currently in warehouse stock.`);
      return;
    }

    setIssuing(true);
    setIssueError('');

    const { error: rpcError } = await supabase.rpc('issue_project_material', {
      p_project_id: project.id,
      p_product_id: selectedProductId,
      p_quantity: qty,
      p_notes: issueNotes.trim() || null,
    });

    setIssuing(false);

    if (rpcError) {
      setIssueError(rpcError.message);
      return;
    }

    setIssueModalOpen(false);
    setSelectedProductId('');
    setIssueQty('');
    setIssueNotes('');
    router.refresh();
  }

  function openReturn(mat: ProjectMaterial) {
    setReturnMaterial(mat);
    const net = Math.max(0, mat.quantity_issued - mat.quantity_returned);
    setReturnQty(String(net));
    setReturnNotes('');
    setReturnError('');
    setReturnModalOpen(true);
  }

  async function handleReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!returnMaterial) return;

    const qty = parseFloat(returnQty);
    const net = Math.max(0, returnMaterial.quantity_issued - returnMaterial.quantity_returned);

    if (!qty || qty <= 0) {
      setReturnError('Enter a valid quantity to return.');
      return;
    }
    if (qty > net) {
      setReturnError(`Cannot return ${qty} units: only ${net} units are currently on site.`);
      return;
    }

    setReturning(true);
    setReturnError('');

    const { error: rpcError } = await supabase.rpc('return_project_material', {
      p_project_id: project.id,
      p_product_id: returnMaterial.product_id,
      p_quantity: qty,
      p_notes: returnNotes.trim() || null,
    });

    setReturning(false);

    if (rpcError) {
      setReturnError(rpcError.message);
      return;
    }

    setReturnModalOpen(false);
    setReturnMaterial(null);
    setReturnQty('');
    setReturnNotes('');
    router.refresh();
  }

  async function handleSaveDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) {
      setDetailsError('Project name is required.');
      return;
    }

    setSavingDetails(true);
    setDetailsError('');
    setDetailsSuccess('');

    const { error: rpcError } = await supabase.rpc('upsert_project', {
      p_id: project.id,
      p_project_code: project.project_code,
      p_name: editName.trim(),
      p_customer_id: editCustomerId || null,
      p_site_address: editSiteAddress.trim() || null,
      p_start_date: editStartDate || null,
      p_expected_end_date: editEndDate || null,
      p_status: project.status,
      p_notes: editNotes.trim() || null,
    });

    setSavingDetails(false);

    if (rpcError) {
      setDetailsError(rpcError.message);
      return;
    }

    setDetailsSuccess('Project details updated successfully.');
    setProject((prev) => ({
      ...prev,
      name: editName.trim(),
      customer_id: editCustomerId || null,
      site_address: editSiteAddress.trim() || null,
      start_date: editStartDate || null,
      expected_end_date: editEndDate || null,
      notes: editNotes.trim() || null,
    }));
    setTimeout(() => setDetailsSuccess(''), 2500);
    router.refresh();
  }

  return (
    <div>
      <button
        className="subtle-button"
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18 }}
        onClick={() => router.push('/dashboard/projects')}
      >
        <ArrowLeft size={14} /> Back to Projects
      </button>

      {/* Header */}
      <div className="inv-header" style={{ marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="badge blue" style={{ fontFamily: 'monospace', letterSpacing: 0.5 }}>
              {project.project_code}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>&bull;</span>
            <span className="muted" style={{ fontSize: 12 }}>
              Client: {project.customers?.name ?? 'Direct Contract'}
            </span>
          </div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{project.name}</h1>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 4 }}>
            {project.site_address && (
              <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 5, margin: 0 }}>
                <MapPin size={13} /> {project.site_address}
              </p>
            )}
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Timeline: {fmtDate(project.start_date)} &rarr; {fmtDate(project.expected_end_date)}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            className="select-input"
            value={project.status}
            disabled={updatingStatus}
            onChange={(e) => handleStatusChange(e.target.value as ProjectStatus)}
          >
            <option value="active">Status: Active</option>
            <option value="planning">Status: Planning</option>
            <option value="on_hold">Status: On Hold</option>
            <option value="completed">Status: Completed</option>
            <option value="cancelled">Status: Cancelled</option>
          </select>

          {(userRole === 'owner' || userRole === 'manager') && (
            <button
              className="primary-button"
              style={{ gap: 6 }}
              onClick={() => {
                setIssueModalOpen(true);
                setIssueError('');
              }}
            >
              <TrendingUp size={15} /> Issue Materials
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div
        className="detail-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div className="detail-box panel" style={{ padding: '16px 18px' }}>
          <div className="eyebrow">NET MATERIAL COST</div>
          <div style={{ font: '700 22px Manrope, sans-serif', letterSpacing: '-0.5px', marginTop: 6, color: '#246bfd' }}>
            {money(totalCostSnapshot)}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Snapshot value on job site
          </div>
        </div>

        <div className="detail-box panel" style={{ padding: '16px 18px' }}>
          <div className="eyebrow">ITEMS ON SITE</div>
          <div style={{ font: '700 22px Manrope, sans-serif', letterSpacing: '-0.5px', marginTop: 6 }}>
            {materials.filter((m) => m.quantity_issued > m.quantity_returned).length}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Distinct catalogue lines
          </div>
        </div>

        <div className="detail-box panel" style={{ padding: '16px 18px' }}>
          <div className="eyebrow">TOTAL UNITS ISSUED</div>
          <div style={{ font: '700 22px Manrope, sans-serif', letterSpacing: '-0.5px', marginTop: 6, color: '#139b72' }}>
            {totalUnitsIssued}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Dispatched from warehouse
          </div>
        </div>

        <div className="detail-box panel" style={{ padding: '16px 18px' }}>
          <div className="eyebrow">UNITS RETURNED</div>
          <div style={{ font: '700 22px Manrope, sans-serif', letterSpacing: '-0.5px', marginTop: 6, color: totalUnitsReturned > 0 ? '#c98724' : 'var(--muted)' }}>
            {totalUnitsReturned}
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            Surplus back to warehouse
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        <button
          className={`tab ${activeTab === 'materials' ? 'active' : ''}`}
          onClick={() => setActiveTab('materials')}
        >
          Materials on Site ({materials.length})
        </button>
        <button
          className={`tab ${activeTab === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveTab('ledger')}
        >
          Material Movements & Ledger ({transactions.length})
        </button>
        <button
          className={`tab ${activeTab === 'details' ? 'active' : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Project Details & Scope
        </button>
      </div>

      {/* Tab 1: Materials on Site */}
      {activeTab === 'materials' && (
        <div className="table-wrap">
          {materials.length === 0 ? (
            <div className="empty-table">
              <Package size={32} />
              <p><strong>No materials issued to this project yet</strong></p>
              <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                Issue cables, MCBs, conduit pipes, switches, and electrical accessories directly to this job.
              </p>
              {(userRole === 'owner' || userRole === 'manager') && (
                <button
                  className="primary-button"
                  style={{ marginTop: 14 }}
                  onClick={() => setIssueModalOpen(true)}
                >
                  <TrendingUp size={14} /> Issue First Material
                </button>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>MATERIAL / ITEM</th>
                  <th>ISSUED</th>
                  <th>RETURNED</th>
                  <th>NET ON SITE</th>
                  <th>SNAPSHOT COST</th>
                  <th>NET VALUE</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((m) => {
                  const net = Math.max(0, m.quantity_issued - m.quantity_returned);
                  const lineVal = net * m.unit_cost_snapshot;
                  const unitStr = m.products?.unit ?? 'pcs';

                  return (
                    <tr key={m.id}>
                      <td>
                        <strong style={{ fontSize: 13, color: 'var(--text)' }}>
                          {m.products?.name ?? 'Unknown product'}
                        </strong>
                        {m.products?.sku && (
                          <div className="muted" style={{ fontSize: 11 }}>
                            {m.products.sku}
                          </div>
                        )}
                      </td>
                      <td>
                        <span style={{ fontWeight: 600 }}>{m.quantity_issued}</span>{' '}
                        <span className="muted" style={{ fontSize: 11 }}>{unitStr}</span>
                      </td>
                      <td>
                        <span style={{ color: m.quantity_returned > 0 ? '#c98724' : 'var(--muted)' }}>
                          {m.quantity_returned} {unitStr}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${net > 0 ? 'green' : 'grey'}`}
                          style={{ fontSize: 11, padding: '3px 7px' }}
                        >
                          {net} {unitStr}
                        </span>
                      </td>
                      <td>{money(m.unit_cost_snapshot)}</td>
                      <td>
                        <strong style={{ color: 'var(--text)' }}>{money(lineVal)}</strong>
                      </td>
                      <td className="actions">
                        {net > 0 && (userRole === 'owner' || userRole === 'manager') && (
                          <button
                            className="subtle-button"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px' }}
                            onClick={() => openReturn(m)}
                            title="Return unused surplus back to warehouse stock"
                          >
                            <RotateCcw size={12} /> Return Surplus
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 2: Material Movements */}
      {activeTab === 'ledger' && (
        <div className="table-wrap">
          {transactions.length === 0 ? (
            <div className="empty-table">
              <BriefcaseBusiness size={32} />
              <p><strong>No movements recorded for this project</strong></p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>DATE & TIME</th>
                  <th>ACTION</th>
                  <th>PRODUCT</th>
                  <th>QUANTITY</th>
                  <th>UNIT COST</th>
                  <th>NOTES</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const isIssue = tx.transaction_type === 'issue';
                  return (
                    <tr key={tx.id}>
                      <td>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {fmtDateTime(tx.created_at)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${isIssue ? 'blue' : 'amber'}`}>
                          {isIssue ? 'Material Issued' : 'Surplus Returned'}
                        </span>
                      </td>
                      <td>
                        <strong>{tx.products?.name ?? 'Product'}</strong>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: isIssue ? '#246bfd' : '#c98724' }}>
                          {isIssue ? '-' : '+'}{tx.quantity} {tx.products?.unit ?? 'pcs'}
                        </span>
                      </td>
                      <td>{money(Number(tx.unit_cost))}</td>
                      <td>
                        <span className="muted" style={{ fontSize: 12 }}>
                          {tx.notes || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Details & Settings */}
      {activeTab === 'details' && (
        <div className="panel" style={{ maxWidth: 640 }}>
          <div className="panel-heading" style={{ marginBottom: 16 }}>
            <div>
              <h2>Edit Project Details</h2>
              <p>Update site address, timeline, client assignment, or work scope</p>
            </div>
          </div>

          <form className="form-stack" onSubmit={handleSaveDetails}>
            <label>
              Project Title *
              <div className="input-wrap">
                <input
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
            </label>

            <label>
              Client / Customer
              <div style={{ marginTop: 7 }}>
                <select
                  className="select-input"
                  style={{ width: '100%', height: 43 }}
                  value={editCustomerId}
                  onChange={(e) => setEditCustomerId(e.target.value)}
                >
                  <option value="">— Direct / Self-contracted —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label>
              Job Site Address
              <div className="input-wrap">
                <MapPin size={15} />
                <input
                  value={editSiteAddress}
                  onChange={(e) => setEditSiteAddress(e.target.value)}
                />
              </div>
            </label>

            <div className="form-row">
              <label>
                Start Date
                <div className="input-wrap">
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                  />
                </div>
              </label>
              <label>
                Expected Completion Date
                <div className="input-wrap">
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                  />
                </div>
              </label>
            </div>

            <label>
              Internal Scope Notes
              <div className="input-wrap">
                <input
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                />
              </div>
            </label>

            {detailsError && <div className="notice error">{detailsError}</div>}
            {detailsSuccess && <div className="notice">{detailsSuccess}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="submit" className="primary-button" disabled={savingDetails}>
                {savingDetails ? <Loader2 className="spin" size={15} /> : null}
                Save Project Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Issue Material */}
      {issueModalOpen && (
        <div className="modal-overlay" onClick={() => setIssueModalOpen(false)}>
          <div className="modal" style={{ width: 'min(100%, 500px)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <p className="eyebrow" style={{ margin: '0 0 4px' }}>DISPATCH TO SITE</p>
                <h2 style={{ margin: 0 }}>Issue Material</h2>
              </div>
              <button className="icon-btn" onClick={() => setIssueModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form className="form-stack" onSubmit={handleIssue}>
              <label>
                Select Product / Material *
                <div style={{ marginTop: 7 }}>
                  <select
                    className="select-input"
                    style={{ width: '100%', height: 43 }}
                    required
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                  >
                    <option value="">— Choose material from warehouse —</option>
                    {availableProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.current_stock} {p.unit} in stock)
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              {selectedProduct && (
                <div
                  style={{
                    background: '#f8fafd',
                    border: '1px solid var(--line)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                  }}
                >
                  <div>
                    <span className="muted">Warehouse Stock: </span>
                    <strong style={{ color: selectedProduct.current_stock > 0 ? '#139b72' : '#c0392b' }}>
                      {selectedProduct.current_stock} {selectedProduct.unit}
                    </strong>
                  </div>
                  <div>
                    <span className="muted">Cost Snapshot: </span>
                    <strong>{money(selectedProduct.cost_price)}</strong>
                  </div>
                </div>
              )}

              <label>
                Quantity to Issue *
                <div className="input-wrap">
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    required
                    placeholder={`e.g. 50 ${selectedProduct?.unit ?? 'units'}`}
                    value={issueQty}
                    onChange={(e) => setIssueQty(e.target.value)}
                  />
                </div>
              </label>

              <label>
                Dispatch Notes (Optional)
                <div className="input-wrap">
                  <input
                    placeholder="Dispatched via delivery van, received by site engineer..."
                    value={issueNotes}
                    onChange={(e) => setIssueNotes(e.target.value)}
                  />
                </div>
              </label>

              {issueError && <div className="notice error">{issueError}</div>}

              <div className="modal-actions" style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="subtle-button"
                  onClick={() => setIssueModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={issuing}>
                  {issuing ? <Loader2 className="spin" size={15} /> : null}
                  Confirm & Deduct Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Return Material */}
      {returnModalOpen && returnMaterial && (
        <div className="modal-overlay" onClick={() => setReturnModalOpen(false)}>
          <div className="modal" style={{ width: 'min(100%, 500px)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <p className="eyebrow" style={{ margin: '0 0 4px' }}>SURPLUS RETURN</p>
                <h2 style={{ margin: 0 }}>Return Material to Stock</h2>
              </div>
              <button className="icon-btn" onClick={() => setReturnModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <form className="form-stack" onSubmit={handleReturn}>
              <div
                style={{
                  background: '#f8fafd',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  fontSize: 12,
                }}
              >
                <strong style={{ display: 'block', fontSize: 13, marginBottom: 4 }}>
                  {returnMaterial.products?.name}
                </strong>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}>
                  <span>Currently on site: </span>
                  <strong style={{ color: '#246bfd' }}>
                    {Math.max(0, returnMaterial.quantity_issued - returnMaterial.quantity_returned)}{' '}
                    {returnMaterial.products?.unit ?? 'pcs'}
                  </strong>
                </div>
              </div>

              <label>
                Quantity to Return *
                <div className="input-wrap">
                  <input
                    type="number"
                    step="any"
                    min="0.001"
                    max={Math.max(0, returnMaterial.quantity_issued - returnMaterial.quantity_returned)}
                    required
                    value={returnQty}
                    onChange={(e) => setReturnQty(e.target.value)}
                  />
                </div>
              </label>

              <label>
                Return Notes (Optional)
                <div className="input-wrap">
                  <input
                    placeholder="Surplus left over after completion, returned by site team..."
                    value={returnNotes}
                    onChange={(e) => setReturnNotes(e.target.value)}
                  />
                </div>
              </label>

              {returnError && <div className="notice error">{returnError}</div>}

              <div className="modal-actions" style={{ marginTop: 18 }}>
                <button
                  type="button"
                  className="subtle-button"
                  onClick={() => setReturnModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={returning}>
                  {returning ? <Loader2 className="spin" size={15} /> : null}
                  Confirm & Restore Stock
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
