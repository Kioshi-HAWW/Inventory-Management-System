'use client';

import { useState, useMemo, useDeferredValue } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Plus,
  BriefcaseBusiness,
  Building2,
  Calendar,
  MapPin,
  ExternalLink,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { Project, Customer, ProjectStatus } from '@/lib/types/projects';

interface Props {
  projects: Project[];
  customers: Customer[];
  userRole: string;
}

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const STATUS_BADGE: Record<ProjectStatus, { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'green' },
  planning: { label: 'Planning', cls: 'blue' },
  on_hold: { label: 'On Hold', cls: 'amber' },
  completed: { label: 'Completed', cls: 'grey' },
  cancelled: { label: 'Cancelled', cls: 'red' },
};

function autoGenProjectCode(): string {
  const d = new Date();
  const yr = String(d.getFullYear()).slice(-2);
  const rand = Math.floor(100 + Math.random() * 900);
  return `PRJ-${yr}-${rand}`;
}

export default function ProjectsListClient({
  projects: initialProjects,
  customers,
  userRole,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [modalOpen, setModalOpen] = useState(false);

  // Form states
  const [projectCode, setProjectCode] = useState(autoGenProjectCode());
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [expectedEndDate, setExpectedEndDate] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(() => {
    const q = deferredQuery.toLowerCase().trim();
    return projects.filter((p) => {
      const matchStatus = statusFilter === 'all' || p.status === statusFilter;
      const matchSearch =
        !q ||
        p.project_code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.site_address || '').toLowerCase().includes(q) ||
        (p.customers?.name || '').toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [projects, deferredQuery, statusFilter]);

  function openCreate() {
    setProjectCode(autoGenProjectCode());
    setName('');
    setCustomerId('');
    setSiteAddress('');
    setStartDate(new Date().toISOString().split('T')[0]);
    setExpectedEndDate('');
    setStatus('active');
    setNotes('');
    setError('');
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setError('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!projectCode.trim()) {
      setError('Project code is required.');
      return;
    }
    if (!name.trim()) {
      setError('Project name is required.');
      return;
    }

    setSaving(true);
    setError('');

    const { data: newId, error: rpcError } = await supabase.rpc('upsert_project', {
      p_project_code: projectCode.trim().toUpperCase(),
      p_name: name.trim(),
      p_customer_id: customerId || null,
      p_site_address: siteAddress.trim() || null,
      p_start_date: startDate || null,
      p_expected_end_date: expectedEndDate || null,
      p_status: status,
      p_notes: notes.trim() || null,
    });

    setSaving(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    closeModal();
    if (newId) {
      router.push(`/dashboard/projects/${newId}`);
    } else {
      router.refresh();
    }
  }

  return (
    <div>
      <div className="inv-header">
        <div>
          <p className="eyebrow">CONTRACTS &bull; SITES</p>
          <h1>Projects & Work Orders</h1>
          <p className="muted">Track electrical contracting sites, commercial works, material issues, and project costs</p>
        </div>
        {(userRole === 'owner' || userRole === 'manager') && (
          <button className="primary-button" onClick={openCreate}>
            <Plus size={15} /> New Project
          </button>
        )}
      </div>

      <div className="inv-toolbar">
        <div className="inv-search">
          <Search size={15} />
          <input
            placeholder="Search by code, project name, client, site address..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <select
          className="select-input"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | ProjectStatus)}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="planning">Planning</option>
          <option value="on_hold">On Hold</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <span className="muted" style={{ fontSize: 12, marginLeft: 'auto' }}>
          {filtered.length} {filtered.length === 1 ? 'project' : 'projects'}
        </span>
      </div>

      <div className="table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-table">
            <BriefcaseBusiness size={32} />
            <p><strong>No projects found</strong></p>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              {query || statusFilter !== 'all'
                ? 'No projects match your filter criteria.'
                : 'Create your first project to start issuing electrical materials to job sites.'}
            </p>
            {!query && statusFilter === 'all' && (userRole === 'owner' || userRole === 'manager') && (
              <button className="primary-button" style={{ marginTop: 14 }} onClick={openCreate}>
                <Plus size={14} /> Create First Project
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>CODE & NAME</th>
                <th>CLIENT</th>
                <th>SITE LOCATION</th>
                <th>STATUS</th>
                <th>TIMELINE</th>
                <th style={{ textAlign: 'right' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const s = STATUS_BADGE[p.status] || { label: p.status, cls: 'grey' };
                return (
                  <tr key={p.id}>
                    <td>
                      <div>
                        <span className="badge grey" style={{ fontFamily: 'monospace', letterSpacing: 0.5, marginBottom: 4 }}>
                          {p.project_code}
                        </span>
                        <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)', marginTop: 2 }}>
                          {p.name}
                        </div>
                      </div>
                    </td>
                    <td>
                      {p.customers?.name ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Building2 size={13} className="muted" />
                          <span style={{ fontWeight: 500 }}>{p.customers.name}</span>
                        </div>
                      ) : (
                        <span className="muted">Direct Contract</span>
                      )}
                    </td>
                    <td>
                      {p.site_address ? (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, fontSize: 12, maxWidth: 240 }}>
                          <MapPin size={13} className="muted" style={{ flexShrink: 0, marginTop: 2 }} />
                          <span style={{ color: '#4a5568', lineHeight: 1.4 }}>{p.site_address}</span>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${s.cls}`}>{s.label}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={11} />
                          <span>Start: {fmtDate(p.start_date)}</span>
                        </div>
                        {p.expected_end_date && (
                          <div style={{ marginTop: 2 }}>Due: {fmtDate(p.expected_end_date)}</div>
                        )}
                      </div>
                    </td>
                    <td className="actions">
                      <button
                        className="subtle-button"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px' }}
                        onClick={() => router.push(`/dashboard/projects/${p.id}`)}
                      >
                        <ExternalLink size={12} /> Manage Materials
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* New Project Modal */}
      {modalOpen && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" style={{ width: 'min(100%, 540px)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <p className="eyebrow" style={{ margin: '0 0 4px' }}>CONTRACT WORK</p>
                <h2 style={{ margin: 0 }}>Create New Project</h2>
              </div>
              <button className="icon-btn" onClick={closeModal}>
                <X size={18} />
              </button>
            </div>

            <form className="form-stack" onSubmit={handleCreate}>
              <div className="form-row">
                <label>
                  Project Code *
                  <div className="input-wrap" style={{ position: 'relative' }}>
                    <input
                      required
                      placeholder="e.g. PRJ-26-101"
                      value={projectCode}
                      onChange={(e) => setProjectCode(e.target.value.toUpperCase())}
                    />
                    <button
                      type="button"
                      title="Generate Code"
                      onClick={() => setProjectCode(autoGenProjectCode())}
                      style={{ border: 0, background: 'transparent', color: '#246bfd', cursor: 'pointer', padding: 4 }}
                    >
                      <Sparkles size={14} />
                    </button>
                  </div>
                </label>
                <label>
                  Status
                  <div style={{ marginTop: 7 }}>
                    <select
                      className="select-input"
                      style={{ width: '100%', height: 43 }}
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                    >
                      <option value="active">Active (In Progress)</option>
                      <option value="planning">Planning (Draft)</option>
                      <option value="on_hold">On Hold</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </label>
              </div>

              <label>
                Project Title / Job Name *
                <div className="input-wrap">
                  <input
                    required
                    placeholder="e.g. Metro Station Substation Electrification"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </label>

              <label>
                Client / Customer
                <div style={{ marginTop: 7 }}>
                  <select
                    className="select-input"
                    style={{ width: '100%', height: 43 }}
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
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
                    placeholder="Plot / Floor / Building address where materials will be delivered..."
                    value={siteAddress}
                    onChange={(e) => setSiteAddress(e.target.value)}
                  />
                </div>
              </label>

              <div className="form-row">
                <label>
                  Start Date
                  <div className="input-wrap">
                    <Calendar size={15} />
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                </label>
                <label>
                  Expected Completion Date
                  <div className="input-wrap">
                    <Calendar size={15} />
                    <input
                      type="date"
                      value={expectedEndDate}
                      onChange={(e) => setExpectedEndDate(e.target.value)}
                    />
                  </div>
                </label>
              </div>

              <label>
                Scope / Internal Notes
                <div className="input-wrap">
                  <input
                    placeholder="Work scope details, engineer in charge, site instructions..."
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
                  Create Project & Open
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
