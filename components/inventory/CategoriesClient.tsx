'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Category } from '@/lib/types/inventory'
import { Search, Plus, Pencil, Trash2, Loader2, X } from 'lucide-react'
import DeleteConfirmModal from '@/components/inventory/DeleteConfirmModal'

interface Props {
  categories: Category[]
  productCounts: Record<string, number>
  userRole: string
}

export default function CategoriesClient({ categories: initial, productCounts, userRole }: Props) {
  const supabase = createClient()

  const [categories, setCategories] = useState<Category[]>(initial)
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [counts, setCounts] = useState<Record<string, number>>(productCounts)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return categories
    return categories.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.description ?? '').toLowerCase().includes(q)
    )
  }, [categories, query])

  function openAdd() {
    setEditing(null)
    setFormName('')
    setFormDesc('')
    setFormError('')
    setShowForm(true)
  }

  function openEdit(c: Category) {
    setEditing(c)
    setFormName(c.name)
    setFormDesc(c.description ?? '')
    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setFormName('')
    setFormDesc('')
    setFormError('')
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) { setFormError('Name is required.'); return }
    setSaving(true)
    setFormError('')
    const { data, error } = await supabase.rpc('upsert_category', {
      p_id: editing?.id ?? null,
      p_name: formName.trim(),
      p_description: formDesc.trim() || null,
    })
    setSaving(false)
    if (error) { setFormError(error.message); return }
    const categoryId = (data as unknown as string) || editing?.id || ''
    const saved: Category = {
      id: categoryId,
      business_id: editing?.business_id || '',
      name: formName.trim(),
      description: formDesc.trim() || null,
      created_at: editing?.created_at || new Date().toISOString(),
    }
    if (editing) {
      setCategories(cs => cs.map(c => c.id === saved.id ? saved : c))
    } else {
      setCategories(cs => [...cs, saved].sort((a, b) => a.name.localeCompare(b.name)))
    }
    closeForm()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { error } = await supabase.from('categories').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (error) { setDeleteError(error.message); return }
    setCategories(cs => cs.filter(c => c.id !== deleteTarget.id))
    setDeleteTarget(null)
    setDeleteError('')
  }

  function tryDelete(c: Category) {
    setDeleteError('')
    if ((counts[c.id] ?? 0) > 0) {
      setDeleteError(`Cannot delete "${c.name}" — reassign its ${counts[c.id]} product(s) first.`)
      return
    }
    setDeleteTarget(c)
  }

  return (
    <div>
      <div className="tab-bar">
        <Link href="/dashboard/inventory" className="tab">
          Products
        </Link>
        <Link href="/dashboard/inventory/categories" className="tab active">
          Categories
        </Link>
        <Link href="/dashboard/inventory/suppliers" className="tab">
          Suppliers
        </Link>
        <Link href="/dashboard/inventory/purchases" className="tab">
          Purchases
        </Link>
      </div>
      <div className="inv-header">
        <div>
          <p className="eyebrow">INVENTORY &bull; CATEGORIES</p>
          <h1>Categories</h1>
          <p className="muted">{categories.length} categor{categories.length !== 1 ? 'ies' : 'y'} configured</p>
        </div>
        <button className="primary-button" onClick={openAdd}>
          <Plus size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          Add category
        </button>
      </div>

      {/* Inline form panel */}
      {showForm && (
        <div className="panel" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span className="section-heading">{editing ? 'Edit Category' : 'New Category'}</span>
            <button className="icon-btn" onClick={closeForm} aria-label="Close"><X size={16} /></button>
          </div>
          <form onSubmit={handleSave}>
            <div className="form-stack">
              <div className="input-wrap">
                <label>Name *</label>
                <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Category name" required />
              </div>
              <div className="input-wrap">
                <label>Description</label>
                <textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} rows={2} placeholder="Optional description…" />
              </div>
              {formError && <div className="notice error">{formError}</div>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? <Loader2 size={14} className="spin" style={{ marginRight: 6 }} /> : null}
                  {editing ? 'Save Changes' : 'Add Category'}
                </button>
                <button type="button" className="subtle-button" onClick={closeForm}>Cancel</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Delete error notice */}
      {deleteError && (
        <div className="notice error" style={{ marginBottom: 16 }}>{deleteError}</div>
      )}

      {/* Toolbar */}
      <div className="inv-toolbar">
        <label className="inv-search">
          <Search size={15} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search categories…"
          />
        </label>
      </div>

      {/* Table */}
      {categories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🏷️</div>
          <p>No categories yet.</p>
          <button className="primary-button" onClick={openAdd}>+ Add category</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>NAME</th>
                <th>DESCRIPTION</th>
                <th>PRODUCTS</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}>
                    No categories match your search.
                  </td>
                </tr>
              ) : filtered.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td>{c.description ?? <span className="muted">—</span>}</td>
                  <td>
                    <span className="badge grey">{counts[c.id] ?? 0}</span>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="icon-btn" onClick={() => openEdit(c)} title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button className="icon-btn" onClick={() => tryDelete(c)} title="Delete" style={{ color: '#c0392b' }}>
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
        <DeleteConfirmModal
          open={!!deleteTarget}
          title="Delete Category"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          busy={deleting}
          destructive
        />
      )}
    </div>
  )
}
