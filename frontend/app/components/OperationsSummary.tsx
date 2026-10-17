import Link from "next/link";
import { cookies } from "next/headers";

type StatusCount = { status: string; count: number };
type Summary = {
  shipments: { total: number; byStatus: StatusCount[] };
  invoices: { count: number; totalsByCurrency: { currency: string; total: string }[] };
  inventory: { balanceRows: number; movementCount: number };
};

async function getSummary(): Promise<{ data?: Summary; message?: string }> {
  const jar = await cookies();
  const token = jar.get("lms_session")?.value;
  const tenantId = jar.get("lms_tenant")?.value;
  if (!token || !tenantId) return { message: "Sign in and select a workspace to view operational metrics." };

  try {
    const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
    const response = await fetch(`${apiUrl}/reports/summary`, {
      headers: { Authorization: `Bearer ${token}`, "x-tenant-id": tenantId },
      cache: "no-store",
    });
    if (!response.ok) {
      return { message: response.status === 403 ? "Your role does not have permission to view operational reports." : "Operational metrics are temporarily unavailable." };
    }
    const data = await response.json() as Summary;
    if (!data || typeof data.shipments?.total !== "number" || !Array.isArray(data.shipments.byStatus)) {
      return { message: "The reports service returned an unexpected response." };
    }
    return { data };
  } catch {
    return { message: "The reports service is unavailable. Please try again shortly." };
  }
}

function countFor(statuses: StatusCount[], ...names: string[]) {
  return statuses.filter((item) => names.includes(item.status)).reduce((total, item) => total + item.count, 0);
}

function moneySummary(totals: Summary["invoices"]["totalsByCurrency"]) {
  if (!totals.length) return "No invoices yet";
  return totals.map((item) => `${item.total} ${item.currency}`).join(" · ");
}

const pipeline = [
  { label: "Booked", statuses: ["BOOKED", "PICKUP_SCHEDULED"] },
  { label: "Collected", statuses: ["COLLECTED"] },
  { label: "At hub / transit", statuses: ["AT_HUB", "IN_TRANSIT"] },
  { label: "Out for delivery", statuses: ["OUT_FOR_DELIVERY"] },
  { label: "Delivered", statuses: ["DELIVERED"] },
];

export default async function OperationsSummary() {
  const result = await getSummary();
  if (!result.data) {
    return <section className="dashboard-summary dashboard-summary-error" role="status"><p>{result.message}</p><Link href="/reports">Open reports</Link></section>;
  }

  const { shipments, invoices, inventory } = result.data;
  const statusCounts = shipments.byStatus;
  const transit = countFor(statusCounts, "AT_HUB", "IN_TRANSIT");
  const delivering = countFor(statusCounts, "OUT_FOR_DELIVERY");
  const delivered = countFor(statusCounts, "DELIVERED");
  const failed = countFor(statusCounts, "DELIVERY_FAILED");
  const maxPipeline = Math.max(1, ...pipeline.map((item) => countFor(statusCounts, ...item.statuses)));

  return <>
    <section className="dashboard-kpis" aria-label="Workspace key metrics">
      <article className="dashboard-kpi"><span className="kpi-icon kpi-blue" aria-hidden="true">▤</span><p>Total shipments</p><strong>{shipments.total}</strong><Link href="/shipments">View shipments <span aria-hidden="true">→</span></Link></article>
      <article className="dashboard-kpi"><span className="kpi-icon kpi-violet" aria-hidden="true">⇄</span><p>At hub / in transit</p><strong>{transit}</strong><Link href="/dispatch">Open dispatch <span aria-hidden="true">→</span></Link></article>
      <article className="dashboard-kpi"><span className="kpi-icon kpi-green" aria-hidden="true">✓</span><p>Out for delivery</p><strong>{delivering}</strong><Link href="/driver">Driver deliveries <span aria-hidden="true">→</span></Link></article>
      <article className="dashboard-kpi"><span className="kpi-icon kpi-amber" aria-hidden="true">!</span><p>Needs attention</p><strong>{failed}</strong><Link href="/dispatch">Review exceptions <span aria-hidden="true">→</span></Link></article>
    </section>

    <section className="dashboard-panels">
      <article className="dashboard-panel pipeline-panel">
        <div className="dashboard-panel-heading"><div><p className="eyebrow">LIVE OPERATIONS</p><h2>Shipment pipeline</h2><p>Current shipment counts by operational stage.</p></div><Link href="/reports">Full report <span aria-hidden="true">→</span></Link></div>
        <div className="pipeline-list">{pipeline.map((item) => {
          const count = countFor(statusCounts, ...item.statuses);
          return <div className="pipeline-row" key={item.label}><span>{item.label}</span><div className="pipeline-track"><span style={{ width: `${count ? Math.max(5, count / maxPipeline * 100) : 0}%` }} /></div><strong>{count}</strong></div>;
        })}</div>
        <p className="pipeline-footnote">{delivered} delivered shipment{delivered === 1 ? "" : "s"} recorded across all time.</p>
      </article>
      <article className="dashboard-panel snapshot-panel">
        <div className="dashboard-panel-heading"><div><p className="eyebrow">WORKSPACE SNAPSHOT</p><h2>Inventory & billing</h2><p>Current totals from your workspace.</p></div></div>
        <div className="snapshot-row"><span><i className="snapshot-dot dot-blue" />Stock lines</span><strong>{inventory.balanceRows}</strong><Link href="/inventory">Inventory</Link></div>
        <div className="snapshot-row"><span><i className="snapshot-dot dot-green" />Stock movements</span><strong>{inventory.movementCount}</strong><Link href="/inventory">History</Link></div>
        <div className="snapshot-row"><span><i className="snapshot-dot dot-violet" />Invoices</span><strong>{invoices.count}</strong><Link href="/invoices">Invoices</Link></div>
        <div className="invoice-totals"><span>Invoice totals by currency</span><strong>{moneySummary(invoices.totalsByCurrency)}</strong></div>
      </article>
    </section>
  </>;
}
