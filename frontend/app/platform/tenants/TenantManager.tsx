"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiPage } from "../../lib/api-client";

type Tenant = { id: string; name: string; slug: string; status: string; createdAt: string; _count: { memberships: number; shipments: number }; subscription?: { status: string; plan: { name: string; features: { value: string }[] } } | null };
type CreatedTenant = { tenant: Tenant; owner: { email: string }; invitationToken: string; invitationRequiresPassword: boolean };
const PAGE_SIZE = 20;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/platform/${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result && typeof result === "object" && "message" in result && typeof result.message === "string" ? result.message : "Platform request failed.");
  return result as T;
}

export default function TenantManager() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [created, setCreated] = useState<CreatedTenant | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), ...(search ? { search } : {}), ...(status ? { status } : {}) });
      const result = await request<ApiPage<Tenant>>(`tenants?${query}`);
      setTenants(result.data); setTotal(result.total);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load tenants."); }
  }, [page, search, status]);

  useEffect(() => { void load(); }, [load]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPage(1); setSearch(searchInput.trim());
  }

  async function createTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await request<CreatedTenant>("tenants", { method: "POST", body: JSON.stringify({ name: data.get("name"), ownerName: data.get("ownerName"), ownerEmail: data.get("ownerEmail") }) });
      setCreated(result); setCreateOpen(false); setNotice("Tenant created. Copy the owner invitation link and send it to them; it expires in 48 hours."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create tenant."); }
    finally { setBusy(false); }
  }

  async function copyInvitation() {
    if (!created) return;
    const link = `${window.location.origin}/accept-invitation?token=${encodeURIComponent(created.invitationToken)}&passwordRequired=true`;
    await navigator.clipboard.writeText(link);
    setNotice("Owner invitation link copied.");
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return <div className="platform-console">
    <header className="platform-header"><div><p className="eyebrow">WORKSPACE MANAGEMENT</p><h1>Tenants</h1><p>Search customer workspaces, check subscription status, and onboard new owners.</p></div><button className="primary-button" onClick={() => { setCreated(null); setCreateOpen(true); }}>Create tenant</button></header>
    {error && <div className="feedback error" role="alert">{error}</div>}{notice && <div className="feedback success" role="status">{notice}</div>}
    {created && <section className="feedback"><b>Owner invitation for {created.owner.email}</b><p>The secure link is shown only once. Copy it now and send it to the owner.</p><button className="secondary-button" onClick={() => void copyInvitation()}>Copy invitation link</button></section>}
    <section className="table-card">
      <form className="table-toolbar" onSubmit={submitSearch}><div className="platform-tenant-filters"><label className="form-field"><span>Search tenants</span><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Company name or slug" /></label><label className="form-field"><span>Status</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="CANCELLED">Cancelled</option></select></label><button className="secondary-button">Search</button></div><button type="button" className="secondary-button" onClick={() => void load()}>Refresh</button></form>
      <div className="table-toolbar"><h2>{total} tenants</h2><span className="muted-copy">Page {page} of {totalPages}</span></div>
      {tenants.length === 0 ? <p className="state-message">No tenants match these filters.</p> : <div className="table-scroll"><table><thead><tr><th>Tenant</th><th>Status</th><th>Plan</th><th>Members</th><th>Shipments</th><th>Created</th></tr></thead><tbody>{tenants.map(tenant => <tr key={tenant.id}><td>{tenant.name}<small className="muted-copy">{tenant.slug}</small></td><td>{tenant.status}</td><td>{tenant.subscription ? <>{tenant.subscription.plan.name}<small className="muted-copy">{tenant.subscription.status.replaceAll("_", " ")}</small></> : "Starter"}</td><td>{tenant._count.memberships}</td><td>{tenant._count.shipments}</td><td>{new Date(tenant.createdAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Showing {tenants.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div><button className="secondary-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </section>
    {createOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setCreateOpen(false); }}><section className="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-labelledby="tenant-create-title"><div className="modal-heading"><h2 id="tenant-create-title">Create tenant</h2><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)} aria-label="Close form">×</button></div><p>The owner will receive an invitation link to set their password and access the new workspace.</p><form className="data-form" onSubmit={createTenant}><label className="form-field"><span>Company name</span><input name="name" required minLength={2} maxLength={120} autoFocus /></label><label className="form-field"><span>Owner full name</span><input name="ownerName" required minLength={2} maxLength={120} /></label><label className="form-field"><span>Owner email</span><input name="ownerEmail" type="email" required maxLength={254} /></label><div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create tenant & invite owner"}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setCreateOpen(false)}>Cancel</button></div></form></section></div>}
  </div>;
}
