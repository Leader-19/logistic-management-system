import Link from "next/link";
import { cookies } from "next/headers";
import PanelHeader from "./PanelHeader";

type Shipment = {
  id: string;
  trackingNumber: string;
  recipientName: string;
  recipientAddress: string;
  status: string;
  createdAt: string;
};
type ShipmentPage = { data: Shipment[]; total: number };

async function getRecentShipments(): Promise<{ page?: ShipmentPage; error?: string }> {
  const cookieStore = await cookies();
  const token = cookieStore.get("lms_session")?.value;
  const tenantId = cookieStore.get("lms_tenant")?.value;
  if (!token || !tenantId) return { error: "Sign in and choose a workspace to view shipments." };

  try {
    const apiUrl = process.env.API_INTERNAL_URL ?? "http://localhost:4000/api/v1";
    const response = await fetch(apiUrl + "/shipments?page=1&limit=4", {
      headers: { Authorization: "Bearer " + token, "x-tenant-id": tenantId },
      cache: "no-store",
    });
    if (!response.ok) return { error: response.status === 403 ? "You do not have permission to view shipments." : "Shipments could not be loaded right now." };
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || !("data" in payload) || !Array.isArray(payload.data) || !("total" in payload) || typeof payload.total !== "number") {
      return { error: "The shipment service returned an unexpected response." };
    }
    return { page: payload as ShipmentPage };
  } catch {
    return { error: "The shipment service is unavailable. Please try again shortly." };
  }
}

function displayStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function statusTone(status: string) {
  if (status === "DELIVERED" || status === "OUT_FOR_DELIVERY") return "green";
  if (status === "PICKUP_SCHEDULED" || status === "DELIVERY_FAILED") return "amber";
  return "blue";
}

export default async function RecentShipments() {
  const result = await getRecentShipments();
  const shipments = result.page?.data ?? [];

  return (
    <article className="panel shipments-panel">
      <PanelHeader
        className="table-head"
        title="Recent shipments"
        description="A live view of your latest activity"
        action={<Link className="view-all" href="/shipments">View all shipments <span>→</span></Link>}
      />
      <div className="table-scroll">
        <table>
          <thead><tr><th>TRACKING ID</th><th>RECIPIENT</th><th>DESTINATION</th><th>STATUS</th><th>CREATED</th></tr></thead>
          <tbody>
            {result.error ? <tr><td colSpan={5} className="shipment-message">{result.error}</td></tr> : shipments.length === 0 ? <tr><td colSpan={5} className="shipment-message">No shipments have been recorded yet.</td></tr> : shipments.map((shipment) => (
              <tr key={shipment.id}>
                <td><Link className="tracking" href={`/shipments/${shipment.id}`}>{shipment.trackingNumber}</Link></td>
                <td><span className="person-avatar">{shipment.recipientName.split(" ").map((name) => name[0]).join("").slice(0, 2)}</span>{shipment.recipientName}</td>
                <td>{shipment.recipientAddress}</td>
                <td><span className={"status status-" + statusTone(shipment.status)}><i />{displayStatus(shipment.status)}</span></td>
                <td>{new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(shipment.createdAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span>Showing <b>{shipments.length ? `1–${shipments.length}` : "0"}</b> of <b>{result.page?.total ?? 0}</b> shipments</span>
        <Link className="view-all" href="/shipments">Open shipments <span>→</span></Link>
      </div>
    </article>
  );
}
