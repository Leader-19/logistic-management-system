"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest, ApiPage } from "../../lib/api-client";

type Invoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  currency: string;
  issuedAt: string;
  shipment: { trackingNumber: string; recipientName: string; customer: { name: string } };
  lines: { id: string; description: string; quantity: string; unitPrice: string; lineTotal: string }[];
};

const money = (amount: string, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount));

export default function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await apiRequest<ApiPage<Invoice>>(`invoices?page=${page}&limit=20`);
      setInvoices(result.data);
      setTotal(result.total);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to view invoices." : cause instanceof Error ? cause.message : "Could not load invoices.");
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { void load(); }, [load]);

  return <div className="workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">BILLING</p><h1>Invoices</h1><p>Invoices are generated from delivered shipments and retain their original totals.</p></div><span className="record-count">{total} records</span></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    <section className="table-card">
      {loading ? <p className="state-message">Loading invoices…</p> : invoices.length === 0 ? <p className="state-message">No invoices yet. Open a delivered shipment and issue its invoice.</p> : <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Shipment</th><th>Customer</th><th>Issued</th><th>Subtotal</th><th>VAT</th><th>Total</th><th>Action</th></tr></thead><tbody>{invoices.map(invoice => <tr key={invoice.id}><td>{invoice.invoiceNumber}</td><td>{invoice.shipment.trackingNumber}</td><td>{invoice.shipment.customer.name}</td><td>{new Date(invoice.issuedAt).toLocaleDateString()}</td><td>{money(invoice.subtotal, invoice.currency)}</td><td>{money(invoice.taxAmount, invoice.currency)} ({invoice.taxRate}%)</td><td><b>{money(invoice.total, invoice.currency)}</b></td><td><button className="text-button" onClick={() => setSelected(invoice)}>View / print</button></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Page {page} of {Math.max(1, Math.ceil(total / 20))}</span><div><button className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={page * 20 >= total || loading} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </section>
    {selected && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="invoice-title"><div className="modal-heading"><h2 id="invoice-title">{selected.invoiceNumber}</h2><button className="secondary-button" onClick={() => setSelected(null)} aria-label="Close invoice">×</button></div><div className="invoice-paper"><p><b>Invoice</b> · {new Date(selected.issuedAt).toLocaleDateString()}</p><p>Bill to: {selected.shipment.customer.name}</p><p>Shipment: {selected.shipment.trackingNumber} · Recipient: {selected.shipment.recipientName}</p><table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{selected.lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{money(line.unitPrice, selected.currency)}</td><td>{money(line.lineTotal, selected.currency)}</td></tr>)}</tbody></table><p>Subtotal: {money(selected.subtotal, selected.currency)}</p><p>VAT ({selected.taxRate}%): {money(selected.taxAmount, selected.currency)}</p><h3>Total: {money(selected.total, selected.currency)}</h3></div><div className="row-actions"><button className="primary-button" onClick={() => window.print()}>Print invoice</button><button className="secondary-button" onClick={() => setSelected(null)}>Close</button></div></section></div>}
  </div>;
}
