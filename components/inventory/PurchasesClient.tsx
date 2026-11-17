'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Search, Plus, ShoppingCart, Eye, Loader2, X, Calendar, Building2 } from 'lucide-react'

interface PurchaseItemView {
  id: string
  quantity: number
  unit_cost: number
  line_total: number
  product_id: string
  products?: { name: string; unit: string } | null
}

interface PurchaseRow {
  id: string
  purchase_number: string
  purchase_date: string
  total_amount: number
  discount_amount?: number
  payment_status?: string
  notes: string | null
  created_at: string
  supplier_id: string | null
  suppliers?: { name: string } | { name: string }[] | null
}

interface Props {
  purchases: PurchaseRow[]
}

const money = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

function getSupplierName(p: PurchaseRow): string | null {
  if (!p.suppliers) return null
  if (Array.isArray(p.suppliers)) return p.suppliers[0]?.name ?? null
  return (p.suppliers as { name: string }).name ?? null
}

export default function PurchasesClient({ purchases: initialPurchases }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [purchases] = useState<PurchaseRow[]>(initialPurchases)
  const [query, setQuery] = useState('')
  const [selectedPurchase, setSelectedPurchase] = useState<PurchaseRow | null>(null)
  const [items, setItems] = useState<PurchaseItemView[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [itemsError, setItemsError] = useState('')

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return purchases
    return purchases.filter((p) => {
      const pNum = (p.purchase_number ?? '').toLowerCase()
      const sName = (getSupplierName(p) ?? '').toLowerCase()
      const notes = (p.notes ?? '').toLowerCase()
      return pNum.includes(q) || sName.includes(q) || notes.includes(q)
    })
  }, [purchases, query])

  async function openDetails(p: PurchaseRow) {
    setSelectedPurchase(p)
    setLoadingItems(true)
    setItemsError('')
    setItems([])

    const { data, error } = await supabase
      .from('purchase_items')
      .select('id,quantity,unit_cost,line_total,product_id,products(name,unit)')
      .eq('purchase_id', p.id)

    setLoadingItems(false)
    if (error) {
      setItemsError(error.message)
    } else {
      setItems((data as unknown as PurchaseItemView[]) ?? [])
    }
  }

  function closeDetails() {
    setSelectedPurchase(null)
    setItems([])
    setItemsError('')
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
        <Link href="/dashboard/inventory/purchases" className="tab active">
          Purchases
        </Link>
      </div>

      <div className="inv-header">
        <div>
          <p className="eyebrow">INVENTORY &bull; PURCHASES</p>
          <h1>Purchase Orders</h1>
          <p className="muted">Track stock receipts, supplier bills and purchase price records</p>
        </div>
        <button
          className="primary-button"
          onClick={() => router.push('/dashboard/inventory/purchases/new')}
        >
          <Plus size={15} /> Record Purchase
        </button>
      </div>

      <div className="inv-toolbar">
        <div className="inv-search">
          <Search size={15} />
          <input
            placeholder="Search by PO number, supplier, or notes..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
        </span>
      </div>

      <div className="table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-table">
            <ShoppingCart size={32} />
            <p><strong>No purchase records found</strong></p>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {query ? 'No purchases match your search query.' : 'Record your first supplier purchase to stock your inventory.'}
            </p>
            {!query && (
              <button
                className="primary-button"
                style={{ marginTop: 14 }}
                onClick={() => router.push('/dashboard/inventory/purchases/new')}
              >
                <Plus size={14} /> Record First Purchase
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>PO NUMBER</th>
                <th>DATE</th>
                <th>SUPPLIER</th>
                <th>STATUS</th>
                <th>TOTAL AMOUNT</th>
                <th>NOTES</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const status = (p.payment_status || 'paid').toLowerCase()
                const badgeCls = status === 'paid' ? 'green' : status === 'partially_paid' ? 'amber' : 'red'
                const statusLabel = status === 'paid' ? 'Paid' : status === 'partially_paid' ? 'Partial' : 'Unpaid'

                return (
                  <tr key={p.id}>
                    <td>
                      <strong style={{ fontFamily: 'Manrope, sans-serif' }}>{p.purchase_number}</strong>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Calendar size={13} className="muted" />
                        {fmtDate(p.purchase_date)}
                      </span>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <Building2 size={13} className="muted" />
                        {getSupplierName(p) ?? <span className="muted">Direct / Unspecified</span>}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${badgeCls}`} style={{ textTransform: 'capitalize' }}>
                        {statusLabel}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                        {money(Number(p.total_amount ?? 0))}
                      </span>
                    </td>
                    <td>
                      <span className="muted" style={{ fontSize: 12 }}>
                        {p.notes || '—'}
                      </span>
                    </td>
                    <td className="actions">
                      <button
                        className="subtle-button"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px' }}
                        onClick={() => openDetails(p)}
                      >
                        <Eye size={13} /> View Items
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Purchase Line Items Modal */}
      {selectedPurchase && (
        <div className="modal-overlay" onClick={closeDetails}>
          <div
            className="modal"
            style={{ width: 'min(100%, 640px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <p className="eyebrow" style={{ margin: '0 0 4px' }}>PURCHASE DETAILS</p>
                <h2 style={{ margin: 0 }}>{selectedPurchase.purchase_number}</h2>
                <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
                  {fmtDate(selectedPurchase.purchase_date)} &bull; {getSupplierName(selectedPurchase) ?? 'Direct Purchase'}
                </p>
              </div>
              <button className="icon-btn" onClick={closeDetails}>
                <X size={18} />
              </button>
            </div>

            {loadingItems ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <Loader2 className="spin" size={24} style={{ margin: '0 auto', color: '#246bfd' }} />
                <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Loading line items...</p>
              </div>
            ) : itemsError ? (
              <div className="notice error">{itemsError}</div>
            ) : items.length === 0 ? (
              <p className="muted" style={{ textAlign: 'center', padding: '20px 0' }}>No items recorded for this purchase.</p>
            ) : (
              <div className="table-wrap" style={{ marginTop: 10, maxHeight: 320, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>PRODUCT</th>
                      <th>QUANTITY</th>
                      <th>UNIT COST</th>
                      <th style={{ textAlign: 'right' }}>LINE TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <strong>{it.products?.name ?? 'Unknown product'}</strong>
                        </td>
                        <td>
                          {it.quantity} {it.products?.unit ?? 'pcs'}
                        </td>
                        <td>
                          {money(Number(it.unit_cost))}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {money(Number(it.line_total))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 18, borderTop: '1px solid var(--line)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>Payment:</span>
                  <span className={`badge ${(selectedPurchase.payment_status || 'paid') === 'paid' ? 'green' : (selectedPurchase.payment_status || 'paid') === 'partially_paid' ? 'amber' : 'red'}`} style={{ textTransform: 'capitalize' }}>
                    {selectedPurchase.payment_status?.replace('_', ' ') || 'Paid'}
                  </span>
                </div>
                {selectedPurchase.notes && (
                  <p className="muted" style={{ fontSize: 11, margin: '4px 0 0' }}>
                    <strong>Note:</strong> {selectedPurchase.notes}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'right' }}>
                {Number(selectedPurchase.discount_amount || 0) > 0 && (
                  <p className="muted" style={{ fontSize: 11, margin: '0 0 2px' }}>
                    Discount: -{money(Number(selectedPurchase.discount_amount))}
                  </p>
                )}
                <span className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 }}>Grand Total</span>
                <p style={{ margin: '2px 0 0', font: '800 18px Manrope, sans-serif', color: 'var(--text)' }}>
                  {money(Number(selectedPurchase.total_amount ?? 0))}
                </p>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 20 }}>
              <button className="primary-button" onClick={closeDetails}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
