# Tenant invoice workflows

## Create a manual invoice

Users with `invoices.create` can create an invoice from the Invoices page for an active customer in the current tenant. They can set an invoice number, due date, invoice notes, tax percentage, and up to 100 description/quantity/unit-price lines. The server calculates line totals, subtotal, tax, and total using decimal arithmetic and the tenant currency. If the user leaves the invoice number blank, the server generates one.

Manual invoices are issued when created. Issued invoices and their lines are immutable; corrections must use a separate adjustment or credit workflow. Shipment invoices continue to require a delivered shipment and keep their shipment reference.

## Customize invoice documents

Users with settings access can set tenant defaults for VAT/tax percentage, a header note, payment terms, and a footer note on the Invoices page. Defaults are copied onto an invoice at issue time so later tenant setting changes do not alter an issued document. Manual invoices can override the tax percentage for that invoice.

All invoice reads and writes are tenant-scoped and audited. Customer references must belong to the active tenant.

## Design and save invoice templates

Users with invoice read access can open **Design templates** to create a tenant invoice layout with a live sample preview. Templates control paper size, accent color, font, title, company logo visibility, address/shipment/due-date sections, item table style, and plain-text header and footer copy. Header and footer text supports `{{invoiceNumber}}`, `{{customerName}}`, `{{total}}`, and `{{currency}}` tokens. The editor stores a validated structured layout rather than HTML.

Saving edits creates a new immutable template version. Users with `settings.update` can manage templates and set the workspace default. Template reads, writes, versions, and default changes are tenant-scoped and audited. A selected or default template is snapshotted on each new invoice; edits only affect future invoices. Existing issued invoices continue to display with the standard layout.

## Print and PDF

Open an invoice and choose **Print and PDF settings** to select A4 or Letter paper, portrait or landscape orientation, and narrow, normal, or wide margins. Preferences are stored in the current browser. **Print invoice** opens the browser print dialog; choose a connected printer or select **Save as PDF** there to download a PDF. Browsers intentionally do not let a website select a physical printer or write a PDF file directly.

## Reliability requirements

- Invoice totals are calculated server-side with fixed-precision decimal arithmetic and an explicit tenant currency.
- Invoice creation and its lines must commit atomically. A failed invoice create must not leave orphaned lines or partial totals.
- Issued invoices and their lines are immutable business history. Corrections use a supported adjustment or credit workflow; they are not deleted or silently edited.
- Concurrent changes to invoice settings or draft data must be detected with version checks or equivalent concurrency control.
- Invoice creation should be idempotent for retried submissions. If a request's outcome is uncertain, check the invoice list before submitting again unless the endpoint confirms retry safety for the same idempotency key.
- Tenant and permission checks apply to invoice records, customer references, templates, and print/download actions.
