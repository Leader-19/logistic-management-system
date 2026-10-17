import Link from "next/link";
import PageFrame from "../components/PageFrame";
import OperationsSummary from "../components/OperationsSummary";
import RecentShipments from "../components/RecentShipments";

const modules = [
  { number: "01", title: "Order management", status: "Available", tone: "available", description: "Book and track shipments, manage customers, and review invoices.", links: [{ label: "Shipments", href: "/shipments" }, { label: "Customers", href: "/customers" }, { label: "Invoices", href: "/invoices" }] },
  { number: "02", title: "Inventory management", status: "Available", tone: "available", description: "Manage products, barcodes, warehouse stock balances, and movement history.", links: [{ label: "Products", href: "/products" }, { label: "Inventory", href: "/inventory" }] },
  { number: "03", title: "Freight management", status: "Planned", tone: "planned", description: "Carrier selection, freight rates, customs documents, and container planning." },
  { number: "04", title: "Warehouse management", status: "Core tools", tone: "partial", description: "Warehouse stock and barcode lookup are available. Bin locations, picking, and packing workflows remain planned.", links: [{ label: "Inventory", href: "/inventory" }] },
  { number: "05", title: "Transportation", status: "Core tools", tone: "partial", description: "Driver assignment, fleet records, dispatch, delivery, and proof of delivery.", links: [{ label: "Dispatch", href: "/dispatch" }, { label: "Fleet", href: "/fleet" }, { label: "Driver view", href: "/driver" }] },
  { number: "06", title: "Manufacturing", status: "Planned", tone: "planned", description: "Bills of materials, production orders, scheduling, and quality tracking." },
  { number: "07", title: "Analytics & reporting", status: "Available", tone: "available", description: "Tenant-scoped shipment, invoice, inventory, and stock movement summaries.", links: [{ label: "Reports", href: "/reports" }] },
];

export default function MainPage() {
  return (
    <PageFrame>
      <div className="workspace-page">
        <header className="workspace-heading">
          <div>
            <p className="eyebrow">OPERATIONS CONTROL CENTER</p>
            <h1>Good to see you</h1>
            <p>Your live view of shipments, warehouse stock, transport, and billing.</p>
          </div>
          <Link className="primary-button dashboard-create-button" href="/shipments">Open shipments <span aria-hidden="true">→</span></Link>
        </header>
        <OperationsSummary />
        <RecentShipments />

        <section className="dashboard-modules" aria-labelledby="modules-title">
          <div className="dashboard-section-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="modules-title">Logistics modules</h2><p>Open a module or review what is planned for a later phase.</p></div></div>
          <div className="module-grid">{modules.map((module) => <article className="module-card" key={module.number}>
            <div className="module-card-top"><span className="module-number">{module.number}</span><span className={`module-status status-${module.tone}`}>{module.status}</span></div>
            <h3>{module.title}</h3><p>{module.description}</p>
            {module.links && <div className="module-links">{module.links.map((link) => <Link href={link.href} key={link.href}>{link.label}<span aria-hidden="true">↗</span></Link>)}</div>}
          </article>)}</div>
        </section>
      </div>
    </PageFrame>
  );
}
