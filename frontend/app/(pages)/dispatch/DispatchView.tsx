"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { ApiError, ApiPage, apiRequest } from "../../lib/api-client";
import { showToast } from "../../ui/toast";

type Driver = { id: string; fullName: string; phone?: string };
type Shipment = { id: string; trackingNumber: string; status: string; recipientName: string; recipientAddress: string; assignedDriverId?: string | null; assignedDriver?: { user: Driver } | null };

const nextStatuses: Record<string, string[]> = { BOOKED: ["PICKUP_SCHEDULED"], PICKUP_SCHEDULED: ["COLLECTED"], COLLECTED: ["AT_HUB"], AT_HUB: ["IN_TRANSIT"], IN_TRANSIT: ["OUT_FOR_DELIVERY"], OUT_FOR_DELIVERY: ["DELIVERY_FAILED"], DELIVERY_FAILED: ["OUT_FOR_DELIVERY", "RETURNED"] };
const PAGE_SIZE = 20;

export default function DispatchView() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scanCode, setScanCode] = useState("");
  const [scanResult, setScanResult] = useState<Shipment | null>(null);
  const [scanAttempted, setScanAttempted] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [hubLocation, setHubLocation] = useState("");
  const [page, setPage] = useState(1);
  const scanInputRef = useRef<HTMLInputElement>(null);
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
      setSelectedIds([]);
    } catch (cause) { setError(cause instanceof ApiError && cause.status === 403 ? "You need shipment-read and assignment permissions to use dispatch." : cause instanceof Error ? cause.message : "Could not load dispatch board."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (notice) showToast(notice); }, [notice]);

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

  async function cancelSelected() {
    if (!selectedIds.length || !window.confirm(`Cancel ${selectedIds.length} selected shipments? This records a cancellation event and keeps their tracking history.`)) return;
    setBusyId("batch"); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ canceledCount: number; skippedCount: number }>("shipments/batch/cancel", { method: "POST", body: JSON.stringify({ ids: selectedIds }) });
      const noun = result.canceledCount === 1 ? "shipment" : "shipments";
      setNotice(`${result.canceledCount} ${noun} canceled${result.skippedCount ? ` · ${result.skippedCount} could not be canceled because of their current state` : ""}.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not cancel selected shipments."); }
    finally { setBusyId(""); }
  }

  async function findParcel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = scanCode.trim().replace(/[\r\n]/g, "");
    if (!code) return;
    setScanning(true); setScanAttempted(true); setScanResult(null); setError(""); setPage(1);
    try {
      const result = await apiRequest<ApiPage<Shipment>>(`shipments?search=${encodeURIComponent(code)}&page=1&limit=100`);
      const found = result.data.find(shipment => shipment.trackingNumber.toLowerCase() === code.toLowerCase() && !["DELIVERED", "CANCELLED", "RETURNED"].includes(shipment.status));
      setScanResult(found ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not look up this tracking number."); }
    finally { setScanning(false); }
  }

  const normalizedScanCode = scanCode.trim().replace(/[\r\n]/g, "");
  const scannedShipment = normalizedScanCode ? scanResult ?? undefined : undefined;
  const visibleShipments = scanCode.trim() ? scannedShipment ? [scannedShipment] : [] : shipments;
  const totalPages = Math.max(1, Math.ceil(visibleShipments.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageShipments = visibleShipments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return <div className="workspace-page"><header className="workspace-heading"><div><p className="eyebrow">OPERATIONS</p><h1>Dispatch & hub scanning</h1><p>Assign drivers, scan parcels into a hub, and record loading for transport.</p></div><span className="record-count">{shipments.length} active shipments</span></header>
    {error && <div className="feedback error" role="alert">{error}</div>}{notice && <div className="feedback success" role="status">{notice}</div>}
    <section className="dispatch-scan-card" aria-labelledby="hub-scan-title">
      <div className="dispatch-scan-heading">
        <div className="dispatch-scan-icon" aria-hidden="true">⌁</div>
        <div className="dispatch-scan-copy"><p className="eyebrow">HUB OPERATIONS</p><h2 id="hub-scan-title">Scan parcel at hub</h2><p>Scan a barcode or type a tracking number to find a parcel and record its next hub action.</p></div>
        <span className="dispatch-scan-count">{shipments.length} active</span>
      </div>
      <form className="dispatch-scan-form" onSubmit={findParcel}>
        <label className="dispatch-scan-field"><span className="dispatch-scan-field-label">Tracking barcode</span><div className="dispatch-scan-input"><span className="dispatch-scan-input-icon" aria-hidden="true">⌕</span><input ref={scanInputRef} value={scanCode} onChange={event => { setScanCode(event.target.value); setScanResult(null); setScanAttempted(false); setPage(1); }} placeholder="Scan or enter tracking number" autoComplete="off" aria-describedby="scan-help"/><button type="button" className="dispatch-scan-clear" disabled={!scanCode} onClick={() => { setScanCode(""); setScanResult(null); setScanAttempted(false); setPage(1); scanInputRef.current?.focus(); }} aria-label="Clear tracking number">Clear</button></div><small id="scan-help" className="dispatch-scan-hint">Handheld scanners can submit automatically by sending Enter after the barcode.</small></label>
        <label className="dispatch-scan-field"><span className="dispatch-scan-field-label">Hub / sorting location <small className="dispatch-scan-optional">Optional</small></span><input className="dispatch-scan-location" value={hubLocation} onChange={event => setHubLocation(event.target.value)} placeholder="e.g. Phnom Penh · Route A" maxLength={200}/></label>
        <button type="submit" className="primary-button dispatch-scan-submit" disabled={!scanCode.trim()||scanning}>{scanning?"Finding…":"Find parcel"}</button>
      </form>
      {normalizedScanCode && scanAttempted && !scanning && !scannedShipment && <div className="dispatch-scan-result dispatch-scan-result-error" role="status"><span className="dispatch-scan-result-icon" aria-hidden="true">!</span><div className="dispatch-scan-result-copy"><strong className="text-xs">No active parcel found</strong><p>Check the tracking number and scan again.</p></div></div>}
      {scannedShipment && <div className="dispatch-scan-result dispatch-scan-result-success" role="status">
        <div className="dispatch-scan-result-icon" aria-hidden="true">✓</div>
        <div className="dispatch-scan-result-copy"><span className="mb-1 block text-[9px] font-extrabold tracking-[1.25px] text-green-800">PARCEL FOUND</span><Link className="text-sm font-extrabold text-blue-700 no-underline hover:underline" href={`/shipments/${scannedShipment.id}`}>{scannedShipment.trackingNumber}</Link><p className="truncate">{scannedShipment.recipientName} <span className="px-1 text-slate-400">·</span> {scannedShipment.recipientAddress}</p></div>
        <span className="rounded-full bg-slate-200 px-3 py-1.5 text-[10px] font-bold text-slate-700">{scannedShipment.status.replaceAll("_", " ")}</span>
        <div className="dispatch-scan-result-actions">{nextStatuses[scannedShipment.status]?.map(status => <button key={status} type="button" className="primary-button whitespace-nowrap" disabled={busyId === scannedShipment.id} onClick={() => void advance(scannedShipment, status)}>{busyId === scannedShipment.id ? "Saving…" : status === "AT_HUB" ? "Receive at hub" : status === "IN_TRANSIT" ? "Load for transport" : status.replaceAll("_", " ")}</button>)}</div>
      </div>}
    </section>
    <section className="table-card dispatch-table-card"><div className="dispatch-table-heading"><div><p className="eyebrow">PARCEL QUEUE</p><h2>{normalizedScanCode ? "Scan result" : "Active shipments"}</h2></div><span>{visibleShipments.length} parcels</span></div>
      {!normalizedScanCode && selectedIds.length > 0 && <div className="dispatch-bulk-bar"><span>{selectedIds.length} cancellable parcel{selectedIds.length === 1 ? "" : "s"} selected</span><button type="button" className="secondary-button danger-text" disabled={busyId === "batch"} onClick={() => void cancelSelected()}>{busyId === "batch" ? "Canceling…" : "Cancel selected"}</button><small>Cancellation is recorded; parcel history is retained.</small></div>}
      {loading ? <p className="state-message">Loading dispatch board…</p> : visibleShipments.length === 0 ? <p className="state-message">{normalizedScanCode ? "Enter a tracking barcode that matches an active shipment." : "No active shipments to dispatch."}</p> : <div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select cancellable shipments on this page" checked={pageShipments.filter(shipment => ["BOOKED", "PICKUP_SCHEDULED", "DELIVERY_FAILED"].includes(shipment.status)).length > 0 && pageShipments.filter(shipment => ["BOOKED", "PICKUP_SCHEDULED", "DELIVERY_FAILED"].includes(shipment.status)).every(shipment => selectedIds.includes(shipment.id))} onChange={event => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, ...pageShipments.filter(shipment => ["BOOKED", "PICKUP_SCHEDULED", "DELIVERY_FAILED"].includes(shipment.status)).map(shipment => shipment.id)])] : selectedIds.filter(id => !pageShipments.some(shipment => shipment.id === id)))} /></th><th>Tracking</th><th>Status</th><th>Recipient</th><th>Destination</th><th>Assigned driver</th><th>Actions</th></tr></thead><tbody>{pageShipments.map(shipment => <tr key={shipment.id}><td><input type="checkbox" aria-label={`Select ${shipment.trackingNumber}`} disabled={!(["BOOKED", "PICKUP_SCHEDULED", "DELIVERY_FAILED"].includes(shipment.status)) || busyId === "batch"} checked={selectedIds.includes(shipment.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...current, shipment.id] : current.filter(id => id !== shipment.id))} /></td><td><Link href={`/shipments/${shipment.id}`}>{shipment.trackingNumber}</Link></td><td><span className={`dispatch-status-pill dispatch-status-${shipment.status.toLowerCase()}`}>{shipment.status.replaceAll("_", " ")}</span></td><td>{shipment.recipientName}</td><td>{shipment.recipientAddress}</td><td>{shipment.assignedDriver?.user.fullName ?? "Unassigned"}</td><td className="row-actions">{["BOOKED", "PICKUP_SCHEDULED"].includes(shipment.status) && <><select aria-label={`Driver for ${shipment.trackingNumber}`} value={assignments[shipment.id] ?? shipment.assignedDriverId ?? ""} onChange={event => setAssignments(current => ({ ...current, [shipment.id]: event.target.value }))}><option value="">Choose driver</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}</select><button className="text-button" disabled={busyId === shipment.id || !(assignments[shipment.id] || shipment.assignedDriverId)} onClick={() => void assign(shipment)}>Assign</button></>}{nextStatuses[shipment.status]?.map(status => <button className="text-button" key={status} disabled={busyId === shipment.id} onClick={() => void advance(shipment, status)}>{status === "AT_HUB" ? "Receive at hub" : status === "IN_TRANSIT" ? "Load for transport" : status.replaceAll("_", " ")}</button>)}</td></tr>)}</tbody></table></div>}
      {!loading && visibleShipments.length > 0 && <div className="pagination"><span>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visibleShipments.length)} of {visibleShipments.length}</span><div><button type="button" className="secondary-button" disabled={currentPage <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>Previous</button><span className="dispatch-page-count">Page {currentPage} of {totalPages}</span><button type="button" className="secondary-button" disabled={currentPage >= totalPages} onClick={() => setPage(value => Math.min(totalPages, value + 1))}>Next</button></div></div>}
    </section>
  </div>;
}
