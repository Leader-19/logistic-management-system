"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../lib/api-client";

type Vehicle = { id: string; registration: string; vehicleType: string; make?: string | null; model?: string | null; capacityKg?: string | null; status: string; notes?: string | null };

export default function FleetView() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => { setLoading(true); setError(""); try { setVehicles(await apiRequest<Vehicle[]>("fleet/vehicles")); } catch (cause) { setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to manage fleet." : cause instanceof Error ? cause.message : "Could not load fleet."); } finally { setLoading(false); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function createVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const body = { registration: String(form.get("registration") ?? ""), vehicleType: String(form.get("vehicleType") ?? ""), make: String(form.get("make") ?? "") || undefined, model: String(form.get("model") ?? "") || undefined, capacityKg: form.get("capacityKg") ? Number(form.get("capacityKg")) : undefined, notes: String(form.get("notes") ?? "") || undefined };
    try { await apiRequest("fleet/vehicles", { method: "POST", body: JSON.stringify(body) }); setNotice("Vehicle added to fleet."); formElement.reset(); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save vehicle."); }
    finally { setBusy(false); }
  }

  async function changeStatus(vehicle: Vehicle, status: string) {
    setBusy(true); setError("");
    try { await apiRequest(`fleet/vehicles/${vehicle.id}`, { method: "PATCH", body: JSON.stringify({ status }) }); setNotice(`${vehicle.registration} updated.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update vehicle."); }
    finally { setBusy(false); }
  }

  return <div className="workspace-page"><header className="workspace-heading"><div><p className="eyebrow">OPERATIONS</p><h1>Fleet</h1><p>Register vehicles and track whether they are active, in maintenance, or retired.</p></div><span className="record-count">{vehicles.length} vehicles</span></header>
    {error && <div className="feedback error" role="alert">{error}</div>}{notice && <div className="feedback success" role="status">{notice}</div>}
    <section className="settings-card"><h2>Add vehicle</h2><form className="settings-grid" onSubmit={createVehicle}><label className="form-field"><span>Registration / plate</span><input name="registration" required maxLength={32}/></label><label className="form-field"><span>Vehicle type</span><input name="vehicleType" required maxLength={80} placeholder="Van, motorcycle, truck…"/></label><label className="form-field"><span>Make</span><input name="make" maxLength={80}/></label><label className="form-field"><span>Model</span><input name="model" maxLength={80}/></label><label className="form-field"><span>Capacity (kg)</span><input name="capacityKg" type="number" min="0" step="0.001"/></label><label className="form-field"><span>Notes</span><input name="notes" maxLength={1000}/></label><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Add vehicle"}</button></form></section>
    <section className="table-card">{loading ? <p className="state-message">Loading fleet…</p> : vehicles.length === 0 ? <p className="state-message">No vehicles registered yet.</p> : <div className="table-scroll"><table><thead><tr><th>Registration</th><th>Type</th><th>Make / model</th><th>Capacity</th><th>Status</th><th>Update status</th></tr></thead><tbody>{vehicles.map(vehicle => <tr key={vehicle.id}><td>{vehicle.registration}</td><td>{vehicle.vehicleType}</td><td>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}</td><td>{vehicle.capacityKg ? `${vehicle.capacityKg} kg` : "—"}</td><td>{vehicle.status}</td><td><select aria-label={`Status for ${vehicle.registration}`} value={vehicle.status} disabled={busy} onChange={event => void changeStatus(vehicle, event.target.value)}><option value="ACTIVE">Active</option><option value="MAINTENANCE">Maintenance</option><option value="RETIRED">Retired</option></select></td></tr>)}</tbody></table></div>}</section>
  </div>;
}
