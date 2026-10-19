"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, apiRequest, ApiPage } from "../../lib/api-client";
import InvoiceTemplateStudio, { DEFAULT_TEMPLATE_LAYOUT, InvoiceBrand, InvoiceTemplate, InvoiceTemplateLayout } from "./InvoiceTemplateStudio";

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
  dueAt: string | null;
  notes: string | null;
  headerNote: string | null;
  paymentTerms: string | null;
  footerNote: string | null;
  templateSnapshot: { templateId: string | null; name: string; version: number; layout: InvoiceTemplateLayout } | null;
  tenant: InvoiceBrand;
  customer: { id: string; name: string; company: string | null; email: string | null; address: string | null; city: string | null; state: string | null; zipCode: string | null; country: string | null };
  shipment: { trackingNumber: string; recipientName: string } | null;
  lines: { id: string; description: string; quantity: string; unitPrice: string; lineTotal: string }[];
};
type Customer = { id: string; name: string; company: string | null; email: string | null };
type InvoiceLine = { description: string; quantity: string; unitPrice: string };
type InvoiceSettings = { vatRate: string; headerNote: string; paymentTerms: string; footerNote: string };
type InvoicePrintSettings = { paper: "A4" | "LETTER"; orientation: "portrait" | "landscape"; margin: "6mm" | "10mm" | "14mm" };
const DEFAULT_SETTINGS: InvoiceSettings = { vatRate: "10", headerNote: "", paymentTerms: "", footerNote: "" };
const DEFAULT_PRINT_SETTINGS: InvoicePrintSettings = { paper: "A4", orientation: "portrait", margin: "10mm" };

const money = (amount: string, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount));
function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const layout = invoice.templateSnapshot?.layout ?? DEFAULT_TEMPLATE_LAYOUT;
  const renderText = (value: string) => value
    .replaceAll("{{invoiceNumber}}", invoice.invoiceNumber)
    .replaceAll("{{customerName}}", invoice.customer.company || invoice.customer.name)
    .replaceAll("{{total}}", invoice.total)
    .replaceAll("{{currency}}", invoice.currency);
  const customerAddress = [invoice.customer.address, invoice.customer.city, invoice.customer.state, invoice.customer.zipCode, invoice.customer.country].filter(Boolean).join(", ");

  return <div className={`invoice-paper invoice-paper-${layout.paperSize.toLowerCase()} invoice-table-${layout.tableStyle}`} style={{ fontFamily: layout.fontFamily }}>
    <header className="invoice-document-header" style={{ borderBottomColor: layout.accentColor }}>
      <div className="invoice-document-company">{layout.showLogo && invoice.tenant.logo && <img src={invoice.tenant.logo} alt={`${invoice.tenant.name} logo`} />}<div><b>{invoice.tenant.name}</b>{invoice.tenant.address && <span>{invoice.tenant.address}</span>}{invoice.tenant.email && <span>{invoice.tenant.email}</span>}{invoice.tenant.phone && <span>{invoice.tenant.phone}</span>}</div></div>
      <h1 style={{ color: layout.accentColor }}>{layout.title || "Invoice"}</h1>
    </header>
    <div className="invoice-document-meta"><b>{invoice.invoiceNumber}</b><span>Issued {new Date(invoice.issuedAt).toLocaleDateString()}</span></div>
    <section className="invoice-document-parties"><div><b>Bill to</b><strong>{invoice.customer.company || invoice.customer.name}</strong>{invoice.customer.company && <span>{invoice.customer.name}</span>}{invoice.customer.email && <span>{invoice.customer.email}</span>}{layout.showBillingAddress && customerAddress && <span>{customerAddress}</span>}</div><div className="invoice-document-dates">{layout.showDueDate && invoice.dueAt && <p><b>Due date</b><span>{new Date(invoice.dueAt).toLocaleDateString()}</span></p>}{layout.showShipment && invoice.shipment && <p><b>Shipment</b><span>{invoice.shipment.trackingNumber}</span></p>}</div></section>
    {layout.headerText && <p className="invoice-document-note">{renderText(layout.headerText)}</p>}{invoice.headerNote && <p className="invoice-document-note">{invoice.headerNote}</p>}
    <table><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{invoice.lines.map(line => <tr key={line.id}><td>{line.description}</td><td>{line.quantity}</td><td>{money(line.unitPrice, invoice.currency)}</td><td>{money(line.lineTotal, invoice.currency)}</td></tr>)}</tbody></table>
    <div className="invoice-document-totals"><p><span>Subtotal</span><b>{money(invoice.subtotal, invoice.currency)}</b></p><p><span>Tax ({invoice.taxRate}%)</span><b>{money(invoice.taxAmount, invoice.currency)}</b></p><p className="invoice-document-total" style={{ color: layout.accentColor }}><strong>Total</strong><strong>{money(invoice.total, invoice.currency)}</strong></p></div>
    {invoice.notes && <p className="invoice-document-note">{invoice.notes}</p>}{invoice.paymentTerms && <p className="invoice-document-note"><b>Payment terms:</b> {invoice.paymentTerms}</p>}{layout.footerText && <p className="invoice-document-footer">{renderText(layout.footerText)}</p>}{invoice.footerNote && <p className="invoice-document-footer">{invoice.footerNote}</p>}
  </div>;
}

export default function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [documentSettings, setDocumentSettings] = useState<InvoiceSettings>(DEFAULT_SETTINGS);
  const [settingsEditable, setSettingsEditable] = useState(false);
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templateStudioOpen, setTemplateStudioOpen] = useState(false);
  const [brand, setBrand] = useState<InvoiceBrand>({ name: "Your company" });
  const [lines, setLines] = useState<InvoiceLine[]>([{ description: "", quantity: "1", unitPrice: "0" }]);
  const [printSettings, setPrintSettings] = useState<InvoicePrintSettings>(DEFAULT_PRINT_SETTINGS);

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

  useEffect(() => {
    try {
      const saved = localStorage.getItem("lms.invoice.print-settings");
      if (saved) {
        const value: unknown = JSON.parse(saved);
        if (value && typeof value === "object") {
          const settings = value as Record<string, unknown>;
          setPrintSettings({
            paper: settings.paper === "LETTER" ? "LETTER" : "A4",
            orientation: settings.orientation === "landscape" ? "landscape" : "portrait",
            margin: settings.margin === "6mm" || settings.margin === "14mm" ? settings.margin : "10mm",
          });
        }
      }
    } catch { /* Keep the defaults if local browser storage is unavailable or malformed. */ }
  }, []);

  function savePrintSettings(next: InvoicePrintSettings) {
    setPrintSettings(next);
    try { localStorage.setItem("lms.invoice.print-settings", JSON.stringify(next)); } catch { /* Preferences still apply for this session. */ }
  }

  useEffect(() => {
    void Promise.all([
      apiRequest<{ key: string; value: string }[]>("tenants/current/settings").then(settings => ({ settings, canRead: true })).catch(() => ({ settings: [], canRead: false })),
      apiRequest<ApiPage<Customer>>("customers?page=1&limit=100").catch(() => ({ data: [], total: 0, page: 1, limit: 100, totalPages: 0 })),
    ]).then(([settingsResult, customerPage]) => {
      const settings = settingsResult.settings;
      const values = Object.fromEntries(settings.filter(setting => setting.key.startsWith("invoice.")).map(setting => [setting.key, setting.value]));
      setDocumentSettings({ vatRate: values["invoice.vatRate"] ?? DEFAULT_SETTINGS.vatRate, headerNote: values["invoice.headerNote"] ?? "", paymentTerms: values["invoice.paymentTerms"] ?? "", footerNote: values["invoice.footerNote"] ?? "" });
      setSettingsEditable(settingsResult.canRead);
      setCustomers(customerPage.data);
    })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void apiRequest<InvoiceTemplate[]>("invoices/templates").then(items => {
      setTemplates(items);
      setSelectedTemplateId(items.find(item => item.isDefault)?.id ?? items[0]?.id ?? "");
    }).catch(() => undefined);
    void apiRequest<InvoiceBrand & { logo?: string | null }>("tenants/current").then(setBrand).catch(() => undefined);
  }, []);

  function saveTemplateSummary(template: InvoiceTemplate) {
    setTemplates(current => [...current.filter(item => item.id !== template.id).map(item => template.isDefault ? { ...item, isDefault: false } : item), template].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name)));
    setSelectedTemplateId(template.id);
  }
  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const values = new FormData(event.currentTarget);
    try {
      const created = await apiRequest<Invoice>("invoices", { method: "POST", body: JSON.stringify({ customerId: values.get("customerId"), templateId: selectedTemplateId || undefined, invoiceNumber: values.get("invoiceNumber") || undefined, dueAt: values.get("dueAt") || undefined, taxRate: String(values.get("taxRate") ?? ""), notes: values.get("notes") || undefined, lines }) });
      setCreateOpen(false); setSelected(created); setNotice("Invoice created and issued."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create invoice."); }
    finally { setSaving(false); }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSettingsSaving(true); setError(""); setNotice("");
    try {
      await apiRequest("tenants/current/settings", { method: "PUT", body: JSON.stringify({ settings: Object.entries(documentSettings).map(([key, value]) => ({ key: `invoice.${key}`, value })) }) });
      setNotice("Invoice defaults saved. New invoices will use these settings.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save invoice defaults."); }
    finally { setSettingsSaving(false); }
  }

  return <div className="workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">BILLING</p><h1>Invoices</h1><p>Create customer invoices with custom line items, tax rate, due date, and document terms.</p></div><div className="heading-actions"><span className="record-count">{total} records</span>{settingsEditable && <button className="secondary-button" onClick={() => setTemplateStudioOpen(value => !value)}>{templateStudioOpen ? "Close designer" : "Design templates"}</button>}<button className="primary-button" onClick={() => { setLines([{ description: "", quantity: "1", unitPrice: "0" }]); setCreateOpen(true); }}>Create invoice</button></div></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    {notice && <div className="feedback success" role="status">{notice}</div>}
    {templateStudioOpen && settingsEditable && <InvoiceTemplateStudio templates={templates} brand={brand} onSaved={saveTemplateSummary} />}
    {settingsEditable && <section className="settings-card"><div className="table-toolbar"><div><h2>Invoice defaults</h2><p className="muted-copy">These settings are copied into each invoice when it is issued.</p></div></div><form className="settings-grid" onSubmit={saveSettings}><label className="form-field"><span>Default VAT / tax rate (%)</span><input type="number" min="0" max="100" step="0.0001" value={documentSettings.vatRate} onChange={event => setDocumentSettings(current => ({ ...current, vatRate: event.target.value }))} /></label><label className="form-field"><span>Header note</span><textarea maxLength={1000} value={documentSettings.headerNote} onChange={event => setDocumentSettings(current => ({ ...current, headerNote: event.target.value }))} /></label><label className="form-field"><span>Payment terms</span><textarea maxLength={1000} value={documentSettings.paymentTerms} onChange={event => setDocumentSettings(current => ({ ...current, paymentTerms: event.target.value }))} /></label><label className="form-field"><span>Footer note</span><textarea maxLength={1000} value={documentSettings.footerNote} onChange={event => setDocumentSettings(current => ({ ...current, footerNote: event.target.value }))} /></label><div className="row-actions"><button className="secondary-button" disabled={settingsSaving}>{settingsSaving ? "Saving…" : "Save invoice defaults"}</button></div></form></section>}
    <section className="table-card">
      {loading ? <p className="state-message">Loading invoices…</p> : invoices.length === 0 ? <p className="state-message">No invoices yet. Create one here or issue it from a delivered shipment.</p> : <div className="table-scroll"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Shipment</th><th>Issued</th><th>Due</th><th>Subtotal</th><th>Tax</th><th>Total</th><th>Action</th></tr></thead><tbody>{invoices.map(invoice => <tr key={invoice.id}><td>{invoice.invoiceNumber}<small className="muted-copy">{invoice.status}</small></td><td>{invoice.customer.name}</td><td>{invoice.shipment?.trackingNumber ?? "Manual"}</td><td>{new Date(invoice.issuedAt).toLocaleDateString()}</td><td>{invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : "—"}</td><td>{money(invoice.subtotal, invoice.currency)}</td><td>{money(invoice.taxAmount, invoice.currency)} ({invoice.taxRate}%)</td><td><b>{money(invoice.total, invoice.currency)}</b></td><td><button className="text-button" onClick={() => setSelected(invoice)}>View / print</button></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Page {page} of {Math.max(1, Math.ceil(total / 20))}</span><div><button className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={page * 20 >= total || loading} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </section>
    {selected && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="invoice-title"><style>{`@page invoiceA4{size:${printSettings.paper === "A4" ? "A4" : "letter"} ${printSettings.orientation === "landscape" ? "landscape" : "portrait"};margin:${printSettings.margin === "6mm" || printSettings.margin === "14mm" ? printSettings.margin : "10mm"}}@media print{.invoice-paper{page:invoiceA4!important}}`}</style><div className="modal-heading"><h2 id="invoice-title">{selected.invoiceNumber}</h2><button className="secondary-button" onClick={() => setSelected(null)} aria-label="Close invoice">×</button></div><details className="invoice-print-settings"><summary>Print and PDF settings</summary><div className="invoice-print-options"><label className="form-field"><span>Paper</span><select value={printSettings.paper} onChange={event => savePrintSettings({ ...printSettings, paper: event.target.value as InvoicePrintSettings["paper"] })}><option value="A4">A4</option><option value="LETTER">Letter</option></select></label><label className="form-field"><span>Orientation</span><select value={printSettings.orientation} onChange={event => savePrintSettings({ ...printSettings, orientation: event.target.value as InvoicePrintSettings["orientation"] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label className="form-field"><span>Margins</span><select value={printSettings.margin} onChange={event => savePrintSettings({ ...printSettings, margin: event.target.value as InvoicePrintSettings["margin"] })}><option value="6mm">Narrow</option><option value="10mm">Normal</option><option value="14mm">Wide</option></select></label></div><p className="muted-copy">These preferences are saved in this browser. Choose a printer or “Save as PDF” in the browser print dialog.</p></details><InvoiceDocument invoice={selected} /><div className="row-actions"><button className="primary-button" onClick={() => window.print()}>Print invoice</button><button className="secondary-button" onClick={() => window.print()}>Download PDF</button><button className="secondary-button" onClick={() => setSelected(null)}>Close</button></div></section></div>}
    {createOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setCreateOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-invoice-title"><div className="modal-heading"><h2 id="create-invoice-title">Create customer invoice</h2><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)} aria-label="Close">×</button></div>{customers.length === 0 ? <p className="state-message">Create a customer before issuing an invoice.</p> : <form className="data-form" onSubmit={createInvoice}><label className="form-field"><span>Customer</span><select name="customerId" required defaultValue=""><option value="" disabled>Select customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.company ? `${customer.company} · ` : ""}{customer.name}</option>)}</select></label><div className="settings-grid"><label className="form-field"><span>Invoice template</span><select value={selectedTemplateId} onChange={event => setSelectedTemplateId(event.target.value)}><option value="">Workspace default</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name}{template.isDefault ? " (default)" : ""}</option>)}</select></label><label className="form-field"><span>Invoice number (optional)</span><input name="invoiceNumber" maxLength={80} placeholder="Generated automatically" /></label><label className="form-field"><span>Due date</span><input name="dueAt" type="date" /></label><label className="form-field"><span>Tax rate (%)</span><input name="taxRate" type="number" min="0" max="100" step="0.0001" defaultValue={documentSettings.vatRate} required /></label></div><div className="supply-order-lines"><div className="table-toolbar"><b>Invoice items</b><button type="button" className="secondary-button" onClick={() => setLines(current => [...current, { description: "", quantity: "1", unitPrice: "0" }])}>Add line</button></div>{lines.map((line, index) => <div className="invoice-line-row" key={index}><label className="form-field"><span>Description</span><input required maxLength={500} value={line.description} onChange={event => setLines(current => current.map((item, row) => row === index ? { ...item, description: event.target.value } : item))} /></label><label className="form-field"><span>Quantity</span><input required type="number" min="0.0001" max="1000000" step="0.0001" value={line.quantity} onChange={event => setLines(current => current.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))} /></label><label className="form-field"><span>Unit price</span><input required type="number" min="0" max="1000000000" step="0.0001" value={line.unitPrice} onChange={event => setLines(current => current.map((item, row) => row === index ? { ...item, unitPrice: event.target.value } : item))} /></label>{lines.length > 1 && <button type="button" className="text-button danger-text" onClick={() => setLines(current => current.filter((_, row) => row !== index))}>Remove</button>}</div>)}</div><label className="form-field"><span>Invoice notes</span><textarea name="notes" maxLength={2000} /></label><p className="invoice-preview-total">Subtotal preview: {lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0), 0).toFixed(4)} · final totals are calculated by the server</p><div className="row-actions"><button className="primary-button" disabled={saving || !lines.length}>{saving ? "Issuing…" : "Create and issue invoice"}</button><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button></div></form>}</section></div>}
  </div>;
}
