# ADR 0004: Flexible tenant invoices

## Status

Accepted

## Decision

Invoices belong to a tenant customer and may optionally reference a shipment. Manual invoices are issued at creation with validated line items, tenant currency, configurable tax, optional due date, and notes. Shipment invoices remain tied to delivered shipments. Invoice amounts are calculated server-side with decimal arithmetic.

Tenant invoice defaults (tax rate, header note, payment terms, footer note) are copied to the invoice at issue time. Issued invoice records and lines remain immutable; future corrections require a separate adjustment or credit workflow.

## Consequences

- Existing shipment invoices are backfilled with their shipment customer before `shipment_id` becomes optional.
- Tenant and customer references remain tenant-scoped in the database and service layer.
- Tenant invoice settings affect newly issued documents only.
