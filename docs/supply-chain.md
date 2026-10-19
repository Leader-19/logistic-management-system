# Supply chain: procurement and receiving

## Workflow

1. Create a tenant supplier and a draft purchase order for an active supplier, warehouse, and product list.
2. Issue the draft. Issued orders become eligible for receiving.
3. Record one or more partial receipts. Each receipt updates the purchase order line's received quantity, the warehouse stock balance, and an append-only stock movement in one transaction.
4. The order becomes `PARTIALLY_RECEIVED` until all quantities are received, then becomes `RECEIVED`.

## Rules

- Supplier, warehouse, product, order, receipt, and stock reads and writes are scoped by the authenticated tenant.
- Purchase order unit costs are decimal values. Currency comes from the tenant setting; the client cannot choose a different currency.
- Purchase order lines cannot repeat a product. Received quantities must be positive and cannot exceed the outstanding ordered quantity.
- Only `DRAFT` orders can be issued. Only `ORDERED` and `PARTIALLY_RECEIVED` orders can receive stock. Receipts and stock movements are retained as history.
- Category-independent upload/import is not part of this procurement slice.

## Reliability requirements

- Receiving a purchase order must atomically update receipt history, received quantities, stock balance, and stock movement. Any failure leaves all of those records unchanged.
- Concurrent receipts for the same purchase order must validate against the current remaining quantity and must not over-receive a line.
- Repeated issue or receipt requests must be safe against duplicate business effects through idempotency keys or equivalent deduplication. If a response is lost, inspect the order and receipt history before manually repeating the action unless the API confirms retry safety.
- Stock movements and receipt history are retained. Corrections use explicit adjustment or reversal workflows rather than deleting movement records.
- All supplier, product, warehouse, purchase order, and receipt references remain scoped to the authenticated tenant.

## Demo data

The repeatable local demo seed includes two synthetic suppliers, one draft order, one open ordered purchase order, and one completed receipt. The open order can be used to try partial and full receiving in the UI.

## API

- `GET/POST /api/v1/supply-chain/suppliers`
- `GET/POST /api/v1/supply-chain/purchase-orders`
- `POST /api/v1/supply-chain/purchase-orders/:id/issue`
- `POST /api/v1/supply-chain/purchase-orders/:id/receive`
