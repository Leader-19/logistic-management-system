# ADR 0003: Tenant-scoped procurement and warehouse receiving

- Status: Accepted
- Date: 2026-10-19

## Context

The logistics workspace already tracks products, warehouses, inventory balances, and append-only stock movements. Operators need a source for incoming stock and a link between planned procurement and inventory changes.

## Decision

Keep supplier, purchase order, order line, receipt, and receipt line tables in the modular monolith. Scope each record by tenant and use composite foreign keys for supplier, warehouse, product, and parent references. Receiving runs as one transaction that updates order line quantities and inventory balances and appends stock movements and audit records. The initial interface supports supplier management, draft and issued purchase orders, and partial or full receiving.

## Consequences

- Purchase order unit costs use decimal columns and the tenant currency.
- The issued and receiving transitions are enforced in the API with a row lock on the purchase order.
- Existing shipment billing and customer invoices remain separate from supplier purchasing. Accounts payable and supplier payments are outside this slice.
