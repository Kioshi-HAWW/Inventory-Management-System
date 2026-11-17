'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  Users,
  Building2,
  Phone,
  Mail,
  MapPin,
  Edit2,
  Loader2,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Customer } from '@/lib/types/projects';

interface Props {
  customers: Customer[];
  userRole: string;
}

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export default function CustomersClient({ customers: initialCustomers, userRole }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter((c) => {
      const matchName = (c.name || '').toLowerCase().includes(q);
      const matchPhone = (c.phone || '').toLowerCase().includes(q);
      const matchEmail = (c.email || '').toLowerCase().includes(q);
      const matchGstin = (c.gstin || '').toLowerCase().includes(q);
      const matchCity = (c.billing_address || '').toLowerCase().includes(q);
      return matchName || matchPhone || matchEmail || matchGstin || matchCity;
    });
  }, [customers, query]);

  function openCreate() {
    setEditingCustomer(null);
    setName('');
    setPhone('');
    setEmail('');
    setGstin('');
    setBillingAddress('');
    setShippingAddress('');
    setNotes('');
    setError('');
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditingCustomer(c);
    setName(c.name || '');
    setPhone(c.phone || '');
    setEmail(c.email || '');
    setGstin(c.gstin || '');
    setBillingAddress(c.billing_address || '');
    setShippingAddress(c.shipping_address || '');
    setNotes(c.notes || '');
    setError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingCustomer(null);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Customer name or company name is required.');
      return;
    }

    setSaving(true);
    setError('');

    const params: Record<string, unknown> = {
      p_name: name.trim(),
      p_phone: phone.trim() || null,
      p_email: email.trim() || null,
      p_gstin: gstin.trim().toUpperCase() || null,
      p_billing_address: billingAddress.trim() || null,
      p_shipping_address: shippingAddress.trim() || null,
      p_notes: notes.trim() || null,
    };

    if (editingCustomer) {
      params.p_id = editingCustomer.id;
    }

    const { data: newId, error: rpcError } = await supabase.rpc('upsert_customer', params);
    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    if (editingCustomer) {
      setCustomers((prev) =>
        prev.map((c) =>
          c.id === editingCustomer.id
            ? {
                ...c,
                name: name.trim(),
                phone: phone.trim() || null,
                email: email.trim() || null,
                gstin: gstin.trim().toUpperCase() || null,
                billing_address: billingAddress.trim() || null,
                shipping_address: shippingAddress.trim() || null,
                notes: notes.trim() || null,
              }
            : c
        )
      );
    } else if (newId) {
      const newCustomer: Customer = {
        id: newId as string,
        business_id: '',
        name: name.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        gstin: gstin.trim().toUpperCase() || null,
        billing_address: billingAddress.trim() || null,
        shipping_address: shippingAddress.trim() || null,
        notes: notes.trim() || null,
        created_at: new Date().toISOString(),
      };
      setCustomers((prev) => [newCustomer, ...prev]);
    }

    closeModal();
    router.refresh();
  }

  return (
    <div>
      <div className="inv-header">
        <div>
          <p className="eyebrow">DIRECTORY &bull; CLIENTS</p>
          <h1>Customers & Clients</h1>
          <p className="muted">Manage corporate clients, builders, facility managers, and direct project accounts</p>
        </div>
        {(userRole === 'owner' || userRole === 'manager') && (
          <button className="primary-button" onClick={openCreate}>
            <Plus size={15} /> Add Customer
          </button>
        )}
      </div>

      <div className="inv-toolbar">
        <div className="inv-search">
          <Search size={15} />
          <input
            placeholder="Search by customer name, phone, GSTIN, city..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
        </span>
      </div>

      <div className="table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-table">
            <Users size={32} />
            <p><strong>No customer records found</strong></p>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {query ? 'No customers match your search.' : 'Add your first customer to assign projects and generate invoices.'}
            </p>
            {!query && (userRole === 'owner' || userRole === 'manager') && (
              <button className="primary-button" style={{ marginTop: 14 }} onClick={openCreate}>
                <Plus size={14} /> Add First Customer
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>CLIENT / COMPANY</th>
                <th>CONTACT</th>
                <th>GSTIN</th>
                <th>BILLING ADDRESS</th>
                <th>ADDED</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div className="product-icon" style={{ background: '#f0f4ff', color: '#246bfd' }}>
                        <Building2 size={16} />
                      </div>
                      <div>
                        <strong style={{ fontSize: 13, color: 'var(--text)' }}>{c.name}</strong>
                        {c.notes && (
                          <div className="muted" style={{ fontSize: 11, maxWidth: 220, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {c.notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div>
                      {c.phone && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
                          <Phone size={12} className="muted" />
                          <span>{c.phone}</span>
                        </div>
                      )}
                      {c.email && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                          <Mail size={12} />
                          <span>{c.email}</span>
                        </div>
                      )}
                      {!c.phone && !c.email && <span className="muted">—</span>}
                    </div>
                  </td>
                  <td>
                    {c.gstin ? (
                      <span className="badge blue" style={{ fontFamily: 'monospace', letterSpacing: 0.5 }}>
                        {c.gstin}
                      </span>
                    ) : (
                      <span className="muted" style={{ fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td>
                    {c.billing_address ? (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 12, maxWidth: 260 }}>
                        <MapPin size={13} className="muted" style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ color: '#4a5568', lineHeight: 1.4 }}>{c.billing_address}</span>
                      </div>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {fmtDate(c.created_at)}
                    </span>
                  </td>
                  <td className="actions">
                    <button
                      className="subtle-button"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px' }}
                      onClick={() => openEdit(c)}
                    >
                      <Edit2 size={12} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Customer Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ width: 'min(100%, 540px)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <p className="eyebrow" style={{ margin: '0 0 4px' }}>
                  {editingCustomer ? 'UPDATE CUSTOMER' : 'NEW CUSTOMER'}
                </p>
                <h2 style={{ margin: 0 }}>
                  {editingCustomer ? editingCustomer.name : 'Add Customer / Client'}
                </h2>
              </div>
              <button className="icon-btn" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            <form className="form-stack" onSubmit={handleSubmit}>
              <label>
                Client / Company Name *
                <div className="input-wrap">
                  <Building2 size={16} />
                  <input
                    required
                    placeholder="e.g. Prestige Estates Projects Ltd."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </label>

              <div className="form-row">
                <label>
                  Contact Phone
                  <div className="input-wrap">
                    <Phone size={15} />
                    <input
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                </label>
                <label>
                  Email Address
                  <div className="input-wrap">
                    <Mail size={15} />
                    <input
                      type="email"
                      placeholder="accounts@client.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </label>
              </div>

              <label>
                GSTIN (Tax Registration)
                <div className="input-wrap">
                  <FileSpreadsheet size={15} />
                  <input
                    placeholder="e.g. 29AAAAA0000A1Z5"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  />
                </div>
              </label>

              <label>
                Billing Address
                <div className="input-wrap">
                  <MapPin size={15} />
                  <input
                    placeholder="Registered billing address for invoices..."
                    value={billingAddress}
                    onChange={(e) => setBillingAddress(e.target.value)}
                  />
                </div>
              </label>

              <label>
                Site / Shipping Address (Optional)
                <div className="input-wrap">
                  <MapPin size={15} />
                  <input
                    placeholder="Default job site or material delivery address..."
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                  />
                </div>
              </label>

              <label>
                Internal Notes
                <div className="input-wrap">
                  <input
                    placeholder="Contract terms, site contact person, billing cycle..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </label>

              {error && <div className="notice error">{error}</div>}

              <div className="modal-actions" style={{ marginTop: 18 }}>
                <button type="button" className="subtle-button" onClick={closeModal}>
                  Cancel
                </button>
                <button type="submit" className="primary-button" disabled={saving}>
                  {saving ? <Loader2 className="spin" size={15} /> : null}
                  {editingCustomer ? 'Update Customer' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
