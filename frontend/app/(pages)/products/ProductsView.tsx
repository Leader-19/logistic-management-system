"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, ApiPage, apiRequest } from "../../lib/api-client";
import { showToast } from "../../ui/toast";

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
  const [status, setStatus] = useState<"active" | "inactive" | "all">("active");
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [categorySearch, setCategorySearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [scanResult, setScanResult] = useState<Product | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ page: String(page), limit: "20" });
      if (search.trim()) query.set("search", search.trim());
      query.set("status", status);
      if (selectedCategoryIds.length) query.set("categoryIds", selectedCategoryIds.join(","));
      const [items, groups] = await Promise.all([apiRequest<ApiPage<Product>>(`products?${query}`), apiRequest<ApiPage<Category> | Category[]>("products/categories?page=1&limit=100")]);
      setProducts(items.data); setTotal(items.total); setCategories(Array.isArray(groups) ? groups : groups.data); setSelectedIds([]);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to view products." : cause instanceof Error ? cause.message : "Could not load products.");
    } finally { setLoading(false); }
  }, [page, search, status, selectedCategoryIds]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (notice) showToast(notice); }, [notice]);

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
      setShowForm(false); setEditing(null); setNotice(editing ? "Product updated successfully." : "Product created successfully."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save product."); }
    finally { setBusy(false); }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await apiRequest("products/categories", { method: "POST", body: JSON.stringify({ name: categoryName }) }); setCategoryName(""); setNotice("Category created successfully."); await load(); }
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
    catch (cause) { if (cause instanceof ApiError && cause.status === 404) { setEditing(null); setShowForm(true); setScanResult(null); setScannerOpen(false); setNotice("Barcode not found. Complete the product details to add it to the catalog."); } else setError(cause instanceof Error ? cause.message : "Barcode lookup failed."); }
  }

  async function setProductActive(product: Product, isActive: boolean) {
    if (!isActive && !window.confirm(`Deactivate ${product.name}? Its stock history will remain.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`products/${product.id}`, { method: "PATCH", body: JSON.stringify({ isActive }) });
      setNotice(isActive ? "Product restored successfully." : "Product deactivated successfully.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update product status."); }
    finally { setBusy(false); }
  }

  async function deleteProduct(product: Product) {
    if (!window.confirm(`Delete ${product.name}? It will be archived so stock history is preserved.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(`products/${product.id}`, { method: "DELETE" });
      setNotice("Product deleted successfully. It was archived to preserve stock history.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete product."); }
    finally { setBusy(false); }
  }

  async function archiveSelectedProducts() {
    if (!selectedIds.length || !window.confirm(`Archive ${selectedIds.length} selected products? Stock and movement history will remain.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<{ archivedCount: number }>("products/bulk/archive", { method: "POST", body: JSON.stringify({ ids: selectedIds }) });
      setNotice(`${result.archivedCount} products archived. Stock history was retained.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not archive selected products."); }
    finally { setBusy(false); }
  }

  return <div className="workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">CATALOG</p><h1>Products</h1><p>Manage product details, categories, SKU and barcode identifiers.</p></div><span className="heading-actions"><button className="secondary-button" onClick={() => { setBarcode(""); setScanResult(null); setScannerOpen(true); }}>⌕ Scan barcode</button><button className="secondary-button" onClick={() => setCategoryOpen(true)}>Add category</button><button className="secondary-button" onClick={() => { setFile(null); setPreview(null); setImportOpen(true); }}>Import products</button></span><span className="record-count">{total} products</span></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    <section className="table-card"><div className="table-toolbar"><label className="search-field"><span>⌕</span><input value={search} onChange={event => { setPage(1); setSearch(event.target.value); }} placeholder="Search SKU, barcode or name"/></label><select className="secondary-button" value={status} aria-label="Filter products by status" onChange={event => { setPage(1); setStatus(event.target.value as "active" | "inactive" | "all"); }}><option value="active">Active products</option><option value="inactive">Inactive products</option><option value="all">All products</option></select><details className="category-filter"><summary className="secondary-button">Categories{selectedCategoryIds.length ? ` (${selectedCategoryIds.length})` : " (all)"}</summary><div className="category-filter-panel"><label className="category-filter-search"><span>Search categories</span><input type="search" value={categorySearch} onChange={event => setCategorySearch(event.target.value)} placeholder="Type a category name"/></label><div className="category-filter-options">{categories.filter(category => category.name.toLowerCase().includes(categorySearch.trim().toLowerCase())).map(category => <label key={category.id}><input type="checkbox" checked={selectedCategoryIds.includes(category.id)} onChange={event => { setPage(1); setSelectedCategoryIds(current => event.target.checked ? [...current, category.id] : current.filter(id => id !== category.id)); }}/><span>{category.name}</span></label>)}{categories.filter(category => category.name.toLowerCase().includes(categorySearch.trim().toLowerCase())).length === 0 && <p className="muted-copy">No matching categories.</p>}</div><button type="button" className="text-button" disabled={selectedCategoryIds.length === 0} onClick={() => { setPage(1); setSelectedCategoryIds([]); }}>Clear category filters</button></div></details><button className="primary-button" onClick={() => { setEditing(null); setShowForm(true); }}>Add product</button></div>
      {products.some(product=>product.isActive)&&<div className="bulk-action-bar"><span>{selectedIds.length} products selected on this page</span><button className="secondary-button danger-text" disabled={!selectedIds.length||busy} onClick={()=>void archiveSelectedProducts()}>Archive selected ({selectedIds.length})</button></div>}
      {loading ? <p className="state-message">Loading products…</p> : products.length === 0 ? <p className="state-message">{selectedCategoryIds.length ? "No products match the selected categories." : status === "inactive" ? "No inactive products." : status === "all" ? "No products match these filters." : "No products yet. Create one manually, scan a barcode, or import a file."}</p> : <div className="table-scroll"><table><thead><tr><th><input type="checkbox" aria-label="Select all active products on this page" checked={products.filter(product=>product.isActive).length>0&&products.filter(product=>product.isActive).every(product=>selectedIds.includes(product.id))} onChange={event=>setSelectedIds(event.target.checked?products.filter(product=>product.isActive).map(product=>product.id):[])}/></th><th>Image</th><th>SKU</th><th>Barcode</th><th>Product</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead><tbody>{products.map(product => <tr key={product.id}><td><input type="checkbox" aria-label={`Select ${product.name}`} disabled={!product.isActive||busy} checked={selectedIds.includes(product.id)} onChange={event=>setSelectedIds(current=>event.target.checked?[...current,product.id]:current.filter(id=>id!==product.id))}/></td><td><ProductImage url={product.imageUrl} /></td><td>{product.sku}</td><td>{product.barcode ?? "—"}</td><td>{product.name}</td><td>{product.category?.name ?? "—"}</td><td>{product.isActive ? "Active" : "Inactive"}</td><td><button className="text-button" onClick={() => { setEditing(product); setShowForm(true); }}>Edit</button>{product.isActive ? <button className="text-button" disabled={busy} onClick={() => void deleteProduct(product)}>Delete</button> : <button className="text-button" disabled={busy} onClick={() => void setProductActive(product, true)}>Restore</button>}</td></tr>)}</tbody></table></div>}
      <div className="pagination"><span>Page {page} of {Math.max(1, Math.ceil(total / 20))}</span><div><button className="secondary-button" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={page * 20 >= total || loading} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </section>
    {showForm && <div className="modal-backdrop"><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="product-form-title"><div className="modal-heading"><h2 id="product-form-title">{editing ? "Update product" : "Create product"}</h2><button className="secondary-button" onClick={() => setShowForm(false)} aria-label="Close">×</button></div><form className="data-form" onSubmit={saveProduct}><label className="form-field"><span>SKU</span><input name="sku" required maxLength={80} defaultValue={editing?.sku} placeholder="e.g. SKU-001"/><small className="form-hint">Unique code identifying this product in your catalog.</small></label><label className="form-field"><span>Barcode</span><input name="barcode" maxLength={80} defaultValue={barcode && !editing ? barcode : editing?.barcode ?? ""} placeholder="e.g. 8801234567890"/><small className="form-hint">Optional — leave empty if the product has no barcode.</small></label><label className="form-field"><span>Name</span><input name="name" required maxLength={160} defaultValue={editing?.name} placeholder="e.g. USB-C cable 1 m"/></label><label className="form-field"><span>Category</span><select name="category" defaultValue={editing?.category?.name ?? ""}><option value="">No category</option>{categories.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}</select><small className="form-hint">Missing a category? Use Add category in the page header.</small></label><label className="form-field"><span>Description</span><textarea name="description" maxLength={1000} defaultValue={editing?.description ?? ""} placeholder="Short product description (optional)"/></label><label className="form-field"><span>Product image</span><input name="image" type="file" accept="image/png,image/jpeg,image/webp" /><small className="form-hint">PNG, JPEG, or WebP · up to 3 MB</small></label><div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : editing ? "Save changes" : "Create product"}</button><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button></div></form></section></div>}
    {categoryOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setCategoryOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="category-create-title"><div className="modal-heading"><h2 id="category-create-title">Manage categories</h2><button type="button" className="secondary-button" onClick={() => setCategoryOpen(false)} aria-label="Close form">×</button></div><div className="modal-subsection"><h3 className="modal-subheading">Create a category</h3><p className="muted-copy">Group products for easier catalog management. Existing products can pick the category afterward.</p><form className="tracking-form" onSubmit={createCategory}><label className="form-field"><span>Category name</span><input autoFocus value={categoryName} onChange={event => setCategoryName(event.target.value)} required maxLength={80} placeholder="e.g. Electronics"/><small className="form-hint">Names are unique and shown as options in the product form.</small></label><button className="primary-button" disabled={busy || !categoryName.trim()}>{busy ? "Saving…" : "Create category"}</button></form></div><div className="modal-subsection"><h3 className="modal-subheading">Existing categories ({categories.length})</h3>{categories.length === 0 ? <p className="muted-copy">No categories yet — create the first one above.</p> : <div className="category-chip-list">{categories.map(category => <span className="category-chip" key={category.id}>{category.name}</span>)}</div>}</div></section></div>}
    {scannerOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setScannerOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="scanner-title"><div className="modal-heading"><h2 id="scanner-title">Handheld barcode scanner</h2><button type="button" className="secondary-button" onClick={() => setScannerOpen(false)} aria-label="Close scanner">×</button></div><p className="muted-copy">Point a handheld scanner at the barcode — it types the code and presses Enter automatically. You can also type the code manually.</p><form className="tracking-form" onSubmit={lookupBarcode}><input autoFocus className="barcode-input" inputMode="none" value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Scan or enter barcode" aria-label="Scan barcode" required/><button className="primary-button" disabled={busy}>Look up</button></form>{scanResult && <div className="scan-result-card" role="status"><ProductImage url={scanResult.imageUrl} variant="scanner"/><div><b>{scanResult.name}</b><small>SKU {scanResult.sku}{scanResult.category ? ` · ${scanResult.category.name}` : ""}</small></div><button type="button" className="text-button" onClick={() => { setEditing(scanResult); setShowForm(true); setScannerOpen(false); }}>Edit product</button></div>}<div className="row-actions"><button type="button" className="secondary-button" onClick={() => setScannerOpen(false)}>Close</button></div></section></div>}
    {importOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setImportOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-heading"><h2 id="import-title">Batch import products</h2><button type="button" className="secondary-button" onClick={() => setImportOpen(false)} aria-label="Close import">×</button></div><div className="modal-subsection"><h3 className="modal-subheading">1 · Download and fill the template</h3><p className="muted-copy">Upload CSV or Excel (.xlsx). Required columns: <b>sku</b> and <b>name</b>; optional: <b>barcode</b>, <b>category</b>, <b>description</b>. Rows are validated in a preview before importing.</p><a className="template-download" download="products-import-template.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent("sku,name,barcode,category,description\nSKU-001,Example product,8801234567890,Electronics,Optional description text\nSKU-002,Second product,,Office Supplies,Another row\n")}`}><span aria-hidden="true">⇩</span> Download CSV template</a></div><div className="modal-subsection"><h3 className="modal-subheading">2 · Select the file and preview</h3><form className="tracking-form" onSubmit={event => { event.preventDefault(); setFile(event.currentTarget.querySelector<HTMLInputElement>("input[type=file]")?.files?.[0] ?? null); void previewImport(); }}><input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => setFile(event.target.files?.[0] ?? null)}/><button className="secondary-button" disabled={!file || busy} type="button" onClick={() => void previewImport()}>{busy ? "Reading…" : "Preview import"}</button></form>{preview && <><p className="preview-summary">{preview.rows.length} valid rows ready · {preview.errors.length} row errors</p>{preview.errors.map((item, index) => <div className="feedback error" key={`${item.row}-${index}`}>Row {item.row}: {item.message}</div>)}{preview.rows.length > 0 && <button className="primary-button" disabled={busy} onClick={() => void commitImport()}>{busy ? "Importing…" : `Import ${preview.rows.length} products`}</button>}</>}</div><div className="row-actions"><button type="button" className="secondary-button" onClick={() => setImportOpen(false)}>Close</button></div></section></div>}
  </div>;
}

function ProductImage({ url, variant = "table" }: { url?: string | null; variant?: "table" | "scanner" }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <span className={`product-image-placeholder product-image-placeholder-${variant}`} role="img" aria-label="No product image"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 7 8.5-4 8.5 4v10L12 21l-8.5-4V7Z"/><path d="M3.8 7.1 12 11l8.2-3.9M12 11v9.5M8 5l8.5 4"/></svg></span>;
  return <img className={variant === "scanner" ? "scan-result-image" : "product-thumbnail"} src={url} alt="" onError={() => setFailed(true)} />;
}

