"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, ApiPage, apiRequest } from "../../lib/api-client";

type Warehouse = { id: string; name: string; address?: string };
type Product = { id: string; sku: string; name: string; barcode?: string | null };
type Balance = { id: string; quantity: string; product: Product & { category?: { name: string } | null }; warehouse: Warehouse };
type Movement = { id: string; quantityChange: string; quantityAfter: string; reason: string; recordedAt: string; product: Product; warehouse: Warehouse };

export default function InventoryView() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
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

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = warehouseId ? `?warehouseId=${encodeURIComponent(warehouseId)}&limit=100` : "?limit=100";
      const [warehouseData, productData, balanceData, movementData] = await Promise.all([
        apiRequest<Warehouse[]>("warehouses"), apiRequest<ApiPage<Product>>("products?limit=100"),
        apiRequest<ApiPage<Balance>>(`warehouses/inventory${query}`), apiRequest<ApiPage<Movement>>(`warehouses/movements${query}`),
      ]);
      setWarehouses(warehouseData); setProducts(productData.data); setBalances(balanceData.data); setMovements(movementData.data);
      if (!warehouseId && warehouseData[0]) setWarehouseId(warehouseData[0].id);
    } catch (cause) { setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to view inventory." : cause instanceof Error ? cause.message : "Could not load inventory."); }
    finally { setLoading(false); }
  }, [warehouseId]);
  useEffect(() => { void load(); }, [load]);

  async function addWarehouse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { const warehouse = await apiRequest<Warehouse>("warehouses", { method: "POST", body: JSON.stringify({ name: newWarehouse }) }); setNotice("Warehouse created."); setNewWarehouse(""); setWarehouseId(warehouse.id); }
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
      setNotice(direction === "receive" ? "Stock receipt recorded." : "Stock removal recorded."); setAmount(""); setReason(""); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record stock movement."); }
    finally { setBusy(false); }
  }

  return <div className="workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">WAREHOUSE</p><h1>Inventory</h1><p>Current stock and an append-only history of receipts and adjustments.</p></div></header>
    {error && <div className="feedback error" role="alert">{error}</div>}{notice && <div className="feedback success" role="status">{notice}</div>}
    <section className="settings-card"><h2>Warehouses</h2><div className="tracking-form"><label className="form-field"><span>Active warehouse</span><select value={warehouseId} onChange={event => setWarehouseId(event.target.value)}><option value="">All warehouses</option>{warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><form onSubmit={addWarehouse} className="tracking-form"><input value={newWarehouse} onChange={event => setNewWarehouse(event.target.value)} placeholder="New warehouse name" aria-label="New warehouse name" required maxLength={120}/><button className="secondary-button" disabled={busy}>Add warehouse</button></form></div></section>
    <section className="settings-card"><h2>Receive or adjust stock</h2>{warehouses.length === 0 ? <p>Create a warehouse before recording stock.</p> : products.length === 0 ? <p>Create products before receiving stock.</p> : <form className="data-form" onSubmit={adjustStock}><label className="form-field"><span>Warehouse</span><select required value={warehouseId} onChange={event => setWarehouseId(event.target.value)}>{warehouses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-field"><span>Product</span><select required value={productId} onChange={event => setProductId(event.target.value)}><option value="">Select product…</option>{products.map(product => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label><div className="tracking-form"><input inputMode="none" value={barcode} onChange={event => setBarcode(event.target.value)} placeholder="Or scan a product barcode" aria-label="Scan a product barcode"/><button type="button" className="secondary-button" onClick={() => void findBarcode()}>Find barcode</button></div><label className="form-field"><span>Movement</span><select value={direction} onChange={event => setDirection(event.target.value)}><option value="receive">Receive stock</option><option value="remove">Remove stock</option></select></label><label className="form-field"><span>Quantity</span><input type="number" min="0.001" step="0.001" required value={amount} onChange={event => setAmount(event.target.value)}/></label><label className="form-field"><span>Reason</span><input required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} placeholder="Purchase receipt, damage, count correction…"/></label><button className="primary-button" disabled={busy || !warehouseId || !productId}>{busy ? "Saving…" : "Record stock movement"}</button></form>}</section>
    <section className="table-card"><h2>Stock on hand</h2>{loading ? <p className="state-message">Loading inventory…</p> : balances.length === 0 ? <p className="state-message">No stock recorded for this selection.</p> : <div className="table-scroll"><table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Warehouse</th><th>On hand</th></tr></thead><tbody>{balances.map(balance => <tr key={balance.id}><td>{balance.product.name}</td><td>{balance.product.sku}</td><td>{balance.product.category?.name ?? "—"}</td><td>{balance.warehouse.name}</td><td>{balance.quantity}</td></tr>)}</tbody></table></div>}</section>
    <section className="table-card"><h2>Recent stock movements</h2>{loading ? <p className="state-message">Loading movements…</p> : movements.length === 0 ? <p className="state-message">No stock movements recorded yet.</p> : <div className="table-scroll"><table><thead><tr><th>When</th><th>Product</th><th>Warehouse</th><th>Change</th><th>After</th><th>Reason</th></tr></thead><tbody>{movements.map(movement => <tr key={movement.id}><td>{new Date(movement.recordedAt).toLocaleString()}</td><td>{movement.product.name} · {movement.product.sku}</td><td>{movement.warehouse.name}</td><td>{movement.quantityChange}</td><td>{movement.quantityAfter}</td><td>{movement.reason}</td></tr>)}</tbody></table></div>}</section>
  </div>;
}
