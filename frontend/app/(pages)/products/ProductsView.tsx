"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, ApiPage, apiRequest } from "../../lib/api-client";

type Category = { id: string; name: string };
type Product = { id: string; sku: string; barcode?: string | null; name: string; imageUrl?: string | null; description?: string | null; isActive: boolean; category?: Category | null };
type ImportRow = { sku: string; barcode?: string; name: string; category?: string; description?: string };
type ImportPreview = { rows: ImportRow[]; errors: { row: number; message: string }[] };

export default function ProductsView() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ page: String(page), limit: "20" });
      if (search.trim()) query.set("search", search.trim());
      const [items, groups] = await Promise.all([apiRequest<ApiPage<Product>>(`products?${query}`), apiRequest<Category[]>("products/categories")]);
      setProducts(items.data); setTotal(items.total); setCategories(groups);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to view products." : cause instanceof Error ? cause.message : "Could not load products.");
    } finally { setLoading(false); }
  }, [page, search]);

  useEffect(() => { void load(); }, [load]);

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const values = new FormData(event.currentTarget);
    const image = values.get("image");
    const body = { sku: String(values.get("sku") ?? "").trim(), barcode: String(values.get("barcode") ?? "").trim() || undefined, name: String(values.get("name") ?? "").trim(), category: String(values.get("category") ?? "") || undefined, description: String(values.get("description") ?? "").trim() || undefined };
    try {
      const saved = await apiRequest<Product>(editing ? `products/${editing.id}` : "products", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) });
      if (image instanceof File && image.size > 0) {
        if (!["image/png", "image/jpeg", "image/webp"].includes(image.type) || image.size > 3 * 1024 * 1024) throw new Error("Choose a PNG, JPEG, or WebP image up to 3 MB.");
        const upload = new FormData(); upload.set("file", image);
        const response = await fetch(`/api/products/${saved.id}/image`, { method: "POST", body: upload });
        if (!response.ok) { const result = await response.json().catch(() => null); throw new Error(result && typeof result.message === "string" ? result.message : "Product image upload failed."); }
      }
      setShowForm(false); setEditing(null); setNotice(editing ? "Product updated." : "Product created."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save product."); }
    finally { setBusy(false); }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await apiRequest("products/categories", { method: "POST", body: JSON.stringify({ name: categoryName }) }); setCategoryName(""); setNotice("Category created."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create category."); }
    finally { setBusy(false); }
  }

  async function previewImport() {
    if (!file) return;
    setBusy(true); setError(""); setPreview(null);
    try { const body = new FormData(); body.set("file", file); setPreview(await apiRequest<ImportPreview>("products/import/preview", { method: "POST", body })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not read import file."); }
    finally { setBusy(false); }
  }

  async function commitImport() {
    if (!preview?.rows.length) return;
    setBusy(true); setError("");
    try { const result = await apiRequest<{ created: number; errors: { row: number; message: string }[] }>("products/import", { method: "POST", body: JSON.stringify({ rows: preview.rows }) }); setNotice(`Imported ${result.created} products.`); setPreview({ rows: [], errors: [...preview.errors, ...result.errors] }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not import products."); }
    finally { setBusy(false); }
  }

  async function lookupBarcode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice("");
    try { const product = await apiRequest<Product>(`products/barcode/${encodeURIComponent(barcode.trim())}`); setScanResult(product); setNotice(`${product.name} · SKU ${product.sku}`); }
    catch (cause) { if (cause instanceof ApiError && cause.status === 404) { setEditing(null); setShowForm(true); setScanResult(null); setNotice("Barcode not found. Complete the product details to add it to the catalog."); } else setError(cause instanceof Error ? cause.message : "Barcode lookup failed."); }
  }

  async function deactivate(product: Product) {
    if (!window.confirm(`Deactivate ${product.name}? Its stock history will remain.`)) return;
    setBusy(true); setError("");
    try { await apiRequest(`products/${product.id}`, { method: "PATCH", body: JSON.stringify({ isActive: false }) }); setNotice("Product deactivated."); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not deactivate product."); }
    finally { setBusy(false); }
  }

  return <div className="workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">CATALOG</p><h1>Products</h1><p>Manage product details, categories, SKU and barcode identifiers.</p></div><span className="record-count">{total} products</span></header>
    {error && <div className="feedback error" role="alert">{error}</div>}{notice && <div className="feedback success" role="status">{notice}</div>}
    <section className="settings-card"><h2>Handheld barcode scanner</h2><form className="tracking-form" onSubmit={lookupBarcode}><input autoFocus inputMode="none" value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Scan or enter barcode" aria-label="Scan barcode" required/><button className="primary-button">Look up</button></form>{scanResult && <p>{scanResult.name} · {scanResult.sku}{scanResult.category ? ` · ${scanResult.category.name}` : ""}</p>}</section>
    <section className="settings-card"><h2>Categories</h2><div className="settings-grid">{categories.map(category => <span key={category.id}>{category.name}</span>)}</div><form className="tracking-form" onSubmit={createCategory}><input value={categoryName} onChange={event => setCategoryName(event.target.value)} placeholder="New category" aria-label="New category" required maxLength={80}/><button className="secondary-button" disabled={busy}>Add category</button></form></section>
    <section className="settings-card"><h2>Batch import</h2><p>Upload CSV or Excel (.xlsx). Columns: sku, name, barcode, category, description. Preview validates rows before import.</p><div className="tracking-form"><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => setFile(event.target.files?.[0] ?? null)}/><button className="secondary-button" disabled={!file || busy} onClick={() => void previewImport()}>{busy ? "Reading…" : "Preview import"}</button></div>{preview && <><p>{preview.rows.length} valid rows ready · {preview.errors.length} row errors</p>{preview.errors.map((item, index) => <div className="feedback error" key={`${item.row}-${index}`}>Row {item.row}: {item.message}</div>)}{preview.rows.length > 0 && <button className="primary-button" disabled={busy} onClick={() => void commitImport()}>{busy ? "Importing…" : `Import ${preview.rows.length} products`}</button>}</>}</section>
    <section className="table-card"><div className="table-toolbar"><label className="search-field"><span>⌕</span><input value={search} onChange={event => { setPage(1); setSearch(event.target.value); }} placeholder="Search SKU, barcode or name"/></label><button className="primary-button" onClick={() => { setEditing(null); setShowForm(true); }}>Add product</button></div>
      {loading ? <p className="state-message">Loading products…</p> : products.length === 0 ? <p className="state-message">No products yet. Create one manually, scan a barcode, or import a file.</p> : <div className="table-scroll"><table><thead><tr><th>Image</th><th>SKU</th><th>Barcode</th><th>Product</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>{products.map(product => <tr key={product.id}><td>{product.imageUrl ? <img className="product-thumbnail" src={product.imageUrl} alt="" /> : "—"}</td><td>{product.sku}</td><td>{product.barcode ?? "—"}</td><td>{product.name}</td><td>{product.category?.name ?? "—"}</td><td>{product.isActive ? "Active" : "Inactive"}</td><td><button className="text-button" onClick={() => { setEditing(product); setShowForm(true); }}>Edit</button><button className="text-button danger-text" disabled={busy} onClick={() => void deactivate(product)}>Deactivate</button></td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Page {page} of {Math.max(1, Math.ceil(total / 20))}</span><div><button className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={page * 20 >= total || loading} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </section>
    {showForm && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="product-form-title"><div className="modal-heading"><h2 id="product-form-title">{editing ? "Update product" : "Create product"}</h2><button className="secondary-button" onClick={() => setShowForm(false)} aria-label="Close">×</button></div><form className="data-form" onSubmit={saveProduct}><label className="form-field"><span>SKU</span><input name="sku" required maxLength={80} defaultValue={editing?.sku}/></label><label className="form-field"><span>Barcode</span><input name="barcode" maxLength={80} defaultValue={barcode && !editing ? barcode : editing?.barcode ?? ""}/></label><label className="form-field"><span>Name</span><input name="name" required maxLength={160} defaultValue={editing?.name}/></label><label className="form-field"><span>Category</span><select name="category" defaultValue={editing?.category?.name ?? ""}><option value="">No category</option>{categories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}</select></label><label className="form-field"><span>Description</span><textarea name="description" maxLength={1000} defaultValue={editing?.description ?? ""}/></label><label className="form-field"><span>Product image (PNG, JPEG, or WebP; up to 3 MB)</span><input name="image" type="file" accept="image/png,image/jpeg,image/webp" /></label><div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create product"}</button><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button></div></form></section></div>}
  </div>;
}

