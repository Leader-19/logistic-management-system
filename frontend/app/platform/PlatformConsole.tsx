"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiPage } from "../lib/api-client";

type Tenant = { id: string; name: string; slug: string; status: string; _count: { memberships: number; shipments: number }; subscription?: { status: string; plan: { id: string; name: string; features: { value: string }[] } } | null };
type Permission = { id: string; resource: string; action: string; description?: string };
type Session = { id: string; tenantId: string; reason: string; permissionKeys: string[]; startedAt: string; expiresAt: string; endedAt?: string | null; tenant: { id: string; name: string; slug: string } };
type Overview = { tenants: number; activeTenants: number; suspendedTenants: number; cancelledTenants: number; shipments: number; members: number; activeSupportSessions: number; paidSubscriptions: number; pastDueSubscriptions: number };
type Activity = { id: string; action: string; targetType: string; targetId: string | null; outcome: string; createdAt: string; actor: { fullName: string; email: string } | null; tenant: { name: string; slug: string } | null };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/platform/${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = result && typeof result === "object" && "message" in result && typeof result.message === "string" ? result.message : "Platform request failed.";
    throw new Error(message);
  }
  return result as T;
}

export default function PlatformConsole({ activeSessionId }: { activeSessionId: string }) {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [tenantTotal, setTenantTotal] = useState(0);
  const [tenantTotalPages, setTenantTotalPages] = useState(1);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [tenantToDelete, setTenantToDelete] = useState<Tenant | null>(null);
  const [search, setSearch] = useState("");
  const [tenantStatus, setTenantStatus] = useState("");
  const [reason, setReason] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [permissionKeys, setPermissionKeys] = useState<string[]>([]);
  const [deleteReason, setDeleteReason] = useState("");
  const [confirmationSlug, setConfirmationSlug] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const groupedPermissions = useMemo(() => permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    (groups[permission.resource] ??= []).push(permission);
    return groups;
  }, {}), [permissions]);

  const load = useCallback(async () => {
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page), limit: "20", ...(search ? { search } : {}), ...(tenantStatus ? { status: tenantStatus } : {}) });
      const [tenantPage, permissionList, sessionList, overviewData, activityPage] = await Promise.all([
        request<ApiPage<Tenant>>(`tenants?${query}`), request<Permission[]>("permissions"), request<Session[]>("support-sessions"), request<Overview>("overview"), request<ApiPage<Activity>>("activity?page=1&limit=20"),
      ]);
      setTenants(tenantPage.data);
      setTenantTotal(tenantPage.total);
      setTenantTotalPages(Math.max(1, tenantPage.totalPages));
      setPermissions(permissionList);
      setSessions(sessionList);
      setOverview(overviewData);
      setActivity(activityPage.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load platform data.");
    }
  }, [page, search, tenantStatus]);

  useEffect(() => { void load(); }, [load]);

  async function startSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTenant) return;
    setBusy(true);
    setError("");
    try {
      await request<Session>("support-sessions", { method: "POST", body: JSON.stringify({ tenantId: selectedTenant.id, reason, durationMinutes, permissionKeys }) });
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start support session.");
    } finally {
      setBusy(false);
    }
  }

  async function endSupport(sessionId: string) {
    setBusy(true);
    setError("");
    try {
      await request<unknown>(`support-sessions/${sessionId}/end`, { method: "POST", body: "{}" });
      await load();
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not end support session.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantToDelete) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request<Tenant>(`tenants/${encodeURIComponent(tenantToDelete.id)}/delete`, {
        method: "POST",
        body: JSON.stringify({ reason: deleteReason, confirmationSlug }),
      });
      setTenantToDelete(null); setDeleteReason(""); setConfirmationSlug("");
      setNotice(`${tenantToDelete.name} was cancelled. Its records remain available for audit.`);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete this tenant.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  function togglePermission(key: string) {
    setPermissionKeys(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  }

  return <div className="platform-console"><header className="platform-header"><div><p className="eyebrow">FLEETWISE · PLATFORM CONTROL</p><h1>Platform administration</h1><p>Monitor every workspace and provide audited, time-limited support when needed.</p></div><div className="platform-header-actions"><button className="secondary-button" disabled={busy} onClick={() => void load()}>Refresh data</button><button className="secondary-button" onClick={()=>void signOut()}>Sign out</button></div></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    {notice && <div className="feedback success" role="status">{notice}</div>}
    {activeSessionId && <section className="feedback"><b>Support session active.</b> End it when you finish working in the tenant. <button className="secondary-button" disabled={busy} onClick={() => void endSupport(activeSessionId)}>End session</button></section>}
    <section className="platform-metrics" aria-label="Platform overview">{overview ? <>
      <article className="platform-metric"><span>All workspaces</span><strong>{overview.tenants}</strong><small>{overview.activeTenants} active</small></article>
      <article className="platform-metric"><span>Suspended workspaces</span><strong>{overview.suspendedTenants}</strong><small>{overview.cancelledTenants} cancelled</small></article>
      <article className="platform-metric"><span>Active members</span><strong>{overview.members}</strong><small>Across all workspaces</small></article>
      <article className="platform-metric"><span>Shipments</span><strong>{overview.shipments}</strong><small>Platform-wide total</small></article>
      <article className="platform-metric"><span>Support sessions</span><strong>{overview.activeSupportSessions}</strong><small>Currently active</small></article>
      <article className="platform-metric"><span>Paid subscriptions</span><strong>{overview.paidSubscriptions}</strong><small>{overview.pastDueSubscriptions} past due</small></article>
    </> : <div className="platform-metric-loading" role="status">Loading platform metrics…</div>}</section>
    <section className="table-card"><div className="table-toolbar"><h2>Tenants</h2><label className="search-field"><span>⌕</span><input value={search} onChange={event => { setPage(1); setSearch(event.target.value); }} placeholder="Search tenant name or slug" aria-label="Search tenants" /></label><label className="platform-status-filter"><span>Status</span><select value={tenantStatus} onChange={event => { setPage(1); setTenantStatus(event.target.value); }} aria-label="Filter tenants by status"><option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="CANCELLED">Cancelled</option></select></label><button className="secondary-button" onClick={() => void load()}>Refresh</button></div>
      {tenants.length === 0 ? <div className="state-message">No tenants found.</div> : <div className="table-scroll"><table><thead><tr><th>Tenant</th><th>Status</th><th>Plan</th><th>Members</th><th>Shipments</th><th>Actions</th></tr></thead><tbody>{tenants.map(tenant => <tr key={tenant.id}><td>{tenant.name}<small className="muted-copy">{tenant.slug}</small></td><td>{tenant.status}</td><td>{tenant.subscription ? <>{tenant.subscription.plan.name}<small className="muted-copy">{tenant.subscription.status.replaceAll("_", " ")}</small></> : "Starter"}</td><td>{tenant._count.memberships}</td><td>{tenant._count.shipments}</td><td><div className="platform-tenant-actions"><button className="text-button" disabled={tenant.status !== "ACTIVE"} onClick={() => { setSelectedTenant(tenant); setReason(""); setPermissionKeys([]); }}>Start support</button>{tenant.status !== "CANCELLED"&&<button className="text-button danger-text" onClick={() => { setTenantToDelete(tenant); setDeleteReason(""); setConfirmationSlug(""); }}>Delete tenant</button>}</div></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Showing {tenants.length ? (page - 1) * 20 + 1 : 0}–{Math.min(page * 20, tenantTotal)} of {tenantTotal} · Page {page} of {tenantTotalPages}</span><div><button className="secondary-button" disabled={page<=1} onClick={()=>setPage(value=>value-1)}>Previous</button><button className="secondary-button" disabled={page>=tenantTotalPages} onClick={()=>setPage(value=>value+1)}>Next</button></div></div>
    </section>
    <section className="table-card"><h2>Recent support sessions</h2>{sessions.length===0?<p className="state-message">No support sessions yet.</p>:<div className="table-scroll"><table><thead><tr><th>Tenant</th><th>Reason</th><th>Permissions</th><th>Started</th><th>Expires</th><th>Status</th></tr></thead><tbody>{sessions.map(session=><tr key={session.id}><td>{session.tenant.name}</td><td>{session.reason}</td><td>{session.permissionKeys.join(", ")||"No permissions"}</td><td>{new Date(session.startedAt).toLocaleString()}</td><td>{new Date(session.expiresAt).toLocaleString()}</td><td>{session.endedAt?"Ended":new Date(session.expiresAt)<=new Date()?"Expired":"Active"}</td></tr>)}</tbody></table></div>}</section>
    <section className="table-card"><h2>Recent platform activity</h2>{activity.length===0?<p className="state-message">No audited activity yet.</p>:<div className="table-scroll"><table><thead><tr><th>Time</th><th>Activity</th><th>Workspace</th><th>Actor</th><th>Outcome</th></tr></thead><tbody>{activity.map(entry=><tr key={entry.id}><td>{new Date(entry.createdAt).toLocaleString()}</td><td>{entry.action}<small className="muted-copy">{entry.targetType}{entry.targetId?` · ${entry.targetId}`:""}</small></td><td>{entry.tenant? <>{entry.tenant.name}<small className="muted-copy">{entry.tenant.slug}</small></>:"Platform"}</td><td>{entry.actor?.fullName??"System"}<small className="muted-copy">{entry.actor?.email??""}</small></td><td>{entry.outcome}</td></tr>)}</tbody></table></div>}</section>
    {selectedTenant&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSelectedTenant(null);}}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="support-title"><div className="modal-heading"><h2 id="support-title">Start support: {selectedTenant.name}</h2><button className="secondary-button" onClick={()=>setSelectedTenant(null)} aria-label="Close">×</button></div><form className="data-form" onSubmit={startSupport}><label className="form-field"><span>Reason for access</span><textarea required minLength={5} maxLength={500} value={reason} onChange={event=>setReason(event.target.value)} /></label><label className="form-field"><span>Duration in minutes (1–240)</span><input type="number" min={1} max={240} required value={durationMinutes} onChange={event=>setDurationMinutes(Number(event.target.value))} /></label><fieldset className="form-field permission-list"><legend>Allowed permissions</legend>{Object.entries(groupedPermissions).map(([resource,items])=><details key={resource}><summary>{resource}</summary>{items.map(permission=>{const key=`${permission.resource}.${permission.action}`;return <label key={permission.id}><input type="checkbox" checked={permissionKeys.includes(key)} onChange={()=>togglePermission(key)} /> {permission.action}</label>;})}</details>)}</fieldset><div className="row-actions"><button className="primary-button" disabled={busy}>{busy?"Starting…":"Start limited session"}</button><button type="button" className="secondary-button" onClick={()=>setSelectedTenant(null)}>Cancel</button></div></form></section></div>}
    {tenantToDelete&&<div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setTenantToDelete(null);}}><section className="modal-card tenant-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-tenant-title"><div className="modal-heading"><h2 id="delete-tenant-title">Delete {tenantToDelete.name}?</h2><button className="secondary-button" disabled={busy} onClick={()=>setTenantToDelete(null)} aria-label="Close">×</button></div><p className="tenant-delete-warning">This disables the tenant and ends its active support sessions. Shipment and audit records are retained.</p><form className="data-form" onSubmit={deleteTenant}><label className="form-field"><span>Reason for deletion</span><textarea required minLength={5} maxLength={500} value={deleteReason} onChange={event=>setDeleteReason(event.target.value)} /></label><label className="form-field"><span>Type <b>{tenantToDelete.slug}</b> to confirm</span><input required value={confirmationSlug} onChange={event=>setConfirmationSlug(event.target.value)} autoComplete="off" /></label><div className="row-actions"><button className="primary-button danger-button" disabled={busy||confirmationSlug!==tenantToDelete.slug}>{busy?"Deleting…":"Delete tenant"}</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>setTenantToDelete(null)}>Cancel</button></div></form></section></div>}
  </div>;
}
