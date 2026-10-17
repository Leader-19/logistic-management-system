"use client";

import { useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../lib/api-client";

type Summary = { shipments: { total: number; byStatus: { status: string; count: number }[] }; invoices: { count: number; totalsByCurrency: { currency: string; total: string }[] }; inventory: { balanceRows: number; movementCount: number } };

export default function ReportsView() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { void apiRequest<Summary>("reports/summary").then(setSummary).catch(cause => setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to view reports." : cause instanceof Error ? cause.message : "Could not load report.")); }, []);
  return <div className="workspace-page"><header className="workspace-heading"><div><p className="eyebrow">ANALYTICS</p><h1>Reports</h1><p>Current shipment, invoicing, and warehouse activity for this workspace.</p></div></header>{error && <div className="feedback error" role="alert">{error}</div>}{!summary && !error ? <p className="state-message">Loading report…</p> : summary && <><section className="settings-grid"><article className="settings-card"><p className="eyebrow">SHIPMENTS</p><h2>{summary.shipments.total}</h2><p>Total bookings</p></article><article className="settings-card"><p className="eyebrow">INVOICES</p><h2>{summary.invoices.count}</h2><p>Issued invoice totals: {summary.invoices.totalsByCurrency.map(item => `${item.total} ${item.currency}`).join(" · ") || "0"}</p></article><article className="settings-card"><p className="eyebrow">INVENTORY</p><h2>{summary.inventory.balanceRows}</h2><p>Product/warehouse stock lines</p></article><article className="settings-card"><p className="eyebrow">STOCK ACTIVITY</p><h2>{summary.inventory.movementCount}</h2><p>Recorded movements</p></article></section><section className="table-card"><h2>Shipments by status</h2><div className="table-scroll"><table><thead><tr><th>Status</th><th>Count</th></tr></thead><tbody>{summary.shipments.byStatus.map(row => <tr key={row.status}><td>{row.status.replaceAll("_", " ")}</td><td>{row.count}</td></tr>)}</tbody></table></div></section></>}</div>;
}
