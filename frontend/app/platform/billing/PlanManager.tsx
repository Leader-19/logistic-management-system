"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type Plan = { id: string; name: string; description: string | null; monthlyPrice: string; yearlyPrice: string; isActive: boolean; features: { feature: string; value: string }[]; _count: { subscriptions: number } };
type PlanPage = { currency: string; defaultIncludedUsers: number; data: Plan[]; total: number; totalPages: number };
const PAGE_SIZE = 20;
const empty = { name: "", description: "", monthlyPrice: "", yearlyPrice: "", maxUsers: "10", isActive: true };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/platform/${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result && typeof result === "object" && "message" in result && typeof result.message === "string" ? result.message : "Could not update subscription plans.");
  return result as T;
}

export default function PlanManager() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currency, setCurrency] = useState("USD");
  const [starterSeats, setStarterSeats] = useState(10);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { const result = await request<PlanPage>(`plans?page=${page}&limit=${PAGE_SIZE}`); setPlans(result.data); setTotal(result.total); setTotalPages(Math.max(1, result.totalPages)); setCurrency(result.currency); setStarterSeats(result.defaultIncludedUsers); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load plans."); } }, [page]);
  useEffect(() => { void load(); }, [load]);
  function edit(plan: Plan) { setEditing(plan); setForm({ name: plan.name, description: plan.description ?? "", monthlyPrice: plan.monthlyPrice, yearlyPrice: plan.yearlyPrice, maxUsers: plan.features.find(feature => feature.feature === "max_users")?.value ?? "10", isActive: plan.isActive }); setNotice(""); setError(""); setFormOpen(true); }
  function reset() { setEditing(null); setForm(empty); setFormOpen(false); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const body = { ...form, monthlyPrice: form.monthlyPrice || "0", yearlyPrice: form.yearlyPrice || "0", maxUsers: Number(form.maxUsers) };
      await request<Plan>(editing ? `plans/${editing.id}` : "plans", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
      setNotice(editing ? "Plan updated." : "Plan created."); reset(); if (!editing && page !== 1) setPage(1); else await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the plan."); }
    finally { setBusy(false); }
  }
  return <div className="platform-console"><header className="platform-header"><div><p className="eyebrow">SAAS CONFIGURATION</p><h1>Plans & billing</h1><p>Set seat limits and subscription prices. Tenants can choose active plans from their Billing & plan page.</p></div><button className="primary-button" onClick={() => { setEditing(null); setForm(empty); setError(""); setFormOpen(true); }}>Create plan</button></header>
    {error && <div className="feedback error" role="alert">{error}</div>}{notice && <div className="feedback success" role="status">{notice}</div>}
    <section className="feedback"><b>Starter access:</b> {starterSeats} included user seats. Paid plans below control the limit after checkout.</section>
    {formOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) reset(); }}><section className="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-labelledby="plan-form-title"><div className="modal-heading"><h2 id="plan-form-title">{editing ? `Edit ${editing.name}` : "Create a plan"}</h2><button type="button" className="secondary-button" disabled={busy} onClick={reset} aria-label="Close form">×</button></div><form className="data-form platform-plan-form" onSubmit={save}>
      <label className="form-field"><span>Plan name</span><input required minLength={2} maxLength={80} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>
      <label className="form-field"><span>Description</span><input maxLength={500} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
      <label className="form-field"><span>Monthly price ({currency})</span><input required type="number" min="0" step="0.01" value={form.monthlyPrice} onChange={event => setForm({ ...form, monthlyPrice: event.target.value })} /></label>
      <label className="form-field"><span>Yearly price ({currency})</span><input required type="number" min="0" step="0.01" value={form.yearlyPrice} onChange={event => setForm({ ...form, yearlyPrice: event.target.value })} /></label>
      <label className="form-field"><span>Included user seats</span><input required type="number" min="1" max="100000" step="1" value={form.maxUsers} onChange={event => setForm({ ...form, maxUsers: event.target.value })} /></label>
      {editing && <label className="form-field platform-plan-active"><span>Plan availability</span><select value={form.isActive ? "active" : "inactive"} onChange={event => setForm({ ...form, isActive: event.target.value === "active" })}><option value="active">Available to tenants</option><option value="inactive">Hidden from new checkouts</option></select></label>}
      <div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save plan" : "Create plan"}</button><button type="button" className="secondary-button" disabled={busy} onClick={reset}>Cancel</button></div>
    </form></section></div>}
    <section className="table-card"><div className="table-toolbar"><h2>Subscription plans · {total}</h2><button className="secondary-button" onClick={() => void load()}>Refresh</button></div>{plans.length === 0 ? <p className="state-message">No plans configured. Create a plan above to enable subscription checkout.</p> : <div className="table-scroll"><table><thead><tr><th>Plan</th><th>Seats</th><th>Monthly</th><th>Yearly</th><th>Subscribers</th><th>Status</th><th /></tr></thead><tbody>{plans.map(plan => <tr key={plan.id}><td>{plan.name}<small className="muted-copy">{plan.description}</small></td><td>{plan.features.find(feature => feature.feature === "max_users")?.value ?? "—"}</td><td>{formatPrice(plan.monthlyPrice, currency)}</td><td>{formatPrice(plan.yearlyPrice, currency)}</td><td>{plan._count.subscriptions}</td><td>{plan.isActive ? "Available" : "Hidden"}</td><td><button className="text-button" onClick={() => edit(plan)}>Edit</button></td></tr>)}</tbody></table></div>}<div className="pagination"><span>Showing {plans.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div><button className="secondary-button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div></div></section>
  </div>;
}

function formatPrice(amount: string, currency: string) {
  const value = Number(amount);
  return Number.isFinite(value) ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value) : amount;
}
