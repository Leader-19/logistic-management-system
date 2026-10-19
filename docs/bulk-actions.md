# Bulk record actions

Bulk actions accept up to 100 unique UUIDs per request and always scope queries to the authenticated tenant. Successful changes create audit records. The UI selects records from the current page and asks for confirmation before applying the action.

Current bulk actions:

- Customers, branches, and team members: deactivate records; related history remains available. Member self-deactivation and last-owner protections still apply, and protected or unavailable IDs are skipped.
- Products: archive records; stock balances and movement history remain intact.

Invoices, shipment events, stock movements, posted financial records, and audit logs are historical records and are not bulk deleted. Shipment state changes must use the shipment cancellation workflow so the state machine and tracking history remain valid.

## Reliability requirements

- Validate tenant scope, permissions, and eligibility for every selected record. One invalid ID must not broaden access or bypass normal per-record rules.
- Report successful and skipped records clearly. A failure affecting one record should not silently hide the outcome of the others.
- Large bulk actions and exports should run as tenant-scoped background jobs with progress and a recorded outcome.
- Retrying a bulk request must not repeat successful side effects. Mutating batch endpoints should accept an idempotency key or provide equivalent per-record deduplication. Until that guarantee is available for an action, refresh and inspect the records before retrying after an uncertain response.
- Concurrent changes must be checked against each record's current state at execution time; stale selections are skipped or rejected with a useful reason.
