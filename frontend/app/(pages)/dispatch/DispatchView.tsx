"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, ApiPage, apiRequest } from "../../lib/api-client";

type Driver = { id: string; fullName: string; phone?: string };
type Shipment = { id: string; trackingNumber: string; status: string; recipientName: string; recipientAddress: string; assignedDriverId?: string | null; assignedDriver?: { user: Driver } | null };

const nextStatuses: Record<string, string[]> = { BOOKED: ["PICKUP_SCHEDULED"], PICKUP_SCHEDULED: ["COLLECTED"], COLLECTED: ["AT_HUB"], AT_HUB: ["IN_TRANSIT"], IN_TRANSIT: ["OUT_FOR_DELIVERY"], OUT_FOR_DELIVERY: ["DELIVERY_FAILED"], DELIVERY_FAILED: ["OUT_FOR_DELIVERY", "RETURNED"] };

export default function DispatchView() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [scanCode, setScanCode] = useState("");
  const [hubLocation, setHubLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [shipmentPage, driverList] = await Promise.all([apiRequest<ApiPage<Shipment>>("shipments?limit=100"), apiRequest<Driver[]>("shipments/drivers")]);
      setShipments(shipmentPage.data.filter(shipment => !["DELIVERED", "CANCELLED", "RETURNED"].includes(shipment.status)));
      setDrivers(driverList);
    } catch (cause) { setError(cause instanceof ApiError && cause.status === 403 ? "You need shipment-read and assignment permissions to use dispatch." : cause instanceof Error ? cause.message : "Could not load dispatch board."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function assign(shipment: Shipment) {
    const driverId = assignments[shipment.id] || shipment.assignedDriverId || "";
    if (!driverId) return;
    setBusyId(shipment.id); setError(""); setNotice("");
    try { await apiRequest(`shipments/${shipment.id}/assignment`, { method: "PATCH", body: JSON.stringify({ driverId }) }); setNotice(`Driver assigned to ${shipment.trackingNumber}.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not assign driver."); }
    finally { setBusyId(""); }
  }

  async function advance(shipment: Shipment, status: string) {
    setBusyId(shipment.id); setError(""); setNotice("");
    const isHubOperation = ["AT_HUB", "IN_TRANSIT"].includes(status);
    const note = isHubOperation
      ? `${status === "AT_HUB" ? "Scanned into hub" : "Loaded for transport"}${hubLocation.trim() ? ` · ${hubLocation.trim()}` : ""}`
      : "Updated from dispatch board";
    try { await apiRequest(`shipments/${shipment.id}/events`, { method: "POST", body: JSON.stringify({ status, note, ...(isHubOperation && hubLocation.trim() ? { location: hubLocation.trim() } : {}) }) }); setNotice(`${shipment.trackingNumber} moved to ${status.replaceAll("_", " ")}.`); setScanCode(""); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update shipment."); }
    finally { setBusyId(""); }
  }

  const scannedShipment = scanCode.trim() ? shipments.find(shipment => shipment.trackingNumber.toLowerCase() === scanCode.trim().toLowerCase()) : undefined;
  const visibleShipments = scanCode.trim() ? scannedShipment ? [scannedShipment] : [] : shipments;

  return <div className="workspace-page"><header className="workspace-heading"><div><p className="eyebrow">OPERATIONS</p><h1>Dispatch & hub scanning</h1><p>Assign drivers, scan parcels into a hub, and record loading for transport.</p></div><span className="record-count">{shipments.length} active shipments</span></header>
    {error && <div className="feedback error" role="alert">{error}</div>}{notice && <div className="feedback success" role="status">{notice}</div>}
    <section className="settings-card"><h2>Scan parcel at hub</h2><p>Scan a shipment barcode with a handheld scanner, or enter its tracking number. Hub receipt and transport loading are recorded in the shipment event history.</p><div className="tracking-form"><label className="form-field"><span>Tracking barcode</span><input autoFocus value={scanCode} onChange={event => setScanCode(event.target.value)} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Scan or enter tracking number" autoComplete="off"/></label><label className="form-field"><span>Hub / sorting location</span><input value={hubLocation} onChange={event => setHubLocation(event.target.value)} placeholder="For example: Phnom Penh · Route A" maxLength={200}/></label><button type="button" className="secondary-button" onClick={() => setScanCode("")}>Clear scan</button></div>{scanCode.trim() && !scannedShipment && <p className="feedback error" role="status">No active shipment matches that tracking number.</p>}{scannedShipment && <p className="feedback success" role="status">Scanned {scannedShipment.trackingNumber} · {scannedShipment.status.replaceAll("_", " ")}</p>}</section>
    <section className="table-card">{loading ? <p className="state-message">Loading dispatch board…</p> : visibleShipments.length === 0 ? <p className="state-message">{scanCode.trim() ? "Scan a tracking barcode that matches an active shipment." : "No active shipments to dispatch."}</p> : <div className="table-scroll"><table><thead><tr><th>Tracking</th><th>Status</th><th>Recipient</th><th>Destination</th><th>Assigned driver</th><th>Actions</th></tr></thead><tbody>{visibleShipments.map(shipment => <tr key={shipment.id}><td><Link href={`/shipments/${shipment.id}`}>{shipment.trackingNumber}</Link></td><td>{shipment.status.replaceAll("_", " ")}</td><td>{shipment.recipientName}</td><td>{shipment.recipientAddress}</td><td>{shipment.assignedDriver?.user.fullName ?? "Unassigned"}</td><td className="row-actions">{["BOOKED", "PICKUP_SCHEDULED"].includes(shipment.status) && <><select aria-label={`Driver for ${shipment.trackingNumber}`} value={assignments[shipment.id] ?? shipment.assignedDriverId ?? ""} onChange={event => setAssignments(current => ({ ...current, [shipment.id]: event.target.value }))}><option value="">Choose driver</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}</select><button className="text-button" disabled={busyId === shipment.id || !(assignments[shipment.id] || shipment.assignedDriverId)} onClick={() => void assign(shipment)}>Assign</button></>}{nextStatuses[shipment.status]?.map(status => <button className="text-button" key={status} disabled={busyId === shipment.id} onClick={() => void advance(shipment, status)}>{status === "AT_HUB" ? "Receive at hub" : status === "IN_TRANSIT" ? "Load for transport" : status.replaceAll("_", " ")}</button>)}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
