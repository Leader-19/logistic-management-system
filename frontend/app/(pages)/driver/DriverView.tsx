"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiRequest } from "../../lib/api-client";

type Delivery = { id: string; trackingNumber: string; status: string; recipientName: string; recipientPhone?: string; recipientAddress: string };
const next: Record<string, string> = { PICKUP_SCHEDULED: "COLLECTED", COLLECTED: "AT_HUB", AT_HUB: "IN_TRANSIT", IN_TRANSIT: "OUT_FOR_DELIVERY" };

export default function DriverView() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [recipient, setRecipient] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); setError(""); try { setDeliveries(await apiRequest<Delivery[]>("shipments/mine")); } catch (cause) { setError(cause instanceof ApiError && cause.status === 403 ? "This screen is for active Driver-role members with shipment access." : cause instanceof Error ? cause.message : "Could not load assigned deliveries."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function advance(delivery: Delivery, status: string) {
    setBusy(delivery.id); setError(""); setNotice("");
    try { await apiRequest(`shipments/${delivery.id}/events`, { method: "POST", body: JSON.stringify({ status, note: "Updated by assigned driver" }) }); setNotice(`${delivery.trackingNumber} updated.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update delivery."); }
    finally { setBusy(""); }
  }
  async function deliver(event: FormEvent<HTMLFormElement>, delivery: Delivery) {
    event.preventDefault(); setBusy(delivery.id); setError(""); setNotice("");
    try { await apiRequest(`shipments/${delivery.id}/deliver`, { method: "POST", body: JSON.stringify({ recipientName: recipient[delivery.id] || delivery.recipientName, note: note[delivery.id] || undefined }) }); setNotice(`${delivery.trackingNumber} delivered with proof recorded.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record proof of delivery."); }
    finally { setBusy(""); }
  }

  return <div className="workspace-page driver-page"><header className="workspace-heading"><div><p className="eyebrow">DRIVER WORKSPACE</p><h1>My deliveries</h1><p>Shipments assigned to your driver account.</p></div><span className="record-count">{deliveries.length} active</span></header>{error && <div className="feedback error" role="alert">{error}</div>}{notice && <div className="feedback success" role="status">{notice}</div>}{loading ? <p className="state-message">Loading assignments…</p> : deliveries.length === 0 ? <p className="state-message">No active shipments are assigned to you.</p> : <section className="settings-grid">{deliveries.map(delivery => <article className="settings-card" key={delivery.id}><p className="eyebrow">{delivery.status.replaceAll("_", " ")}</p><h2><Link href={`/shipments/${delivery.id}`}>{delivery.trackingNumber}</Link></h2><p><b>{delivery.recipientName}</b>{delivery.recipientPhone && <><br/>{delivery.recipientPhone}</>}</p><p>{delivery.recipientAddress}</p>{next[delivery.status] && <button className="primary-button" disabled={busy === delivery.id} onClick={() => void advance(delivery, next[delivery.status])}>Mark {next[delivery.status].replaceAll("_", " ")}</button>}{delivery.status === "OUT_FOR_DELIVERY" && <form className="data-form" onSubmit={event => void deliver(event, delivery)}><label className="form-field"><span>Received by</span><input required minLength={2} maxLength={120} value={recipient[delivery.id] ?? delivery.recipientName} onChange={event => setRecipient(current => ({ ...current, [delivery.id]: event.target.value }))}/></label><label className="form-field"><span>Proof note (optional)</span><textarea maxLength={1000} value={note[delivery.id] ?? ""} onChange={event => setNote(current => ({ ...current, [delivery.id]: event.target.value }))}/></label><button className="primary-button" disabled={busy === delivery.id}>{busy === delivery.id ? "Saving…" : "Confirm delivery"}</button></form>}</article>)}</section>}</div>;
}
