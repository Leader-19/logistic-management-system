"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "../../lib/api-client";

export type InvoiceTemplateLayout = {
  paperSize: "A4" | "LETTER";
  accentColor: string;
  fontFamily: "Arial" | "Georgia" | "Helvetica" | "Times New Roman";
  title: string;
  headerText: string;
  footerText: string;
  showLogo: boolean;
  showBillingAddress: boolean;
  showShipment: boolean;
  showDueDate: boolean;
  tableStyle: "plain" | "striped" | "bordered";
};

export type InvoiceTemplate = {
  id: string;
  name: string;
  isDefault: boolean;
  currentVersion: number;
  layout: InvoiceTemplateLayout;
};

export type InvoiceBrand = { name: string; logo?: string | null; email?: string | null; phone?: string | null; address?: string | null };

export const DEFAULT_TEMPLATE_LAYOUT: InvoiceTemplateLayout = {
  paperSize: "A4", accentColor: "#245edb", fontFamily: "Arial", title: "Invoice",
  headerText: "", footerText: "Thank you for your business.", showLogo: true,
  showBillingAddress: true, showShipment: true, showDueDate: true, tableStyle: "plain",
};

const sampleText = (value: string) => value
  .replaceAll("{{invoiceNumber}}", "INV-2026-0042")
  .replaceAll("{{customerName}}", "Sample customer")
  .replaceAll("{{total}}", "125.00")
  .replaceAll("{{currency}}", "USD");

const sectionOptions: Array<{ key: "showLogo" | "showBillingAddress" | "showShipment" | "showDueDate"; label: string }> = [
  { key: "showLogo", label: "Company logo" },
  { key: "showBillingAddress", label: "Customer address" },
  { key: "showShipment", label: "Shipment details" },
  { key: "showDueDate", label: "Due date" },
];

type Props = { templates: InvoiceTemplate[]; brand: InvoiceBrand; onSaved: (template: InvoiceTemplate) => void };

export default function InvoiceTemplateStudio({ templates, brand, onSaved }: Props) {
  const [templateId, setTemplateId] = useState("");
  const [newDraft, setNewDraft] = useState(false);
  const [version, setVersion] = useState(0);
  const [name, setName] = useState("Company invoice");
  const [layout, setLayout] = useState<InvoiceTemplateLayout>(DEFAULT_TEMPLATE_LAYOUT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (templateId || newDraft) return;
    const preferred = templates.find(item => item.isDefault) ?? templates[0];
    if (preferred) loadTemplate(preferred);
  }, [templates, templateId, newDraft]);

  function loadTemplate(template: InvoiceTemplate) {
    setNewDraft(false);
    setTemplateId(template.id);
    setVersion(template.currentVersion);
    setName(template.name);
    setLayout(template.layout);
    setError("");
    setNotice("");
  }

  function startNew() {
    setTemplateId("");
    setVersion(0);
    setName("New invoice template");
    setLayout(DEFAULT_TEMPLATE_LAYOUT);
    setError("");
    setNotice("");
  }

  function updateLayout<Key extends keyof InvoiceTemplateLayout>(key: Key, value: InvoiceTemplateLayout[Key]) {
    setLayout(current => ({ ...current, [key]: value }));
  }

  async function saveTemplate() {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await apiRequest<InvoiceTemplate>(templateId ? `invoices/templates/${templateId}` : "invoices/templates", {
        method: templateId ? "PUT" : "POST",
        body: JSON.stringify({ name, layout, ...(templateId ? { expectedVersion: version } : { makeDefault: templates.length === 0 }) }),
      });
      onSaved(saved);
      loadTemplate(saved);
      setNotice(`Saved version ${saved.currentVersion}.`);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 409 ? cause.message : cause instanceof Error ? cause.message : "Could not save the template.");
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault() {
    if (!templateId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const saved = await apiRequest<{ id: string; name: string; isDefault: true }>(`invoices/templates/${templateId}/default`, { method: "POST" });
      onSaved({ id: saved.id, name: saved.name, isDefault: true, currentVersion: version, layout });
      setNotice("This is now the default template for new invoices.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not set the default template.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="invoice-studio" aria-label="Invoice template designer">
    <div className="invoice-studio-toolbar">
      <div><p className="eyebrow">DOCUMENT DESIGNER</p><h2>Invoice template</h2><p>Change the style and preview the page before saving.</p></div>
      <div className="invoice-studio-actions"><button type="button" className="secondary-button" onClick={startNew}>New template</button><button type="button" className="primary-button" disabled={saving || !name.trim()} onClick={() => void saveTemplate()}>{saving ? "Saving…" : templateId ? "Save new version" : "Save template"}</button>{templateId && <button type="button" className="secondary-button" disabled={saving || templates.find(item => item.id === templateId)?.isDefault} onClick={() => void makeDefault()}>Make default</button>}</div>
    </div>
    {error && <div className="feedback error" role="alert">{error}</div>}{notice && <div className="feedback success" role="status">{notice}</div>}
    <div className="invoice-studio-grid">
      <div className="invoice-studio-controls">
        <label className="form-field"><span>Saved template</span><select value={templateId} onChange={event => { const selected = templates.find(item => item.id === event.target.value); if (selected) loadTemplate(selected); else startNew(); }}><option value="">New template</option>{templates.map(item => <option key={item.id} value={item.id}>{item.name}{item.isDefault ? " (default)" : ""} · v{item.currentVersion}</option>)}</select></label>
        <label className="form-field"><span>Template name</span><input maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <div className="invoice-control-row"><label className="form-field"><span>Paper size</span><select value={layout.paperSize} onChange={event => updateLayout("paperSize", event.target.value as InvoiceTemplateLayout["paperSize"])}><option value="A4">A4</option><option value="LETTER">Letter</option></select></label><label className="form-field"><span>Accent color</span><input className="invoice-color-input" type="color" value={layout.accentColor} onChange={event => updateLayout("accentColor", event.target.value)} /></label></div>
        <label className="form-field"><span>Font</span><select value={layout.fontFamily} onChange={event => updateLayout("fontFamily", event.target.value as InvoiceTemplateLayout["fontFamily"])}><option>Arial</option><option>Helvetica</option><option>Georgia</option><option>Times New Roman</option></select></label>
        <label className="form-field"><span>Document title</span><input maxLength={80} value={layout.title} onChange={event => updateLayout("title", event.target.value)} /></label>
        <label className="form-field"><span>Header text</span><textarea maxLength={1000} value={layout.headerText} onChange={event => updateLayout("headerText", event.target.value)} placeholder="Optional note above the invoice details" /></label>
        <label className="form-field"><span>Footer text</span><textarea maxLength={1000} value={layout.footerText} onChange={event => updateLayout("footerText", event.target.value)} placeholder="Payment message or thank-you note" /></label>
        <label className="form-field"><span>Items table</span><select value={layout.tableStyle} onChange={event => updateLayout("tableStyle", event.target.value as InvoiceTemplateLayout["tableStyle"])}><option value="plain">Simple</option><option value="striped">Alternating rows</option><option value="bordered">Full borders</option></select></label>
        <fieldset className="invoice-studio-sections"><legend>Show on invoice</legend>{sectionOptions.map(option => <label key={option.key}><input type="checkbox" checked={layout[option.key]} onChange={event => updateLayout(option.key, event.target.checked)} />{option.label}</label>)}</fieldset>
        <p className="form-hint">You can use <code>{"{{invoiceNumber}}"}</code>, <code>{"{{customerName}}"}</code>, <code>{"{{total}}"}</code>, and <code>{"{{currency}}"}</code> in header or footer text.</p>
      </div>
      <div className="invoice-studio-preview-wrap"><div className="invoice-studio-preview-label">LIVE PREVIEW · SAMPLE DATA</div><article className={`invoice-studio-preview invoice-preview-${layout.paperSize.toLowerCase()} invoice-table-${layout.tableStyle}`} style={{ fontFamily: layout.fontFamily }}>
        <header className="invoice-preview-header" style={{ borderBottomColor: layout.accentColor }}><div className="invoice-preview-brand">{layout.showLogo && (brand.logo ? <img src={brand.logo} alt="Company logo" /> : <span className="invoice-preview-logo-placeholder">Logo</span>)}<div><b>{brand.name || "Your company"}</b>{brand.email && <small>{brand.email}</small>}{brand.phone && <small>{brand.phone}</small>}</div></div><h1 style={{ color: layout.accentColor }}>{layout.title || "Invoice"}</h1></header>
        <p className="invoice-preview-meta"><b>INV-2026-0042</b><span>Issued 19 Oct 2026</span></p>
        {layout.showBillingAddress && <p className="invoice-preview-address"><b>Bill to</b><br />Sample customer<br />customer@example.invalid<br />Phnom Penh, Cambodia</p>}
        {layout.showShipment && <p className="invoice-preview-details">Shipment: TRK-2026-0042</p>}{layout.showDueDate && <p className="invoice-preview-details">Due: 18 Nov 2026</p>}
        {layout.headerText && <p className="invoice-preview-note">{sampleText(layout.headerText)}</p>}
        <table><thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Amount</th></tr></thead><tbody><tr><td>Delivery service</td><td>1</td><td>$125.00</td><td>$125.00</td></tr><tr><td>Handling fee</td><td>1</td><td>$0.00</td><td>$0.00</td></tr></tbody></table>
        <div className="invoice-preview-totals"><span>Subtotal <b>$125.00</b></span><span>Tax (10%) <b>$0.00</b></span><strong style={{ color: layout.accentColor }}>Total <b>$125.00</b></strong></div>
        {layout.footerText && <footer>{sampleText(layout.footerText)}</footer>}
      </article></div>
    </div>
  </section>;
}
