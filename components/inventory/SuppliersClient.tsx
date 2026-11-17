'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Supplier } from '@/lib/types/inventory'
import { Search, Plus, Pencil, Trash2, Loader2, X } from 'lucide-react'
import DeleteConfirmModal from '@/components/inventory/DeleteConfirmModal'

interface Props {
  suppliers: Supplier[]
  userRole: string
}

const EMPTY: Partial<Supplier> = {
  name: '',
  contact_person: '',
  phone: '',
  email: '',
  gstin: '',
  address: '',
  notes: '',
}

export default function SuppliersClient({ suppliers: initial, userRole }: Props) {
  const supabase = createClient()

  const [suppliers, setSuppliers] = useState<Supplier[]>(initial)
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [form, setForm] = useState<Partial<Supplier>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.phone ?? '').toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q)
    )
  }, [suppliers, query])

  function openAdd() {
    setEditing(null)
    setForm(EMPTY)
    setFormError('')
    setShowForm(true)
  }

  function openEdit(s: Supplier) {
    setEditing(s)
    setForm({ ...s })
    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setForm(EMPTY)
    setFormError('')
  }

  function field(key: keyof Supplier) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name?.trim()) { setFormError('Name is required.'); return }
    setSaving(true)
    setFormError('')
    const { data, error } = await supabase.rpc('upsert_supplier', {
      p_id: editing?.id ?? null,
      p_name: form.name.trim(),
      p_contact_person: form.contact_person?.trim() || null,
      p_phone: form.phone?.trim() || null,
      p_email: form.email?.trim() || null,
      p_gstin: form.gstin?.trim() || null,
      p_address: form.address?.trim() || null,
      p_notes: form.notes?.trim() || null,
    })
    setSaving(false)
    if (error) { setFormError(error.message); return }
    const supplierId = (data as unknown as string) || editing?.id || ''
    const saved: Supplier = {
      id: supplierId,
      business_id: editing?.business_id || '',
      name: form.name!.trim(),
      contact_person: form.contact_person?.trim() || null,
      phone: form.phone?.trim() || null,
      email: form.email?.trim() || null,
      gstin: form.gstin?.trim() || null,
      address: form.address?.trim() || null,
      notes: form.notes?.trim() || null,
      created_at: editing?.created_at || new Date().toISOString(),
    }
    if (editing) {
      setSuppliers(ss => ss.map(s => s.id === saved.id ? saved : s))
    } else {
      setSuppliers(ss => [...ss, saved].sort((a, b) => a.name.localeCompare(b.name)))
    }
    closeForm()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) {
      if (error.code === '23503') {
        setDeleteError('Cannot delete — this supplier is linked to existing purchases.')
      } else {
        setDeleteError(error.message)
      }
      return
    }
    setSuppliers(ss => ss.filter(s => s.id !== deleteTarget.id))
    setDeleteTarget(null)
  }

  return (
    <div>
      <div className="tab-bar">
        <Link href="/dashboard/inventory" className="tab">
          Products
        </Link>
        <Link href="/dashboard/inventory/categories" className="tab">
          Categories
        </Link>
        <Link href="/dashboard/inventory/suppliers" className="tab active">
          Suppliers
        </Link>
        <Link href="/dashboard/inventory/purchases" className="tab">
          Purchases
        </Link>
      </div>
      <div className="inv-header">
        <div>
          <p className="eyebrow">INVENTORY &bull; SUPPLIERS</p>
          <h1>Suppliers</h1>
          <p className="muted">{suppliers.length} vendor{suppliers.length !== 1 ? 's' : ''} in directory</p>
        </div>
        <button className="primary-button" onClick={openAdd}>
          <Plus size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Add supplier
        </button>
      </div>

      {/* Inline form panel */}
      {showForm && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span className="section-heading">{editing ? 'Edit Supplier' : 'New Supplier'}</span>
            <button className="icon-btn" onClick={closeForm} aria-label="Close"><X size={16} /></button>
          </div>
          <form onSubmit={handleSave}>
            <div className="form-stack">
              <div className="form-row">
                <div className="input-wrap">
                  <label>Name *</label>
                  <input value={form.name ?? ''} onChange={field('name')} placeholder="Supplier name" required />
                </div>
                <div className="input-wrap">
                  <label>Contact Person</label>
                  <input value={form.contact_person ?? ''} onChange={field('contact_person')} placeholder="Contact name" />
                </div>
              </div>
              <div className="form-row">
                <div className="input-wrap">
                  <label>Phone</label>
                  <input value={form.phone ?? ''} onChange={field('phone')} placeholder="+91 98765 43210" />
                </div>
                <div className="input-wrap">
                  <label>Email</label>
                  <input type="email" value={form.email ?? ''} onChange={field('email')} placeholder="supplier@example.com" />
                </div>
              </div>
              <div className="form-row">
                <div className="input-wrap">
                  <label>GSTIN</label>
                  <input value={form.gstin ?? ''} onChange={field('gstin')} placeholder="27AAAAA0000A1Z5" />
                </div>
                <div className="input-wrap">
                  <label>Address</label>
                  <input value={form.address ?? ''} onChange={field('address')} placeholder="City, State" />
                </div>
              </div>
              <div className="input-wrap">
                <label>Notes</label>
                <textarea value={form.notes ?? ''} onChange={field('notes')} rows={2} placeholder="Internal notes…" />
              </div>
              {formError && <div className="notice error">{formError}</div>}
              <div className="modal-actions" style={{ justifyContent: 'flex-start' }}>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? <Loader2 size={14} className="spin" style={{ marginRight: 6 }} /> : null}
                  {editing ? 'Save Changes' : 'Add Supplier'}
                </button>
                <button type="button" className="subtle-button" onClick={closeForm}>Cancel</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Toolbar */}
      <div className="inv-toolbar">
        <label className="inv-search">
          <Search size={15} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search suppliers…"
          />
        </label>
      </div>

      {/* Table */}
      {suppliers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏢</div>
          <p>No suppliers yet. Add your first supplier.</p>
          <button className="primary-button" onClick={openAdd}>+ Add supplier</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>CONTACT PERSON</th>
                <th>PHONE</th>
                <th>EMAIL</th>
                <th>GSTIN</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
                    No suppliers match your search.
                  </td>
                </tr>
              ) : filtered.map(s => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 600 }}>{s.name}</td>
                  <td>{s.contact_person ?? <span className="muted">—</span>}</td>
                  <td>{s.phone ?? <span className="muted">—</span>}</td>
                  <td>{s.email ?? <span className="muted">—</span>}</td>
                  <td>{s.gstin ?? <span className="muted">—</span>}</td>
                  <td>
                    <div className="actions">
                      <button className="icon-btn" onClick={() => openEdit(s)} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button className="icon-btn" onClick={() => { setDeleteError(''); setDeleteTarget(s) }} title="Delete" style={{ color: '#c0392b' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete modal */}
      {deleteTarget && (
        <>
          {deleteError && (
            <div className="notice error" style={{ marginTop: 12 }}>{deleteError}</div>
          )}
          <DeleteConfirmModal
            open={!!deleteTarget}
            title="Delete Supplier"
            message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
            onConfirm={handleDelete}
            onCancel={() => { setDeleteTarget(null); setDeleteError('') }}
            busy={deleting}
            destructive
          />
        </>
      )}
    </div>
  )
}
