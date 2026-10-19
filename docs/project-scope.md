# Fleetwise Logistics Management System — Project Scope

## 1. Purpose

Fleetwise is a multi-tenant logistics management system (LMS) for courier and parcel delivery companies. It brings shipment booking, dispatch, hub handling, delivery, customer service, inventory, invoicing, and business administration into one web platform.

The product is designed as a configurable SaaS platform: each logistics company operates in its own workspace, manages its own users and business records, and can use the modules enabled for its account. The initial product focus is courier and parcel operations. The architecture can grow to support broader warehouse, 3PL, trucking, and freight workflows as those needs are validated.

This document describes the product scope and intended operating flows. It is a product overview, not an API contract or a claim that every planned capability is production-complete. See the domain documents and code for the status and behavior of individual features.

## 2. Goals

- Manage the parcel lifecycle from booking through delivery and billing.
- Give logistics teams a shared view of customers, shipments, drivers, hubs, warehouses, inventory, and invoices.
- Make day-to-day work accessible from desktop and mobile web interfaces.
- Keep each company's data isolated and enforce permissions in the backend.
- Preserve shipment and inventory histories for operational review and dispute resolution.
- Let the platform operator manage tenants, plans, and subscription access.
- Provide a foundation for additional logistics modules and integrations without splitting the product into separate applications.

## 3. Users and roles

Access depends on a user's tenant membership, assigned permissions, and (where configured) operational scope. The following are user groups, not fixed role names:

| User group | Main responsibilities |
|---|---|
| Platform administrator | Operate the SaaS platform, manage tenant accounts and subscription plans, and review platform-level status. |
| Tenant owner or administrator | Configure a company's workspace, members, roles, branches, and settings; oversee subscription and usage. |
| Operations or booking staff | Manage customers and bookings, create shipments, monitor tracking, and handle exceptions. |
| Dispatcher | Assign eligible shipments to drivers, scan parcels at hubs, and record operational milestones. |
| Warehouse staff | Receive goods, manage warehouse records and stock, and record stock movements where those modules are enabled. |
| Driver | Use a mobile-friendly interface to view assigned work and submit allowed pickup or delivery updates. |
| Finance staff | Prepare and review invoices and other financial records permitted for the tenant. |
| Customer | Use customer-facing features, when enabled, to access their own shipment and billing information. |

The backend is responsible for access checks. A hidden button or page is not an authorization boundary.

## 4. Main operational flow

The intended end-to-end parcel flow is:

1. **Set up a workspace.** A company registers, establishes its tenant, and manages members and business settings.
2. **Set up operations.** Authorized staff create customers and addresses, configure services and prices, and maintain drivers, branches, warehouses, and other required records.
3. **Book a shipment.** Staff enter sender, recipient, package, service, and handling details. The system assigns a tracking reference and calculates applicable charges on the server.
4. **Prepare pickup and dispatch.** Staff schedule collection and assign work to an eligible driver or operational team.
5. **Collect and scan.** Staff record pickup and hub events. At a hub, an operator can scan a barcode or enter a tracking number, optionally provide a hub or sorting location, and record the next allowed action.
6. **Move and deliver.** Shipment events record transit and delivery activity. Delivery exceptions can lead to another attempt or a return according to the allowed workflow. Proof of delivery can be required by policy.
7. **Invoice and reconcile.** Authorized staff create shipment-related or manual invoices. Payments, COD, and settlement processes can be used where configured and implemented.
8. **Review and improve.** Staff use search, reports, shipment history, and audit records to resolve exceptions and understand operations.

Each transition must be validated by the backend. Tracking history is retained; corrections to important operational history should be represented as explicit follow-up actions rather than silently erasing it.

## 5. Functional scope

### 5.1 Platform and tenant administration

- Tenant/workspace registration and context selection.
- Member access, roles, and permissions.
- Tenant settings and operational configuration.
- Platform-level tenant and plan administration.
- Subscription plan, seat allowance, and billing lifecycle support where configured.

### 5.2 Customers and shipment operations

- Customer and business record management.
- Shipment booking, lookup, status tracking, and operational actions.
- Tracking numbers and shipment details.
- Driver assignment and dispatch queue management.
- Hub barcode/tracking-number lookup and event recording.
- Batch operations for eligible records, with validation and retained history.
- Public or customer-facing tracking surfaces with explicitly limited information.

### 5.3 Delivery and driver operations

- Responsive web access for mobile use.
- Assigned work and permitted shipment updates.
- Pickup, delivery attempt, completion, and exception workflows as supported by policy.
- Proof-of-delivery capture and offline-first synchronization are roadmap capabilities unless specifically implemented for a workflow.

### 5.4 Warehouse and supply chain

- Warehouse and product records.
- Inventory balances and movement history.
- Supplier and purchase order management.
- Purchase order issuing and partial or complete receiving, with stock updates tied to receipt workflows.
- Stock counts, transfers, advanced warehouse execution, and broader procurement automation can be expanded in later phases.

### 5.5 Invoices and finance

- Shipment-linked and manual invoice workflows.
- Server-calculated invoice totals and tenant-scoped customer references.
- Tenant invoice settings and reusable invoice templates with versioned layouts.
- Browser-based printing and PDF output through the browser's print dialog.
- Payment collection, COD reconciliation, ledger, payable, and settlement capabilities are broader finance scope and may require further implementation and provider configuration.

### 5.6 Supporting functions

- Operational dashboards and reports.
- Notifications and user feedback for successful or failed actions.
- Audit records for sensitive administrative and business operations.
- Synthetic demo data and automated checks for supported workflows.
- API documentation for backend operations.
- Structured application logs with a request/correlation ID for API requests and background jobs. Include tenant and actor identifiers only where appropriate, and never log secrets or unnecessary personal data.
- Health checks for the API and critical configured dependencies, such as the database and queue.
- Operational measures such as request latency, error rates, shipment throughput, and failed-job counts, with deployment alert thresholds.
- Documented retention periods for logs, audit records, and operational history. Tenant-specific retention is supported only where policy and law permit it.

## 6. Cross-cutting requirements

### Tenant isolation and access control

- Every tenant-owned operation must use the authenticated tenant context and validate membership.
- Reads, writes, search, counts, exports, files, and background work must be scoped to that tenant.
- Authorization is enforced in backend guards and service logic, with permission checks on sensitive actions.
- Platform administration and tenant administration have separate authority.

### Data integrity and history

- Validate input at the API boundary and enforce business rules in the backend.
- Use database transactions for related business updates.
- Calculate prices and monetary totals on the server using decimal values and an explicit currency.
- Retain shipment events and stock movements as operational history.
- Make mutating operations safe to retry where duplicate actions could cause harm.
- Use fixed-precision decimal arithmetic for money, never binary floating-point calculations.
- Validate shipment status changes against an explicit state machine and return a clear error for an invalid transition.
- Treat operational events as append-only; corrections create compensating events rather than editing prior history.
- Enforce critical invariants with unique constraints and database checks where practical, such as tenant-scoped tracking numbers and valid stock quantities.

### Usability and reliability

- Provide clear loading, empty, success, and error feedback.
- Support keyboard access and responsive layouts for common operational pages.
- Use bounded retries for transient failures where safe; do not automatically repeat non-idempotent business actions without an idempotency strategy.
- Keep secrets out of client-side code and logs.
- Show clear validation and system-error messages for critical actions. System errors must not expose stack traces, secrets, or another tenant's data.
- Apply rate limits and request-size limits to protect the API from abuse and accidental overload.
- Run sufficiently large or long-running work asynchronously, with progress visibility and cancellation where safe.

### Reliability and resilience

- **Idempotency:** Mutating operations that can create harmful duplicates (for example, shipment creation, assignment, hub events, invoice creation, and stock movements) must accept an idempotency key or use a validated unique business key. Repeating a successful request with the same key returns the original result without repeating side effects.
- **Transactional boundaries:** Related database writes must run in a transaction. A failed shipment event or stock receipt must not leave partially updated business records. External notifications and other side effects should be published only after the database transaction commits, using a reliable outbox when required.
- **Graceful degradation:** Non-critical functions such as dashboards, reports, and notifications should not prevent core booking, tracking, or delivery work when they are unavailable.
- **Retries and circuit breaking:** Retry transient failures with bounded exponential backoff. Do not automatically retry a non-idempotent action unless an idempotency strategy protects it. Circuit breaking may be used for unstable external dependencies.
- **Concurrency control:** Concurrent edits to shipments, assignments, inventory balances, and invoices must use optimistic version checks, database constraints, row-level locking, or equivalent safeguards. A stale write must be rejected or reconciled instead of silently overwriting another valid change.
- **Deletion and auditability:** Shipment events, stock movements, audit entries, and posted financial records are retained as business history. Use cancellation, reversal, correction, or versioning workflows. Soft deletion is allowed only for records whose business history permits it, and sensitive changes must be audited.
- **Background jobs:** Asynchronous operations must establish and validate tenant context, avoid duplicate effects where possible, and record completion or failure for later inspection. Long-running work should expose progress and support safe cancellation where applicable.

## 7. Product boundaries

The initial scope is a responsive web application and API for courier/parcel logistics. It does not assume native mobile applications, route optimization, live GPS tracking, a specific payment provider, customs brokerage, freight forwarding, or customer-specific integrations. Such work requires validated business requirements and provider/security decisions.

The system is a modular monolith at this stage. Introducing microservices, additional databases, or new queue infrastructure is outside this scope unless a documented architecture decision approves it.

The initial scope does not guarantee multi-region active-active operation or automatic geographic failover. Live GPS and real-time driver tracking reliability guarantees are also outside the initial scope. An offline-first driver app with guaranteed eventual synchronization is a later-phase capability. Point-in-time recovery and automated backup restoration procedures are deployment responsibilities and must be documented in a separate operations runbook.

## 8. Delivery priorities

| Phase | Scope | Intended outcome |
|---|---|---|
| Foundation | Authentication, tenant context, membership and permissions, audit, database and deployment basics, idempotency support, optimistic locking, structured logging, health checks, and baseline metrics | Users can securely access the correct workspace and operators can diagnose basic service health. |
| Logistics baseline | Customers, shipment booking, pricing, tracking events, assignment, pickup and delivery workflow, explicit shipment state machine, transactional event recording, and concurrency tests for assignment/status changes | A tenant can manage a parcel through its core lifecycle without invalid or duplicate state changes. |
| Operational expansion | Dispatch and hub handling, warehouse and procurement, invoicing, billing, reports, notifications, reliable background jobs, bulk-action partial-failure reporting, and queue monitoring/alerting | Teams can coordinate day-to-day operations and related records with observable asynchronous work. |
| Advanced capabilities | Route optimization, GPS/ETA, integrations, offline driver synchronization, advanced finance, and additional logistics verticals | The product expands in response to validated customer needs. |

Priority labels describe product sequencing; they do not guarantee that a phase is complete in the current codebase. Feature-level docs and tests are the source for implementation detail.

## 9. Success criteria

- Tenant users cannot access another tenant's records by changing IDs or request parameters.
- A permitted shipment can be created, assigned, tracked through allowed milestones, delivered, and invoiced.
- Invalid state changes and unauthorized actions are rejected with useful errors.
- Important operational and administrative actions have traceable history.
- Batch actions report records that could not be processed and do not bypass normal business rules.
- Responsive screens support the intended desktop and mobile web workflows.
- Automated tests cover the main flows and the tenant and permission boundaries relevant to them.
- Concurrent assignment of one shipment to two drivers is rejected or serialized so only one assignment succeeds.
- Repeating a successful delivery or invoice request with the same idempotency key returns the original result without duplicate side effects.
- A failed hub scan or inventory movement leaves no partial business update and returns a clear error.
- Tenant A cannot read or change Tenant B data, including when IDs or request parameters are guessed or modified.
- Critical state changes can be traced to an actor and timestamp, with before/after values or an immutable event record.
- Automated tests cover failure paths as well as successful flows, including concurrent updates, invalid transitions, permission denials, and idempotent retries.

## 10. Related documentation

- [Project requirements](../projectRequirement.md)
- [Hub scanning and dispatch](hub-scanning.md)
- [Bulk actions](bulk-actions.md)
- [Invoice workflows](invoice-workflows.md)
- [SaaS subscription billing](saas-billing.md)
- [Supply chain procurement](supply-chain.md)
- [Local testing](testing.md)
- [User guide](user-guide.md)
- [Architecture decision records](adr/)
