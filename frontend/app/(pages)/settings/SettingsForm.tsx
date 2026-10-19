"use client";
import { FormEvent, useEffect, useState } from "react";
import { ApiError, apiRequest } from "../../lib/api-client";
type Tenant = { name: string; logo?: string | null; phone?: string; email?: string; address?: string; timezone?: string; currency?: string };
type Setting = { key: string; value: string };
type DisplaySetting = { label: string; hint?: string; type?: string; textarea?: boolean; required?: boolean; min?: number; max?: number; step?: number };
const displaySettings: Record<string, DisplaySetting> = {
    "shipment.flatRate": { label: "Flat rate per shipment", type: "number", required: true, min: 0, step: 0.01, hint: "Applied by the server to each new shipment." },
    "invoice.vatRate": { label: "VAT rate (%)", type: "number", required: true, min: 0, max: 100, step: 0.0001, hint: "Default is 10%. Enter 0 for an exempt or zero-rated workspace. The rate is saved onto each issued invoice." },
    "invoice.headerNote": { label: "Invoice header note", textarea: true, hint: "Shown under the invoice title on issued invoice documents, e.g. “Thank you for shipping with us.”" },
    "invoice.paymentTerms": { label: "Invoice payment terms", textarea: true, hint: "Example: “Payment due within 15 days. Include the invoice number in your transfer.”" },
    "invoice.footerNote": { label: "Invoice footer note", textarea: true, hint: "Shown at the bottom of issued invoice documents, e.g. company registration or support contact." },
};
export default function SettingsForm() {
    const [tenant, setTenant] = useState<Tenant>({ name: "" }); const [settings, setSettings] = useState<Setting[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
    useEffect(() => { void Promise.all([apiRequest<Tenant>("tenants/current"), apiRequest<Setting[]>("tenants/current/settings")]).then(([t, s]) => { setTenant(t); setSettings([...(!s.some(setting => setting.key === "shipment.flatRate") ? [{ key: "shipment.flatRate", value: "" }] : []), ...(!s.some(setting => setting.key === "invoice.vatRate") ? [{ key: "invoice.vatRate", value: "10" }] : []), ...s]); }).catch(e => setError(e instanceof ApiError && e.status === 403 ? "You do not have permission to view workspace settings." : e instanceof Error ? e.message : "Could not load settings.")); }, []);
    async function uploadLogo(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) { setError("Choose a PNG, JPEG, or WebP logo up to 3 MB."); return; }
        setBusy(true); setError(""); setMessage("");
        try { const form = new FormData(); form.set("file", file); const response = await fetch("/api/tenant/logo", { method: "POST", body: form }); const result = await response.json(); if (!response.ok) throw new Error(result.message ?? "Could not upload the company logo."); setTenant(prev => ({ ...prev, logo: result.logo })); setMessage("Company logo updated."); }
        catch (cause) { setError(cause instanceof Error ? cause.message : "Could not upload the company logo."); }
        finally { setBusy(false); }
    }
    async function save(e: FormEvent) { e.preventDefault(); setBusy(true); setError(""); setMessage(""); try { const profile = { name: tenant.name, phone: tenant.phone, email: tenant.email, address: tenant.address, timezone: tenant.timezone, currency: tenant.currency }; await apiRequest("tenants/current", { method: "PATCH", body: JSON.stringify(profile) }); await apiRequest("tenants/current/settings", { method: "PUT", body: JSON.stringify({ settings }) }); setMessage("Workspace settings saved."); } catch (e) { setError(e instanceof Error ? e.message : "Could not save settings."); } finally { setBusy(false); } }
    function edit(field: keyof Tenant, value: string) {
        setTenant(prev => ({ ...prev, [field]: value }));
    }
    return <div className="workspace-page"><header className="workspace-heading"><div><p className="eyebrow">WORKSPACE</p><h1>Settings</h1><p>Manage your company profile, currency, time zone, and application preferences.</p></div></header>{error && <div className="feedback error" role="alert">{error}</div>}{message && <div className="feedback success" role="status">{message}</div>}<form className="settings-card" onSubmit={save}><h2>Company profile</h2><div className="company-logo-row">{tenant.logo && <img src={tenant.logo} alt="Company logo" className="company-logo-preview" />}<label className="form-field"><span>Company logo (PNG, JPEG, or WebP; up to 3 MB)</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => void uploadLogo(event)} disabled={busy} /></label></div><div className="settings-grid">{(["name", "email", "phone", "address", "timezone", "currency"] as const).map(field => <label className="form-field" key={field}><span>{field[0].toUpperCase() + field.slice(1)}</span><input value={tenant[field] ?? ""} onChange={e => edit(field, e.target.value)} required={field === "name"} /></label>)}</div><h2>Workspace preferences</h2>{settings.length === 0 ? <p className="muted-copy">No additional preferences have been configured.</p> : <div className="settings-grid">{settings.map((setting, i) => { const display = displaySettings[setting.key] ?? { label: setting.key }; const label = setting.key === "shipment.flatRate" ? `Flat rate per shipment (${tenant.currency ?? "USD"})` : display.label; return <label className="form-field" key={setting.key}><span>{label}</span>{display.textarea ? <textarea maxLength={600} value={setting.value} onChange={e => setSettings(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} /> : <input type={display.type ?? "text"} min={display.min} max={display.max} step={display.step} required={display.required} value={setting.value} onChange={e => setSettings(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />}{display.hint && <small>{display.hint}</small>}</label>; })}</div>}<button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></form></div>;
}


