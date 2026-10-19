"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, ApiPage, apiRequest } from "../../lib/api-client";
import { showToast } from "../../ui/toast";

type Warehouse = { id: string; name: string; address?: string };
type Product = { id: string; sku: string; name: string; barcode?: string | null };
type Balance = { id: string; quantity: string; product: Product & { category?: { name: string } | null }; warehouse: Warehouse };
type Movement = { id: string; quantityChange: string; quantityAfter: string; reason: string; recordedAt: string; product: Product; warehouse: Warehouse };

export default function InventoryView() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [balancePage, setBalancePage] = useState(1);
  const [movementPage, setMovementPage] = useState(1);
  const [balanceTotal, setBalanceTotal] = useState(0);
  const [movementTotal, setMovementTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");
  const [lowStockThreshold, setLowStockThreshold] = useState("10");
  const [movementDirection, setMovementDirection] = useState("all");
  const [warehouseId, setWarehouseId] = useState("");
  const [productId, setProductId] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState("receive");
  const [reason, setReason] = useState("");
  const [newWarehouse, setNewWarehouse] = useState("");
  const [barcode, setBarcode] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warehouseOpen, setWarehouseOpen] = useState(false);
  const [stockOpen, setStockOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const inventoryQuery = new URLSearchParams({ page: String(balancePage), limit: "20", ...(stockFilter !== "all" ? { stockFilter, lowStockThreshold: lowStockThreshold || "10" } : {}), ...(warehouseId ? { warehouseId } : {}), ...(search ? { search } : {}) });
      const movementQuery = new URLSearchParams({ page: String(movementPage), limit: "20", ...(movementDirection !== "all" ? { direction: movementDirection } : {}), ...(warehouseId ? { warehouseId } : {}), ...(search ? { search } : {}) });
      const [warehouseData, productData, balanceData, movementData] = await Promise.all([
        apiRequest<ApiPage<Warehouse>>("warehouses?page=1&limit=100"), apiRequest<ApiPage<Product>>("products?limit=100"),
        apiRequest<ApiPage<Balance>>(`warehouses/inventory?${inventoryQuery}`), apiRequest<ApiPage<Movement>>(`warehouses/movements?${movementQuery}`),
      ]);
      setWarehouses(warehouseData.data); setProducts(productData.data); setBalances(balanceData.data); setBalanceTotal(balanceData.total); setMovements(movementData.data); setMovementTotal(movementData.total);
      if (!warehouseId && warehouseData.data[0]) setWarehouseId(warehouseData.data[0].id);
    } catch (cause) { setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to view inventory." : cause instanceof Error ? cause.message : "Could not load inventory."); }
    finally { setLoading(false); }
  }, [warehouseId, balancePage, movementPage, search, stockFilter, lowStockThreshold, movementDirection]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (notice) showToast(notice); }, [notice]);

  async function addWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { const warehouse = await apiRequest<Warehouse>("warehouses", { method: "POST", body: JSON.stringify({ name: newWarehouse }) }); setNotice("Warehouse created successfully."); setNewWarehouse(""); setWarehouseId(warehouse.id); setWarehouseOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create warehouse."); }
    finally { setBusy(false); }
  }

  async function findBarcode() {
    setError("");
    try { const product = await apiRequest<Product>(`products/barcode/${encodeURIComponent(barcode.trim())}`); setProductId(product.id); setNotice(`Selected ${product.name} (${product.sku}).`); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Barcode lookup failed."); }
  }

  async function adjustStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const quantityChange = Number(amount) * (direction === "receive" ? 1 : -1);
    try {
      await apiRequest(`warehouses/${warehouseId}/stock`, { method: "POST", body: JSON.stringify({ productId, quantityChange, reason }) });
      setNotice(direction === "receive" ? "Stock receipt recorded successfully." : "Stock removal recorded successfully."); setAmount(""); setReason(""); setStockOpen(false); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record stock movement."); }
    finally { setBusy(false); }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBalancePage(1); setMovementPage(1); setSearch(searchInput.trim());
  }

  const balancePages = Math.max(1, Math.ceil(balanceTotal / 20));
  const movementPages = Math.max(1, Math.ceil(movementTotal / 20));

  return <div className="workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">WAREHOUSE</p><h1>Inventory</h1><p>Current stock and an append-only history of receipts and adjustments.</p></div><div className="heading-actions"><button type="button" className="secondary-button" onClick={() => setWarehouseOpen(true)}>Add warehouse</button><button type="button" className="primary-button" disabled={warehouses.length === 0 || products.length === 0} onClick={() => setStockOpen(true)}>Record stock movement</button></div></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    <section className="settings-card"><h2>Inventory filters</h2><form className="tracking-form" onSubmit={submitSearch}><label className="form-field"><span>Warehouse</span><select value={warehouseId} onChange={event => { setWarehouseId(event.target.value); setBalancePage(1); setMovementPage(1); }}><option value="">All warehouses</option>{warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>Search product / SKU / reason</span><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Search inventory and movements" /></label><button className="secondary-button">Search</button><span className="muted-copy">{warehouses.length} locations</span></form></section>
    {warehouseOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setWarehouseOpen(false); }}><section className="modal-card modal-card-compact" role="dialog" aria-modal="true" aria-labelledby="warehouse-create-title"><div className="modal-heading"><h2 id="warehouse-create-title">Add warehouse</h2><button type="button" className="secondary-button" onClick={() => setWarehouseOpen(false)} aria-label="Close form">×</button></div><form className="data-form" onSubmit={addWarehouse}>{error && <div className="feedback error" role="alert">{error}</div>}<label className="form-field"><span>Warehouse name</span><input autoFocus value={newWarehouse} onChange={event => setNewWarehouse(event.target.value)} required maxLength={120}/></label><div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Create warehouse"}</button><button type="button" className="secondary-button" onClick={() => setWarehouseOpen(false)}>Cancel</button></div></form></section></div>}
    {stockOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setStockOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="stock-movement-title"><div className="modal-heading"><h2 id="stock-movement-title">Receive or adjust stock</h2><button type="button" className="secondary-button" onClick={() => setStockOpen(false)} aria-label="Close form">×</button></div><form className="data-form" onSubmit={adjustStock}>{error && <div className="feedback error" role="alert">{error}</div>}<label className="form-field"><span>Warehouse</span><select required value={warehouseId} onChange={event => setWarehouseId(event.target.value)}>{warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>Product</span><select required value={productId} onChange={event => setProductId(event.target.value)}><option value="">Select product…</option>{products.map(product => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label><div className="tracking-form"><input inputMode="none" value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Or scan a product barcode" aria-label="Scan a product barcode"/><button type="button" className="secondary-button" onClick={() => void findBarcode()}>Find barcode</button></div><label className="form-field"><span>Movement</span><select value={direction} onChange={event => setDirection(event.target.value)}><option value="receive">Receive stock</option><option value="remove">Remove stock</option></select></label><label className="form-field"><span>Quantity</span><input type="number" min="0.001" step="0.001" required value={amount} onChange={event => setAmount(event.target.value)}/></label><label className="form-field"><span>Reason</span><input required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Purchase receipt, damage, count correction…"/></label><div className="row-actions"><button className="primary-button" disabled={busy || !warehouseId || !productId}>{busy ? "Saving…" : "Record movement"}</button><button type="button" className="secondary-button" onClick={() => setStockOpen(false)}>Cancel</button></div></form></section></div>}
    <section className="table-card"><div className="table-toolbar"><h2>Stock on hand · {balanceTotal} records</h2><div className="heading-actions"><label className="platform-status-filter"><span>Stock</span><select value={stockFilter} onChange={event => { setStockFilter(event.target.value); setBalancePage(1); }}><option value="all">All stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></label>{stockFilter === "low" && <label className="platform-status-filter"><span>Low at or below</span><input type="number" min="0" step="0.001" value={lowStockThreshold} onChange={event => { setLowStockThreshold(event.target.value); setBalancePage(1); }} /></label>}</div></div>{loading ? <p className="state-message">Loading inventory…</p> : balances.length === 0 ? <p className="state-message">No stock records match these filters.</p> : <div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Warehouse</th><th>On hand</th></tr></thead><tbody>{balances.map(balance => <tr key={balance.id}><td>{balance.product.name}</td><td>{balance.product.sku}</td><td>{balance.product.category?.name ?? "—"}</td><td>{balance.warehouse.name}</td><td>{balance.quantity}</td></tr>)}</tbody></table></div>}<div className="pagination"><span>Showing {balances.length ? (balancePage - 1) * 20 + 1 : 0}–{Math.min(balancePage * 20, balanceTotal)} of {balanceTotal}</span><div><button className="secondary-button" disabled={loading || balancePage <= 1} onClick={() => setBalancePage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={loading || balancePage >= balancePages} onClick={() => setBalancePage(value => value + 1)}>Next</button></div></div></section>
    <section className="table-card"><div className="table-toolbar"><h2>Stock movements · {movementTotal} records</h2><label className="platform-status-filter"><span>Direction</span><select value={movementDirection} onChange={event => { setMovementDirection(event.target.value); setMovementPage(1); }}><option value="all">All movements</option><option value="in">Stock in</option><option value="out">Stock out</option></select></label></div>{loading ? <p className="state-message">Loading movements…</p> : movements.length === 0 ? <p className="state-message">No stock movements match these filters.</p> : <div className="table-scroll"><table><thead><tr><th>When</th><th>Product</th><th>Warehouse</th><th>Change</th><th>After</th><th>Reason</th></tr></thead><tbody>{movements.map(movement => <tr key={movement.id}><td>{new Date(movement.recordedAt).toLocaleString()}</td><td>{movement.product.name} · {movement.product.sku}</td><td>{movement.warehouse.name}</td><td>{movement.quantityChange}</td><td>{movement.quantityAfter}</td><td>{movement.reason}</td></tr>)}</tbody></table></div>}<div className="pagination"><span>Showing {movements.length ? (movementPage - 1) * 20 + 1 : 0}–{Math.min(movementPage * 20, movementTotal)} of {movementTotal}</span><div><button className="secondary-button" disabled={loading || movementPage <= 1} onClick={() => setMovementPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={loading || movementPage >= movementPages} onClick={() => setMovementPage(value => value + 1)}>Next</button></div></div></section>
  </div>;
}
