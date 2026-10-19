"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../lib/api-client";

type Plan = { id: string; name: string; description: string | null; monthlyPrice: string; yearlyPrice: string; maxUsers: number };
type BillingState = {
  subscription: null | { status: string; billingCycle: string; currentPeriodEnd: string; plan: { id: string; name: string; monthlyPrice: string; yearlyPrice: string } };
  seatsInUse: number; seatLimit: number; currency: string; stripeConfigured: boolean; canManageBilling: boolean; plans: Plan[];
};

export default function BillingView() {
  const [state, setState] = useState<BillingState | null>(null);
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState("");
  const [portalBusy, setPortalBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setState(await apiRequest<BillingState>("saas-billing/current")); }
    catch (cause) { setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to manage subscription details." : cause instanceof Error ? cause.message : "Could not load subscription details."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const checkout = new URLSearchParams(window.location.search).get("checkout"); if (checkout === "success") setNotice("Checkout completed. Your subscription will update after Stripe confirms payment."); if (checkout === "cancelled") setNotice("Checkout was cancelled. Your current plan is unchanged."); }, [load]);

  async function checkout(planId: string) {
    setBusyPlan(planId); setError("");
    try { const result = await apiRequest<{ checkoutUrl: string }>("saas-billing/checkout", { method: "POST", body: JSON.stringify({ planId, billingCycle: cycle }) }); window.location.assign(result.checkoutUrl); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start checkout."); setBusyPlan(""); }
  }

  async function manageSubscription() {
    setPortalBusy(true); setError("");
    try { const result = await apiRequest<{ portalUrl: string }>("saas-billing/portal", { method: "POST", body: "{}" }); window.location.assign(result.portalUrl); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open subscription management."); setPortalBusy(false); }
  }

  const percent = state ? Math.min(100, Math.round((state.seatsInUse / state.seatLimit) * 100)) : 0;
  return <div className="workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">WORKSPACE MANAGEMENT</p><h1>Billing & plan</h1><p>Manage your subscription and the number of team accounts in your workspace.</p></div><button className="secondary-button" onClick={() => void load()} disabled={loading}>Refresh</button></header>
    {notice && <div className="feedback success" role="status">{notice}</div>}{error && <div className="feedback error" role="alert">{error}</div>}
    {loading ? <section className="table-card"><p className="state-message">Loading billing details…</p></section> : state && <>
      <section className="table-card billing-seat-card"><div><p className="eyebrow">USER SEATS</p><h2>{state.seatsInUse} of {state.seatLimit} users</h2><p>Active accounts and pending invitations both reserve a seat.</p></div><div className="billing-seat-meter" role="progressbar" aria-label="User seats used" aria-valuenow={state.seatsInUse} aria-valuemin={0} aria-valuemax={state.seatLimit}><span style={{ width: `${percent}%` }} /></div><small>{Math.max(0, state.seatLimit - state.seatsInUse)} seats available</small>{state.seatsInUse > state.seatLimit && <p className="feedback error">Your current plan is below your user count. New accounts and invitations are paused until the subscription is updated or users are deactivated.</p>}</section>
      <section className="table-card billing-current-card"><h2>Current subscription</h2>{state.subscription ? <div className="billing-current-details"><b>{state.subscription.plan.name}</b><span className={`billing-status ${state.subscription.status.toLowerCase()}`}>{state.subscription.status.replaceAll("_", " ")}</span><span>{state.subscription.billingCycle} billing</span><span>Renews through {new Date(state.subscription.currentPeriodEnd).toLocaleDateString()}</span>{state.canManageBilling && <button className="secondary-button" disabled={!state.stripeConfigured || portalBusy} onClick={() => void manageSubscription()}>{portalBusy ? "Opening…" : "Manage subscription"}</button>}</div> : <p className="state-message">Starter access includes {state.seatLimit} user seats. Choose a paid plan to add more users.</p>}</section>
      <section className="billing-plans-section"><div className="billing-plans-heading"><div><p className="eyebrow">SUBSCRIPTION OPTIONS</p><h2>Choose a plan</h2></div><label className="form-field"><span>Billing cycle</span><select value={cycle} onChange={event => setCycle(event.target.value as "monthly" | "yearly")}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label></div>
        {state.subscription && !["CANCELLED", "EXPIRED"].includes(state.subscription.status) ? <div className="state-message">{state.canManageBilling ? "Manage or change your existing subscription through the Stripe customer portal above." : "Contact your workspace owner to update the subscription."}</div> : state.plans.filter(plan => plan.maxUsers > state.seatLimit).length ? <div className="billing-plan-grid">{state.plans.filter(plan => plan.maxUsers > state.seatLimit).map(plan => <article className="billing-plan-card" key={plan.id}><p className="eyebrow">{plan.maxUsers} USERS INCLUDED</p><h3>{plan.name}</h3><p>{plan.description || `For teams with up to ${plan.maxUsers} users.`}</p><strong>{formatPrice(cycle === "monthly" ? plan.monthlyPrice : plan.yearlyPrice, state.currency)} <small>{state.currency} / {cycle === "monthly" ? "month" : "year"}</small></strong><button className="primary-button" disabled={!state.canManageBilling || !state.stripeConfigured || !!busyPlan || plan.maxUsers < state.seatsInUse} onClick={() => void checkout(plan.id)}>{busyPlan === plan.id ? "Opening Stripe…" : state.canManageBilling ? "Choose plan" : "Owner action"}</button></article>)}</div> : <div className="state-message">No higher seat plans are available yet. Contact your platform administrator.</div>}
        {!state.stripeConfigured && <p className="muted-copy">Online checkout is not configured yet. Ask your platform administrator to connect Stripe.</p>}
      </section>
    </>}
  </div>;
}

function formatPrice(amount: string, currency: string) {
  const value = Number(amount);
  return Number.isFinite(value) ? new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value) : amount;
}
