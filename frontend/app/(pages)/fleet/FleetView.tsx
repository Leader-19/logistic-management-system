"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, ApiPage, apiRequest } from "../../lib/api-client";
import { showToast } from "../../ui/toast";

type Vehicle = { id: string; registration: string; vehicleType: string; make?: string | null; model?: string | null; capacityKg?: string | null; status: string; notes?: string | null };
const PAGE_SIZE = 20;

export default function FleetView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(""); try { const result = await apiRequest<ApiPage<Vehicle>>(`fleet/vehicles?page=${page}&limit=${PAGE_SIZE}`); setVehicles(result.data); setTotal(result.total); } catch (cause) { setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to manage fleet." : cause instanceof Error ? cause.message : "Could not load fleet."); } finally { setLoading(false); } }, [page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (notice) showToast(notice); }, [notice]);

  async function createVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = { registration: String(form.get("registration") ?? ""), vehicleType: String(form.get("vehicleType") ?? ""), make: String(form.get("make") ?? "") || undefined, model: String(form.get("model") ?? "") || undefined, capacityKg: form.get("capacityKg") ? Number(form.get("capacityKg")) : undefined, notes: String(form.get("notes") ?? "") || undefined };
    try { await apiRequest("fleet/vehicles", { method: "POST", body: JSON.stringify(body) }); setNotice("Vehicle created successfully."); formElement.reset(); setCreateOpen(false); if (page !== 1) setPage(1); else await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save vehicle."); }
    finally { setBusy(false); }
  }

  async function changeStatus(vehicle: Vehicle, status: string) {
    setBusy(true); setError("");
    try { await apiRequest(`fleet/vehicles/${vehicle.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setNotice(`${vehicle.registration} updated successfully.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update vehicle."); }
    finally { setBusy(false); }
  }

  return <div className="workspace-page"><header className="workspace-heading"><div><p className="eyebrow">OPERATIONS</p><h1>Fleet</h1><p>Register vehicles and track whether they are active, in maintenance, or retired.</p></div><div className="heading-actions"><span className="record-count">{total} vehicles</span><button className="primary-button" onClick={() => setCreateOpen(true)}>Add vehicle</button></div></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    <section className="table-card">{loading ? <p className="state-message">Loading fleet…</p> : vehicles.length === 0 ? <p className="state-message">No vehicles registered yet.</p> : <div className="table-scroll"><table><thead><tr><th>Registration</th><th>Type</th><th>Make / model</th><th>Capacity</th><th>Status</th><th>Update status</th></tr></thead><tbody>{vehicles.map(vehicle => <tr key={vehicle.id}><td>{vehicle.registration}</td><td>{vehicle.vehicleType}</td><td>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}</td><td>{vehicle.capacityKg ? `${vehicle.capacityKg} kg` : "—"}</td><td>{vehicle.status}</td><td><select aria-label={`Status for ${vehicle.registration}`} value={vehicle.status} disabled={busy} onChange={event => void changeStatus(vehicle, event.target.value)}><option value="ACTIVE">Active</option><option value="MAINTENANCE">Maintenance</option><option value="RETIRED">Retired</option></select></td></tr>)}</tbody></table></div>}<div className="pagination"><span>Showing {vehicles.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div><button className="secondary-button" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={loading || page >= Math.max(1, Math.ceil(total / PAGE_SIZE))} onClick={() => setPage(value => value + 1)}>Next</button></div></div></section>
    {createOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setCreateOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="vehicle-form-title"><div className="modal-heading"><h2 id="vehicle-form-title">Add vehicle</h2><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)} aria-label="Close form">×</button></div><form className="data-form" onSubmit={createVehicle}><label className="form-field"><span>Registration / plate</span><input name="registration" required maxLength={32} autoFocus /></label><label className="form-field"><span>Vehicle type</span><input name="vehicleType" required maxLength={80} placeholder="Van, motorcycle, truck…" /></label><label className="form-field"><span>Make</span><input name="make" maxLength={80} /></label><label className="form-field"><span>Model</span><input name="model" maxLength={80} /></label><label className="form-field"><span>Capacity (kg)</span><input name="capacityKg" type="number" min="0" step="0.001" /></label><label className="form-field"><span>Notes</span><input name="notes" maxLength={1000} /></label><div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Add vehicle"}</button><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button></div></form></section></div>}
  </div>;
}
