"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, ApiPage, apiRequest } from "../../lib/api-client";
import { showToast } from "../../ui/toast";

type PackageType = { id: string; code: string; name: string; lengthCm: string | number; widthCm: string | number; heightCm: string | number; tareWeightGrams: number; maxLoadGrams: number; stackable: boolean; isActive: boolean };
const PAGE_SIZE = 20;

export default function PackageTypesView() {
  const [types, setTypes] = useState<PackageType[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { const result = await apiRequest<ApiPage<PackageType>>(`packaging/types?page=${page}&limit=${PAGE_SIZE}`); setTypes(result.data); setTotal(result.total); }
    catch (cause) { setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to view package types." : cause instanceof Error ? cause.message : "Could not load package types."); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (notice) showToast(notice); }, [notice]);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const number = (name: string) => Number(values.get(name));
    const body = { code: String(values.get("code") ?? "").trim(), name: String(values.get("name") ?? "").trim(), lengthCm: number("lengthCm"), widthCm: number("widthCm"), heightCm: number("heightCm"), tareWeightGrams: number("tareWeightGrams"), maxLoadGrams: number("maxLoadGrams"), stackable: values.get("stackable") === "on" };
    try { await apiRequest("packaging/types", { method: "POST", body: JSON.stringify(body) }); form.reset(); setCreateOpen(false); setNotice("Package type created successfully."); if (page !== 1) setPage(1); else await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create package type."); }
    finally { setBusy(false); }
  }

  async function setActive(type: PackageType, isActive: boolean) {
    if (!isActive && !window.confirm(`Deactivate ${type.name}? Existing shipment records will remain unchanged.`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await apiRequest(`packaging/types/${type.id}/status`, { method: "PATCH", body: JSON.stringify({ isActive }) }); setNotice(isActive ? "Package type activated successfully." : "Package type deactivated successfully."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update package type."); }
    finally { setBusy(false); }
  }

  return <div className="workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">PACKAGING</p><h1>Package types</h1><p>Set the package sizes and weight limits used by your logistics team.</p></div><div className="heading-actions"><span className="record-count">{total} types</span><button className="primary-button" onClick={() => setCreateOpen(true)}>Add package type</button></div></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    {createOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setCreateOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="package-type-form-title"><div className="modal-heading"><h2 id="package-type-form-title">Add package type</h2><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)} aria-label="Close form">×</button></div><form className="data-form" onSubmit={create}>
      <label className="form-field"><span>Code</span><input name="code" required maxLength={40} placeholder="SMALL-BOX" /></label>
      <label className="form-field"><span>Name</span><input name="name" required maxLength={120} placeholder="Small box" /></label>
      <label className="form-field"><span>Length (cm)</span><input name="lengthCm" type="number" min="0.01" step="0.01" required /></label>
      <label className="form-field"><span>Width (cm)</span><input name="widthCm" type="number" min="0.01" step="0.01" required /></label>
      <label className="form-field"><span>Height (cm)</span><input name="heightCm" type="number" min="0.01" step="0.01" required /></label>
      <label className="form-field"><span>Tare weight (g)</span><input name="tareWeightGrams" type="number" min="0" step="1" defaultValue="0" required /></label>
      <label className="form-field"><span>Maximum load (g)</span><input name="maxLoadGrams" type="number" min="1" step="1" required /></label>
      <label className="form-field"><span><input name="stackable" type="checkbox" defaultChecked /> Stackable</span></label>
      <div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Create package type"}</button><button type="button" className="secondary-button" onClick={() => setCreateOpen(false)}>Cancel</button></div>
    </form></section></div>}
    <section className="table-card"><h2>Workspace package types</h2>
      {loading ? <p className="state-message">Loading package types…</p> : types.length === 0 ? <p className="state-message">No package types yet. Add a box, envelope, pallet, bag, drum, or crate to get started.</p> : <div className="table-scroll"><table><thead><tr><th>Code</th><th>Name</th><th>Dimensions (cm)</th><th>Tare (g)</th><th>Max load (g)</th><th>Stackable</th><th>Status</th><th>Action</th></tr></thead><tbody>{types.map(type => <tr key={type.id}><td>{type.code}</td><td>{type.name}</td><td>{type.lengthCm} × {type.widthCm} × {type.heightCm}</td><td>{type.tareWeightGrams}</td><td>{type.maxLoadGrams}</td><td>{type.stackable ? "Yes" : "No"}</td><td>{type.isActive ? "Active" : "Inactive"}</td><td><button className="text-button" disabled={busy} onClick={() => void setActive(type, !type.isActive)}>{type.isActive ? "Deactivate" : "Activate"}</button></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Showing {types.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div><button className="secondary-button" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={loading || page >= Math.max(1, Math.ceil(total / PAGE_SIZE))} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </section>
  </div>;
}
