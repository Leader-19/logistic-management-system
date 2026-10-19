"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, ApiPage, apiRequest } from "../../lib/api-client";
import { showToast } from "../../ui/toast";

type Category = { id: string; name: string; createdAt?: string; _count: { products: number } };
const PAGE_SIZE = 20;

export default function CategoriesView() {
  const [items, setItems] = useState<Category[]>([]);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchNames, setBatchNames] = useState("");
  const [batchFile, setBatchFile] = useState<File | null>(null);
  const [batchErrors, setBatchErrors] = useState<Array<{ row: number; message: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), ...(search ? { search } : {}) });
      const result = await apiRequest<ApiPage<Category> | Category[]>(`products/categories?${query}`);
      if (Array.isArray(result)) {
        const filtered = result.filter(item => !search || item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
        setTotal(filtered.length);
        setItems(filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
      } else {
        setItems(Array.isArray(result.data) ? result.data : []);
        setTotal(Number.isFinite(result.total) ? result.total : 0);
      }
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to view categories." : cause instanceof Error ? cause.message : "Could not load categories.");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (notice) showToast(notice); }, [notice]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(editing ? `products/categories/${editing.id}` : "products/categories", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      setName("");
      setEditing(null);
      setFormOpen(false);
      setNotice(editing ? "Category updated successfully." : "Category created successfully.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save category.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(category: Category) {
    if (!window.confirm(`Delete category “${category.name}”?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await apiRequest(`products/categories/${category.id}`, { method: "DELETE" });
      setNotice("Category deleted successfully.");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete category.");
    } finally {
      setBusy(false);
    }
  }

  async function createBatch(event: FormEvent) {
    event.preventDefault();
    const names = batchNames.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (!batchFile && !names.length) { setError("Choose a CSV or Excel file, or enter category names."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = batchFile
        ? await apiRequest<{ createdCount: number; skippedCount: number; errors: Array<{ row: number; message: string }> }>("products/categories/import", { method: "POST", body: (() => { const data = new FormData(); data.append("file", batchFile); return data; })() })
        : await apiRequest<{ createdCount: number; skippedCount: number; errors?: Array<{ row: number; message: string }> }>("products/categories/batch", { method: "POST", body: JSON.stringify({ names }) });
      setBatchErrors(result.errors ?? []);
      setBatchOpen(false); setBatchNames(""); setBatchFile(null);
      setNotice(`Created ${result.createdCount} categories${result.skippedCount ? `; skipped ${result.skippedCount} duplicate or existing names` : ""}${result.errors?.length ? `; ${result.errors.length} invalid rows need correction` : ""}.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create categories."); }
    finally { setBusy(false); }
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault(); setPage(1); setSearch(searchInput.trim());
  }

  function cancelEdit() {
    setEditing(null);
    setName("");
    setFormOpen(false);
  }

  return <div className="workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">PRODUCT CATALOG</p><h1>Categories</h1><p>Organize products into categories for easier catalog and inventory management.</p></div><div className="heading-actions"><span className="record-count">{total} categories</span><button className="secondary-button" onClick={() => { setBatchNames(""); setBatchFile(null); setBatchErrors([]); setError(""); setBatchOpen(true); }}>Batch create</button><button className="primary-button" onClick={() => { cancelEdit(); setFormOpen(true); }}>Add category</button></div></header>
    {error && <div className="feedback error" role="alert">{error}</div>}{batchErrors.length > 0 && <section className="feedback error" role="status"><b>Some file rows need correction</b>{batchErrors.map((item, index) => <div key={`${item.row}-${index}`}>Row {item.row}: {item.message}</div>)}</section>}
    <section className="table-card"><form className="table-toolbar" onSubmit={submitSearch}><label className="search-field"><span>⌕</span><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search category name" aria-label="Search category name" /></label><button className="secondary-button">Search</button></form><div className="table-toolbar"><h2>Product categories</h2><span className="muted-copy">Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}</span></div>{loading ? <p className="state-message">Loading categories…</p> : items.length === 0 ? <p className="state-message">No categories found. Add one above or create it from Products.</p> : <div className="table-scroll"><table><thead><tr><th>Name</th><th>Products</th><th>Created</th><th>Actions</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{item.name}</td><td>{item._count.products}</td><td>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "—"}</td><td><button className="text-button" disabled={busy} onClick={() => { setEditing(item); setName(item.name); setFormOpen(true); setError(""); setNotice(""); }}>Edit</button><button className="text-button" disabled={busy || item._count.products > 0} title={item._count.products > 0 ? "Move products out of this category before deleting it." : "Delete category"} onClick={() => void remove(item)}>Delete</button></td></tr>)}</tbody></table></div>}<div className="pagination"><span>Showing {items.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div><button className="secondary-button" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={loading || page >= Math.max(1, Math.ceil(total / PAGE_SIZE))} onClick={() => setPage(value => value + 1)}>Next</button></div></div></section>
    {formOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) cancelEdit(); }}><section className="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-labelledby="category-form-title"><div className="modal-heading"><h2 id="category-form-title">{editing ? "Edit category" : "Add category"}</h2><button type="button" className="secondary-button" onClick={cancelEdit} aria-label="Close form">×</button></div><form className="data-form" onSubmit={save}><label className="form-field"><span>Category name</span><input autoFocus required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Add category"}</button><button type="button" className="secondary-button" onClick={cancelEdit}>Cancel</button></div></form></section></div>}
    {batchOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setBatchOpen(false); }}><section className="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-labelledby="category-batch-title"><div className="modal-heading"><h2 id="category-batch-title">Batch create categories</h2><button type="button" className="secondary-button" disabled={busy} onClick={() => setBatchOpen(false)} aria-label="Close form">×</button></div><form className="data-form" onSubmit={createBatch}><div className="form-field"><span>Upload CSV or Excel (.csv, .xlsx)</span><a className="template-download" download="categories-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent("name\nElectronics\nClothing\nHome goods\n")}`}>Download CSV template</a><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => { setBatchFile(event.target.files?.[0] ?? null); setError(""); }} /></div><p className="muted-copy">Use a column header named <b>name</b>, <b>category</b>, or <b>category name</b>. Maximum 100 rows and 5 MB.</p><label className="form-field"><span>Or paste category names (one per line)</span><textarea rows={5} maxLength={9000} value={batchNames} onChange={event => { setBatchNames(event.target.value); setBatchFile(null); }} placeholder={"Electronics\nClothing\nHome goods"} /></label><div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create categories"}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setBatchOpen(false)}>Cancel</button></div></form></section></div>}
  </div>;
}
