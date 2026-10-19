"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, ApiPage, apiRequest } from "../../lib/api-client";
import { showToast } from "../../ui/toast";

type Supplier = { id: string; name: string; email: string | null; phone: string | null; address: string | null; _count?: { purchaseOrders: number } };
type Warehouse = { id: string; name: string };
type Product = { id: string; sku: string; name: string };
type OrderLine = { id: string; quantity: string; receivedQuantity: string; unitCost: string; product: Product };
type PurchaseOrder = { id: string; orderNumber: string; status: string; currency: string; expectedAt: string | null; createdAt: string; supplier: { id: string; name: string }; warehouse: { id: string; name: string }; lines: OrderLine[]; _count: { receipts: number } };
type FormLine = { productId: string; quantity: string; unitCost: string };
const PAGE_SIZE = 20;
const SUPPLIER_PAGE_SIZE = 20;

export default function SupplyChainView() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<Supplier[]>([]);
  const [supplierPage, setSupplierPage] = useState(1);
  const [supplierTotal, setSupplierTotal] = useState(0);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null);
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<FormLine[]>([{ productId: "", quantity: "1", unitCost: "0" }]);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const orderQuery = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), ...(search ? { search } : {}), ...(status ? { status } : {}) });
      const [supplierResult, supplierOptionPage, warehouseList, productPage, orderPage] = await Promise.all([
        apiRequest<ApiPage<Supplier>>(`supply-chain/suppliers?page=${supplierPage}&limit=${SUPPLIER_PAGE_SIZE}`),
        apiRequest<ApiPage<Supplier>>("supply-chain/suppliers?page=1&limit=100"),
        apiRequest<ApiPage<Warehouse>>("warehouses?page=1&limit=100"),
        apiRequest<ApiPage<Product>>("products?status=active&limit=100"),
        apiRequest<ApiPage<PurchaseOrder>>(`supply-chain/purchase-orders?${orderQuery}`),
      ]);
      setSuppliers(supplierResult.data); setSupplierTotal(supplierResult.total); setSupplierOptions(supplierOptionPage.data); setWarehouses(warehouseList.data); setProducts(productPage.data); setOrders(orderPage.data); setTotal(orderPage.total);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 403 ? "You do not have permission to view Supply Chain." : cause instanceof Error ? cause.message : "Could not load Supply Chain data.");
    } finally { setLoading(false); }
  }, [page, search, status, supplierPage]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (notice) showToast(notice); }, [notice]);

  async function createSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = new FormData(event.currentTarget);
    try {
      await apiRequest("supply-chain/suppliers", { method: "POST", body: JSON.stringify({ name: values.get("name"), email: values.get("email") || undefined, phone: values.get("phone") || undefined, address: values.get("address") || undefined, notes: values.get("notes") || undefined }) });
      setSupplierOpen(false); setNotice("Supplier created."); if (supplierPage !== 1) setSupplierPage(1); else await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create supplier."); }
    finally { setBusy(false); }
  }

  async function createOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const values = new FormData(event.currentTarget);
    try {
      await apiRequest("supply-chain/purchase-orders", { method: "POST", body: JSON.stringify({ supplierId: values.get("supplierId"), warehouseId: values.get("warehouseId"), expectedAt: values.get("expectedAt") || undefined, notes: values.get("notes") || undefined, lines: lines.filter(line => line.productId).map(line => ({ ...line, quantity: line.quantity.trim(), unitCost: line.unitCost.trim() })) }) });
      setOrderOpen(false); setLines([{ productId: "", quantity: "1", unitCost: "0" }]); setNotice("Draft purchase order created."); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create purchase order."); }
    finally { setBusy(false); }
  }

  async function issueOrder(order: PurchaseOrder) {
    setBusy(true); setError("");
    try { await apiRequest(`supply-chain/purchase-orders/${order.id}/issue`, { method: "POST", body: "{}" }); setNotice(`${order.orderNumber} issued to supplier.`); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not issue purchase order."); }
    finally { setBusy(false); }
  }

  function openReceive(order: PurchaseOrder) {
    setReceiving(order);
    setReceiveQuantities(Object.fromEntries(order.lines.map(line => [line.id, String(Math.max(0, Number(line.quantity) - Number(line.receivedQuantity)))])));
  }

  async function receiveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!receiving) return;
    setBusy(true); setError("");
    try {
      const received = receiving.lines.map(line => ({ lineId: line.id, quantity: receiveQuantities[line.id]?.trim() ?? "0" })).filter(line => Number(line.quantity) > 0);
      await apiRequest(`supply-chain/purchase-orders/${receiving.id}/receive`, { method: "POST", body: JSON.stringify({ lines: received }) });
      setReceiving(null); setNotice(`Stock received into ${receiving.warehouse.name}. Inventory balances and movement history were updated.`); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not receive purchase order."); }
    finally { setBusy(false); }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); setSearch(searchInput.trim()); }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return <div className="workspace-page">
    <header className="workspace-heading"><div><p className="eyebrow">PROCUREMENT & INVENTORY</p><h1>Supply chain</h1><p>Manage suppliers, order products, and receive stock directly into warehouse inventory.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => setSupplierOpen(true)}>Add supplier</button><button className="primary-button" disabled={!suppliers.length || !warehouses.length || !products.length} onClick={() => { setLines([{ productId: "", quantity: "1", unitCost: "0" }]); setOrderOpen(true); }}>Create purchase order</button></div></header>
    {error && <div className="feedback error" role="alert">{error}</div>}
    <section className="table-card"><div className="table-toolbar"><div><h2>Suppliers · {supplierTotal}</h2><span className="muted-copy">{suppliers.reduce((sum, supplier) => sum + (supplier._count?.purchaseOrders ?? 0), 0)} purchase orders on this page</span></div><button className="secondary-button" onClick={() => setSupplierOpen(true)}>Add supplier</button></div>{loading ? <p className="state-message">Loading suppliers…</p> : suppliers.length === 0 ? <p className="state-message">No suppliers yet. Add a supplier to start purchasing.</p> : <div className="table-scroll"><table><thead><tr><th>Supplier</th><th>Email</th><th>Phone</th><th>Orders</th></tr></thead><tbody>{suppliers.map(supplier => <tr key={supplier.id}><td>{supplier.name}<small className="muted-copy">{supplier.address ?? ""}</small></td><td>{supplier.email ?? "—"}</td><td>{supplier.phone ?? "—"}</td><td>{supplier._count?.purchaseOrders ?? 0}</td></tr>)}</tbody></table></div>}<div className="pagination"><span>Showing {suppliers.length ? (supplierPage - 1) * SUPPLIER_PAGE_SIZE + 1 : 0}–{Math.min(supplierPage * SUPPLIER_PAGE_SIZE, supplierTotal)} of {supplierTotal}</span><div><button className="secondary-button" disabled={loading || supplierPage <= 1} onClick={() => setSupplierPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={loading || supplierPage >= Math.max(1, Math.ceil(supplierTotal / SUPPLIER_PAGE_SIZE))} onClick={() => setSupplierPage(value => value + 1)}>Next</button></div></div></section>
    <section className="table-card"><form className="table-toolbar" onSubmit={submitSearch}><label className="search-field"><span>⌕</span><input value={searchInput} onChange={event => setSearchInput(event.target.value)} placeholder="Order number, supplier, or warehouse" aria-label="Search purchase orders" /></label><label className="platform-status-filter"><span>Status</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option><option value="DRAFT">Draft</option><option value="ORDERED">Ordered</option><option value="PARTIALLY_RECEIVED">Partially received</option><option value="RECEIVED">Received</option><option value="CANCELLED">Cancelled</option></select></label><button className="secondary-button">Search</button><button type="button" className="secondary-button" onClick={() => void load()}>Refresh</button></form><div className="table-toolbar"><h2>Purchase orders · {total}</h2><span className="muted-copy">Page {page} of {totalPages}</span></div>{loading ? <p className="state-message">Loading purchase orders…</p> : orders.length === 0 ? <p className="state-message">No purchase orders match these filters.</p> : <div className="table-scroll"><table><thead><tr><th>Order</th><th>Supplier</th><th>Warehouse</th><th>Items</th><th>Status</th><th>Expected</th><th>Actions</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td>{order.orderNumber}<small className="muted-copy">{new Date(order.createdAt).toLocaleDateString()}</small></td><td>{order.supplier.name}</td><td>{order.warehouse.name}</td><td>{order.lines.map(line => `${line.product.sku} · ${line.receivedQuantity}/${line.quantity}`).join(", ")}</td><td>{order.status.replaceAll("_", " ")}</td><td>{order.expectedAt ? new Date(order.expectedAt).toLocaleDateString() : "—"}</td><td><div className="platform-tenant-actions">{order.status === "DRAFT" && <button className="text-button" disabled={busy} onClick={() => void issueOrder(order)}>Issue</button>}{["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status) && <button className="text-button" disabled={busy} onClick={() => openReceive(order)}>Receive stock</button>}</div></td></tr>)}</tbody></table></div>}<div className="pagination"><span>Showing {orders.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, total)} of {total}</span><div><button className="secondary-button" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={loading || page >= totalPages} onClick={() => setPage(value => value + 1)}>Next</button></div></div></section>
    {supplierOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setSupplierOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="supplier-form-title"><div className="modal-heading"><h2 id="supplier-form-title">Add supplier</h2><button type="button" className="secondary-button" onClick={() => setSupplierOpen(false)} aria-label="Close">×</button></div><form className="data-form" onSubmit={createSupplier}><label className="form-field"><span>Supplier name</span><input name="name" required minLength={2} maxLength={160} autoFocus /></label><label className="form-field"><span>Email</span><input name="email" type="email" maxLength={254} /></label><label className="form-field"><span>Phone</span><input name="phone" maxLength={40} /></label><label className="form-field"><span>Address</span><input name="address" maxLength={500} /></label><label className="form-field"><span>Notes</span><textarea name="notes" maxLength={1000} /></label><div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Create supplier"}</button><button type="button" className="secondary-button" onClick={() => setSupplierOpen(false)}>Cancel</button></div></form></section></div>}
    {orderOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setOrderOpen(false); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="order-form-title"><div className="modal-heading"><h2 id="order-form-title">Create purchase order</h2><button type="button" className="secondary-button" onClick={() => setOrderOpen(false)} aria-label="Close">×</button></div><form className="data-form" onSubmit={createOrder}><label className="form-field"><span>Supplier</span><select name="supplierId" required defaultValue=""><option value="" disabled>Select supplier</option>{supplierOptions.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label><label className="form-field"><span>Receive into warehouse</span><select name="warehouseId" required defaultValue=""><option value="" disabled>Select warehouse</option>{warehouses.map(warehouse => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label><label className="form-field"><span>Expected delivery</span><input name="expectedAt" type="date" /></label><div className="supply-order-lines"><div className="table-toolbar"><b>Products</b><button type="button" className="secondary-button" onClick={() => setLines(current => [...current, { productId: "", quantity: "1", unitCost: "0" }])}>Add line</button></div>{lines.map((line, index) => <div className="supply-order-line" key={index}><label className="form-field"><span>Product</span><select required value={line.productId} onChange={event => setLines(current => current.map((item, row) => row === index ? { ...item, productId: event.target.value } : item))}><option value="">Select product</option>{products.map(product => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}</select></label><label className="form-field"><span>Quantity</span><input type="number" min="0.001" step="0.001" required value={line.quantity} onChange={event => setLines(current => current.map((item, row) => row === index ? { ...item, quantity: event.target.value } : item))} /></label><label className="form-field"><span>Unit cost</span><input type="number" min="0" step="0.0001" required value={line.unitCost} onChange={event => setLines(current => current.map((item, row) => row === index ? { ...item, unitCost: event.target.value } : item))} /></label>{lines.length > 1 && <button type="button" className="text-button danger-text" onClick={() => setLines(current => current.filter((_, row) => row !== index))}>Remove</button>}</div>)}</div><label className="form-field"><span>Notes</span><textarea name="notes" maxLength={1000} /></label><div className="row-actions"><button className="primary-button" disabled={busy || !suppliers.length || !warehouses.length || !products.length}>{busy ? "Saving…" : "Save draft"}</button><button type="button" className="secondary-button" onClick={() => setOrderOpen(false)}>Cancel</button></div></form></section></div>}
    {receiving && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setReceiving(null); }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="receive-order-title"><div className="modal-heading"><h2 id="receive-order-title">Receive {receiving.orderNumber}</h2><button type="button" className="secondary-button" onClick={() => setReceiving(null)} aria-label="Close">×</button></div><p>Received quantities update on-hand stock and append stock movement records in {receiving.warehouse.name}.</p><form className="data-form" onSubmit={receiveOrder}>{receiving.lines.map(line => <label className="form-field" key={line.id}><span>{line.product.sku} · {line.product.name} (remaining {Number(line.quantity) - Number(line.receivedQuantity)})</span><input type="number" min="0" max={Number(line.quantity) - Number(line.receivedQuantity)} step="0.001" value={receiveQuantities[line.id] ?? "0"} onChange={event => setReceiveQuantities(current => ({ ...current, [line.id]: event.target.value }))} /></label>)}<label className="form-field"><span>Receipt notes</span><textarea name="notes" maxLength={1000} /></label><div className="row-actions"><button className="primary-button" disabled={busy}>{busy ? "Receiving…" : "Receive stock"}</button><button type="button" className="secondary-button" onClick={() => setReceiving(null)}>Cancel</button></div></form></section></div>}
  </div>;
}
