# SaaS Logistics Management System — Project Requirements

Databas use postgressql with docker file

**Document type:** Product and Technical Requirements  
**Version:** 1.0  
**Status:** Initial project baseline  
**Frontend:** Next.js + TypeScript  
**Backend:** NestJS + TypeScript  
**Database:** PostgreSQL + Prisma ORM  
**Architecture:** Multi-tenant SaaS, modular monolith first

---

## 1. Project Overview

Build a configurable, secure, multi-tenant SaaS Logistics Management System (LMS). Multiple logistics companies must be able to subscribe to the platform and manage their own customers, shipments, staff, branches, warehouses, drivers, vehicles, deliveries, billing, and reports without accessing another tenant's data.

The platform must provide:

- A SaaS platform administration portal.
- A tenant/company administration portal.
- Logistics operations interfaces.
- A customer portal and public shipment tracking.
- A responsive driver interface.
- Role- and permission-based access control.
- Subscription plans, entitlements, quotas, and billing lifecycle management.
- Auditability, reporting, integrations, and operational monitoring.

### 1.1 Product principles

1. Build one configurable platform with optional modules, not a separate application for every customer.
2. Begin with a modular monolith. Keep domain boundaries clear so services can be extracted later if necessary.
3. Enforce tenant isolation in the backend and database; hiding UI elements is not security.
4. Model workflows and status transitions explicitly.
5. Keep a complete, trustworthy history of shipment milestones and sensitive changes.
6. Deliver the core shipment lifecycle before advanced freight and automation features.
7. Make common operations simple, searchable, auditable, and safe to retry.

---

## 2. Goals and Success Criteria

### 2.1 Goals

- Allow a company to register, configure its organization, invite users, and choose a subscription plan.
- Allow authorized staff to create, price, assign, track, deliver, and bill shipments.
- Support courier/parcel delivery as the initial operational baseline, while allowing future expansion into trucking, warehouses, 3PL, and freight forwarding.
- Provide tenant-specific roles, permissions, branches, settings, pricing, and reporting.
- Support monthly and yearly subscriptions and configurable usage limits.
- Provide reliable audit records, notifications, exports, backups, and monitoring.

### 2.2 Initial acceptance criteria

- A user from Tenant A cannot read or modify Tenant B's data through any API, report, export, file URL, background job, or real-time channel.
- Tenant administrators can create custom roles from the permissions allowed to their tenant.
- The backend rejects unauthorized operations even if a user calls the API directly.
- A shipment can be created, assigned, collected, moved through milestones, delivered with proof, and invoiced.
- Invalid shipment status transitions are rejected and recorded where appropriate.
- Repeated requests or payment/webhook events do not create duplicate business records.
- Expired or suspended subscriptions apply the configured entitlements policy without silently deleting business data.
- Critical business actions have auditable actor, tenant, timestamp, action, target, and outcome fields.
- Automated tests cover core business workflows, permission checks, and tenant isolation.

---

## 3. Users and Portals

### 3.1 SaaS platform portal

For the platform owner and authorized support staff:

- Manage tenants, onboarding status, and tenant lifecycle.
- Manage plans, plan versions, features, quotas, and pricing.
- View subscription status, usage, billing events, and payment status.
- Configure global settings, supported integrations, and notification templates.
- View platform health, failed jobs, integration errors, and usage metrics.
- Perform audited, time-limited support access where permitted.
- Suspend or reactivate tenants according to policy.
- Never expose unrestricted tenant business data to support staff by default.

### 3.2 Tenant administration portal

For tenant owners and tenant administrators:

- Manage company profile, branding, branches, business hours, and settings.
- Invite and deactivate members.
- Create roles and assign allowed permissions.
- Set branch access and operational approval policies.
- Manage customers, carriers, drivers, vehicles, warehouses, service types, rate cards, and document templates.
- View subscription plan, usage, invoices, and upgrade options where authorized.

### 3.3 Logistics operations portal

For dispatchers, warehouse teams, customer service, sales, and finance:

- Create and manage bookings and shipments.
- Schedule pickup and delivery.
- Assign drivers, vehicles, carriers, trips, and routes.
- Record tracking milestones and operational exceptions.
- Manage warehouse receiving, stock, picking, packing, and transfers when the WMS module is enabled.
- Manage quotations, invoices, payments, COD, expenses, and settlements according to permissions.
- Access authorized reports and exports.

### 3.4 Customer portal

- Manage organization profile, contacts, and saved addresses.
- Create shipment bookings and pickup requests.
- Request quotations where enabled.
- Track shipments and view permitted milestones.
- Download shipping labels, invoices, and proof of delivery when authorized.
- View billing history and payment status.
- Submit claims, complaints, and support requests.
- Upload bulk shipments through a validated import workflow.
- Access only the customer's own organization's data.

### 3.5 Driver interface

Initially provide a responsive mobile web interface; native applications can be added later.

- Sign in securely and view assigned tasks.
- View pickup/delivery instructions and permitted recipient information.
- Scan parcel barcodes or enter tracking numbers.
- Record pickup, arrival, delivery attempt, and exception events.
- Capture recipient name, signature, photo, timestamp, and coordinates when policy permits.
- Record cash-on-delivery collections and declarations.
- Work offline for approved task actions where feasible, then synchronize safely.
- View only assigned tasks and information needed to perform them.

---

## 4. Functional Scope and Priorities

Priority definitions:

- **P0 — MVP:** Required for the first usable release.
- **P1 — Operational expansion:** Required for a broader production logistics operation.
- **P2 — Advanced/specialized:** Add when business needs and integrations justify the complexity.

### 4.1 Dashboard and control tower — P0/P1

- KPIs for total shipments, shipments by status, pending pickups, deliveries, failures, and delays.
- Revenue, outstanding invoices, COD discrepancies, and operating cost where finance data is enabled.
- Fleet availability, warehouse alerts, and capacity metrics when applicable.
- Exception queue for delayed shipments, failed deliveries, overdue tasks, and integration failures.
- Filters by date, branch, service, customer, driver, and carrier.
- Role-aware dashboard widgets and drill-down to authorized records.
- Scheduled report delivery and export with permission checks.

### 4.2 Customer and partner management — P0

- Customer organizations, contacts, billing profiles, addresses, and notes.
- Customer status, service preferences, credit settings, and contracts.
- Carrier/subcontractor profiles, service areas, contacts, and rate agreements.
- Duplicate detection and import/export.
- Branch-level ownership and visibility.
- Customer activity and shipment history.

### 4.3 Shipment and order management — P0

- Create, view, edit, duplicate, cancel, and search bookings.
- Generate unique shipment/tracking numbers per tenant or according to a documented global format.
- Store sender, recipient, pickup, delivery, package, dimensions, weight, cargo type, and special instructions.
- Support multiple packages per shipment and shipment items where needed.
- Select service level, calculate quotation, and record agreed charges.
- Generate barcode/QR labels and shipment documents.
- Support pickup requests, manifests, bulk import, and export.
- Maintain shipment status history and internal notes.
- Support partial delivery, shipment split/consolidation, failed delivery, redelivery, return, and cancellation workflows.
- Validate editable fields and allowed transitions on the server.
- Preserve history for critical changes; use cancellation or correction records instead of silently erasing history.

### 4.4 Tracking and shipment events — P0

- Record timestamped, ordered shipment events with actor/source, location where applicable, and notes.
- Support events such as booked, pickup scheduled, collected, received at hub, in transit, at delivery hub, out for delivery, delivered, delivery failed, returned, and cancelled.
- Public tracking must expose only explicitly approved fields.
- Prevent users from inserting arbitrary or invalid events.
- Support external carrier tracking updates through validated integrations.
- Handle duplicate and out-of-order events using defined rules.

### 4.5 Pickup, dispatch, routes, and trips — P0/P1

- Create pickup/delivery tasks from shipments.
- Assign tasks to drivers, vehicles, carriers, and branches.
- Build trip manifests and stop sequences.
- Record departure, arrival, pickup, loading, unloading, and completion.
- Validate vehicle capacity and driver/task availability where configured.
- Reassign tasks and record reasons.
- Track missed stops, route deviations, delays, and exceptions.
- Route optimization and traffic-aware ETA are P2 integrations, not assumptions in the MVP.

### 4.6 Last-mile delivery and proof of delivery — P0

- Driver task list and delivery workflow.
- Record delivery attempts and standardized failure reasons.
- Capture recipient, signature/photo evidence, timestamp, and location subject to policy and consent.
- Support recipient-unavailable, wrong-address, refused, damaged, and other exception outcomes.
- Schedule redelivery or return-to-depot.
- Support COD amount, collected amount, driver declaration, discrepancy, and settlement.
- Prevent delivery completion without required evidence or an authorized exception.

### 4.7 Pricing and quotations — P0/P1

- Tenant-configurable service types and rate cards.
- Pricing by zone, weight, volumetric weight, distance, package count, service, and customer contract as supported.
- Fuel surcharge, remote-area fee, handling, insurance, tax, discounts, and other configured charges.
- Quote creation, expiry, approval, and conversion to shipment booking.
- Versioned pricing rules and record of the rate used for each quote/shipment.
- Server-side price calculation; never trust a total submitted by the browser.
- Approval thresholds for discounts or unusual charges.

### 4.8 Fleet management — P1

- Vehicle profiles, type, registration, ownership, capacity, and availability.
- Driver profiles, qualifications, license expiry, and availability.
- Driver/vehicle assignments and trip history.
- Inspection, maintenance schedule, repairs, fuel, mileage, incidents, and costs.
- Insurance and registration expiry reminders.
- Fleet utilization and operating-cost reports.
- GPS and geofencing through approved providers where needed.

### 4.9 Warehouse management — P1

- Multiple warehouses, zones, racks, bins, and locations.
- Product/SKU and barcode management.
- Receiving, inspection, put-away, picking, packing, staging, and dispatch.
- Stock balances and movement ledger.
- Reserved, available, damaged, and quarantined stock.
- Transfers, cycle counts, adjustments, reconciliation, and reason codes.
- Lot, serial, batch, and expiry tracking when required.
- Reorder thresholds, low-stock alerts, and inventory valuation policy.
- Use database transactions and concurrency-safe stock updates.

### 4.10 Finance and billing — P0/P1

- Quotes, invoices, invoice lines, credit/debit notes, taxes, discounts, and currencies.
- Customer payment records, allocations, outstanding balances, and overdue alerts.
- Carrier/subcontractor payables and settlement records.
- COD collection, driver declaration, reconciliation, and settlement.
- Driver advances, trip expenses, and approval workflows.
- Shipment revenue, direct cost, and gross margin reporting.
- Accounting-system exports/integration.
- Immutable or reversibly corrected posted transactions.
- Payment provider integration must verify webhook signatures and process events idempotently.

A full general ledger is out of initial scope unless the product is intended to replace an accounting system.

### 4.11 Returns, claims, and customer service — P1

- Return authorization and reverse pickup.
- Return status, inspection, restocking, refund, and disposition.
- Tickets, complaints, claims, attachments, assignment, priority, SLA, and escalation.
- Damage/loss investigation and resolution.
- Approval and settlement of claims.
- Customer notifications and complete case history.

### 4.12 Customer portal and notifications — P0/P1

- Customer organization users and permissions.
- Booking, quote, tracking, labels, invoices, POD, support, and billing history.
- Email and in-app notifications; SMS/push through configurable providers.
- Templates by event, language, tenant, and service.
- Retry failed notifications and track delivery outcomes.
- Respect notification preferences and privacy settings.
- Never expose internal notes or private customer data in public tracking.

### 4.13 Reports and exports — P0/P1

- Shipment volume by period, branch, customer, service, and status.
- On-time delivery, transit time, first-attempt success, failure, and return rates.
- Revenue, cost, margin, receivables, COD, and settlements.
- Driver, fleet, warehouse, carrier, and customer performance.
- Exception and complaint reports.
- Date ranges, saved filters, and scheduled exports.
- Large exports should run asynchronously and be delivered through private, expiring links.
- Every report and export must enforce tenant and permission boundaries.

### 4.14 Freight forwarding and international logistics — P2

- Air, sea, road, rail, and multimodal shipments.
- Master/house air waybills and bills of lading.
- Carrier bookings, containers, vessels, flights, and milestones.
- Consolidation/deconsolidation and chargeable weight.
- Incoterms, customs documents, duties/taxes, and clearance status.
- Origin, transit, and destination agents.
- Demurrage, detention, accessorial charges, and landed-cost allocation.
- Country-specific compliance and customs filing must be implemented through verified jurisdictional rules and integrations.

### 4.15 Automation and integrations — P1/P2

- Configurable event-driven notifications and approval rules.
- Scheduled jobs and SLA escalation.
- Carrier, maps/GPS, payment, email/SMS, accounting, and ERP integrations.
- REST API and webhooks for customer integrations.
- Integration credentials encrypted at rest and never shown after initial entry.
- Webhook signature validation, retries, idempotency, and dead-letter handling.
- CSV/Excel import with preview, row validation, error download, and safe retry.
- Maintain integration health and failure logs without logging secrets.

---

## 5. Tenant and Organization Model

### 5.1 Tenant boundaries

Use a shared PostgreSQL database and schema for the initial release, with `tenant_id` on every tenant-owned business record. Keep tenant-specific queries and ownership checks mandatory.

A user may belong to one or more tenants through a membership model. Tenant selection must be validated against the authenticated user's memberships on the server.

### 5.2 Required isolation controls

- Resolve tenant context from a validated membership, not from an untrusted request field alone.
- Scope all reads, writes, counts, aggregates, search results, and exports by tenant.
- Use tenant-aware foreign keys/constraints where practical to prevent cross-tenant relationships.
- Consider PostgreSQL Row-Level Security (RLS) as defense in depth, with carefully managed connection context and pooled connections.
- Scope object storage paths, signed URLs, cache keys, job payloads, websocket rooms, and search indexes by tenant.
- Make scheduled jobs and queue workers establish and validate tenant context before processing.
- Separate platform administration from tenant administration.
- Support audited, restricted, time-limited support access where required.
- Test direct-object-reference attacks and cross-tenant access systematically.
- Consider dedicated databases/deployments for enterprise plans later.

### 5.3 Organization hierarchy

Recommended hierarchy:

`Tenant → Branches → Operational resources`

Customers, shipments, warehouses, employees, vehicles, rate cards, and documents belong to a tenant and may have branch ownership or scope. Define which entities are global within a tenant and which are branch-specific before implementing the schema.

---

## 6. Authentication, Roles, and Permissions

### 6.1 Authentication requirements

- Secure login and logout.
- Password reset and email verification as applicable.
- MFA for privileged roles and configurable tenant policies.
- Secure session management, refresh token rotation/revocation if using tokens, and session expiry.
- Optional OIDC/SSO for enterprise plans.
- Rate limiting and protection against brute-force attempts.
- Never store plaintext passwords or log credentials/tokens.

Use a well-maintained identity provider or a carefully implemented NestJS authentication module. Choose one explicit session/token strategy before implementation.

### 6.2 Starter roles

- Platform Super Admin.
- Platform Support.
- Tenant Owner.
- Tenant Admin.
- Operations Manager.
- Dispatcher.
- Warehouse Manager.
- Warehouse Staff.
- Driver.
- Customer Service.
- Sales Staff.
- Finance Manager.
- Finance Staff.
- Customer Organization Admin/User.
- Auditor/Read-only.

These are defaults, not fixed roles. Tenant administrators may create custom roles but must not grant permissions beyond their own administrative authority.

### 6.3 Permission naming

Use resource/action permission identifiers, for example:

- `shipments.read`
- `shipments.create`
- `shipments.update`
- `shipments.cancel`
- `shipments.assign`
- `shipments.export`
- `tracking.read`
- `delivery.proof.create`
- `warehouse.stock.read`
- `warehouse.stock.adjust`
- `invoices.read`
- `invoices.create`
- `payments.record`
- `settlements.approve`
- `users.manage`
- `roles.manage`
- `subscription.manage`
- `reports.export`
- `audit.read`

### 6.4 Authorization rules

- Enforce permissions with NestJS guards/decorators and service-level policy checks.
- Validate tenant membership for every request.
- Support branch, ownership, assignment, customer, and record-level restrictions.
- Add field-level restrictions for sensitive information where required.
- Require explicit approval permissions for sensitive workflow steps.
- Support financial approval thresholds and separation of duties.
- Record role/permission changes in audit logs.
- The frontend may hide unauthorized controls, but backend enforcement is mandatory.

---

## 7. SaaS Subscription and Entitlements

### 7.1 Plan configuration

Support configurable plans such as Starter, Growth, and Enterprise. Plan names and limits must not be hardcoded.

Configurable dimensions may include:

- Number of users and branches.
- Monthly shipment quota.
- Enabled modules.
- Storage and API usage.
- Reporting and integration features.
- Support level.
- Dedicated infrastructure options.
- Monthly/yearly price and trial terms.

### 7.2 Subscription lifecycle

- Trial, active, past due, grace period, suspended, cancelled, and expired states as appropriate.
- Monthly and yearly billing.
- Upgrade/downgrade policies and proration rules.
- Renewal and cancellation.
- Payment retries and overdue reminders.
- Feature entitlements and usage metering.
- Subscription invoices and billing history.
- Signed payment webhooks and idempotent processing.
- Configurable grace-period and downgrade policies.
- Platform admin controls to suspend/reactivate with audit records.

### 7.3 Expiration and downgrade

When a paid plan expires or is cancelled, apply a documented policy:

- Recalculate entitlements and quotas.
- Disable paid features according to the plan rules.
- Preserve operational data; do not delete shipments or invoices automatically.
- Define whether over-quota data is read-only, whether new operations are blocked, and whether exports remain available.
- Provide a clear upgrade path and notices to tenant administrators.
- Keep retention, legal hold, export, and deletion policies separate from plan enforcement.

---

## 8. Shipment Workflow and State Machine

### 8.1 Standard workflow

1. Order created.
2. Quote/pricing validated and approval completed where required.
3. Pickup scheduled.
4. Shipment collected/received.
5. Shipment moves through hubs and transit milestones.
6. Shipment reaches delivery hub.
7. Shipment is assigned for final delivery.
8. Shipment is delivered with required proof, or a failed attempt is recorded.
9. Billing, COD reconciliation, and settlement are completed as applicable.

### 8.2 Exceptions

- Failed delivery → reason recorded → notify customer → redelivery or return.
- Cancellation → validate state and permission → release resources → recalculate/refund charges if applicable.
- Damage/loss → open claim → attach evidence → investigate → approve/reject → settle.
- Warehouse transfer → reserve/dispatch → receive → reconcile discrepancies.
- COD → collect → driver declares → reconcile → approve settlement → record discrepancy.
- Return → authorize → collect → inspect → restock/dispose/refund according to policy.

### 8.3 State machine requirements

- Maintain an explicit list of allowed transitions.
- Enforce transitions in the backend, never solely in the UI.
- Record actor, source, timestamp, reason, and relevant location for each event.
- Require evidence or mandatory fields for selected transitions.
- Prevent unauthorized backdating and arbitrary status changes.
- Define correction/reversal behavior for mistaken events.
- Use concurrency controls so simultaneous requests cannot create invalid states.

---

## 9. Suggested Database Entities

Use UUID primary keys, foreign keys, timestamps, appropriate indexes, and tenant-aware unique constraints. Final schema details must be designed from the selected workflows.

### 9.1 Tenancy and identity

- `tenants`
- `tenant_settings`
- `branches`
- `users`
- `tenant_memberships`
- `roles`
- `permissions`
- `role_permissions`
- `membership_roles`
- Optional branch-scoped membership assignments and policy tables.

### 9.2 Plans and billing

- `plans`
- `plan_versions`
- `plan_features`
- `subscriptions`
- `subscription_items` where needed
- `usage_records`
- `billing_invoices`
- `payment_transactions`
- `webhook_events`

Keep provider IDs unique and process billing webhooks idempotently.

### 9.3 Customers and resources

- `customers`
- `customer_contacts`
- `customer_addresses`
- `customer_contracts`
- `carriers`
- `drivers`
- `vehicles`
- `vehicle_maintenance_records`
- `warehouses`
- `warehouse_locations`
- `products`

### 9.4 Shipments and delivery

- `shipments`
- `packages`
- `shipment_items`
- `shipment_events`
- `shipping_labels`
- `pickup_tasks`
- `trips`
- `trip_stops`
- `delivery_tasks`
- `proof_of_delivery`
- `shipment_documents`
- `returns`
- `claims`

### 9.5 Inventory and finance

- `inventory_balances`
- `stock_movements`
- `stock_transfers`
- `stock_counts`
- `rate_cards`
- `rate_rules`
- `quotes`
- `invoices`
- `invoice_lines`
- `payments`
- `payment_allocations`
- `cod_collections`
- `carrier_settlements`
- `expense_claims`

### 9.6 Platform operations

- `audit_logs`
- `notifications`
- `notification_templates`
- `integration_connections`
- `webhook_endpoints`
- `webhook_deliveries`
- `outbox_events`
- `import_jobs`
- `import_errors`
- `scheduled_reports`

Use append-only records for shipment events and stock movements. Financial corrections should use reversals or adjustment entries rather than deleting posted transactions.

---

## 10. Frontend Requirements (Next.js)

### 10.1 Navigation

- Dashboard.
- Shipments: all, create, import, tracking, exceptions, returns.
- Dispatch: dispatch board, routes, trips, drivers, vehicles.
- Warehouse: receiving, inventory, picking, packing, transfers, stock counts.
- Customers and partners: customers, carriers, contracts, rate cards.
- Finance: quotes, invoices, payments, COD, expenses, settlements.
- Customer service: tickets, claims, returns.
- Reports and exports.
- Settings: company, branches, users, roles, permissions, workflows, integrations, audit.
- Subscription and billing.
- Platform-only administration area.

Show menus according to module entitlements and permissions, but always enforce access on the server.

### 10.2 UX requirements

- Responsive desktop, tablet, and mobile layouts.
- Consistent design system using Tailwind CSS and accessible components such as shadcn/ui.
- Server-side pagination, sorting, and filtering for large datasets.
- Global shipment/tracking search.
- Saved filters and customizable tables where useful.
- Clear loading, empty, error, success, and permission-denied states.
- Confirmation for destructive or high-impact actions.
- Bulk actions with validation and an audit trail.
- Import preview, row-level errors, and downloadable error files.
- Shipment detail view with timeline, documents, delivery evidence, and billing.
- Accessible forms, keyboard navigation, and useful validation messages.
- Time-zone-aware timestamps and tenant-configurable formats.
- No reliance on frontend-only authorization.

### 10.3 Suggested Next.js route groups

- `(public)` — landing page, login, registration, public tracking.
- `(platform)` — platform admin dashboard, tenants, plans, subscriptions, platform health.
- `(tenant)` — tenant dashboard and logistics operations.
- `(customer)` — customer portal.
- `(driver)` — driver task interface.

Use server-side session validation and a consistent API client. Never expose private service secrets in client-side bundles.

---

## 11. Backend Requirements (NestJS)

### 11.1 Module structure

Organize code by domain, for example:

- `auth`
- `tenants`
- `memberships`
- `users`
- `roles`
- `permissions`
- `subscriptions`
- `billing`
- `branches`
- `customers`
- `carriers`
- `shipments`
- `tracking`
- `pricing`
- `dispatch`
- `fleet`
- `warehouse`
- `delivery`
- `documents`
- `customer-service`
- `finance`
- `reports`
- `notifications`
- `integrations`
- `audit`

Each module should own its business rules. Avoid uncontrolled cross-module database writes.

### 11.2 API conventions

- Version APIs under `/api/v1`.
- Use DTO validation and explicit response schemas.
- Use consistent error formats and HTTP status codes.
- Add pagination, filtering, sorting, and documented limits.
- Generate OpenAPI/Swagger documentation.
- Use idempotency keys for operations where duplicate execution would be harmful.
- Use database transactions for multi-record business changes.
- Apply rate limiting and request-size limits.
- Keep public tracking responses separate from authenticated shipment details.
- Use background jobs for long imports, exports, notifications, and scheduled tasks.

### 11.3 Example endpoints

- `POST /api/v1/shipments`
- `GET /api/v1/shipments`
- `GET /api/v1/shipments/:id`
- `POST /api/v1/shipments/:id/assign`
- `POST /api/v1/shipments/:id/events`
- `POST /api/v1/shipments/:id/proof-of-delivery`
- `GET /api/v1/tracking/:trackingNumber`
- `POST /api/v1/warehouse/receipts`
- `POST /api/v1/invoices`
- `POST /api/v1/invoices/:id/payments`
- `GET /api/v1/reports/delivery-performance`
- `GET /api/v1/tenant/members`
- `POST /api/v1/tenant/roles`
- `GET /api/v1/tenant/subscription`

These are illustrative routes; the final API contract should be version-controlled and documented.

---

## 12. Technology Stack

### Required starting stack

- **Frontend:** Next.js, React, TypeScript.
- **UI:** Tailwind CSS and shadcn/ui or equivalent accessible component library.
- **Backend:** NestJS and TypeScript.
- **API documentation:** OpenAPI/Swagger.
- **Database:** PostgreSQL.
- **ORM and migrations:** Prisma.
- **Cache and job queue:** Redis and BullMQ, when needed.
- **Object storage:** S3-compatible private storage for labels, invoices, PODs, and attachments.
- **Authentication:** A maintained OIDC provider or a carefully implemented NestJS authentication solution.
- **Real-time:** WebSockets or Server-Sent Events where needed.
- **Testing:** Unit, integration, end-to-end, and authorization tests.
- **Deployment:** Docker, CI/CD, managed database where practical.
- **Observability:** Structured logs, metrics, traces, error monitoring, and health checks.

Start as a modular monolith. Introduce microservices only when workload, team boundaries, or operational requirements justify them.

---

## 13. Security, Privacy, and Compliance

- Use TLS for network traffic and secure storage for secrets.
- Enforce authentication, tenant membership, permissions, branch scope, and record ownership on the server.
- Apply least privilege to database users, service accounts, and cloud roles.
- Encrypt integration credentials and sensitive data at rest where appropriate.
- Use private object storage and short-lived signed download links.
- Validate file type, size, and content; scan uploads where appropriate.
- Protect against injection, XSS, CSRF where applicable, SSRF, insecure direct object references, and broken access control.
- Apply secure headers, rate limits, CORS allowlists, and request validation.
- Avoid logging passwords, tokens, payment secrets, and unnecessary personal information.
- Define retention, export, deletion, and legal-hold policies.
- Limit driver location collection to legitimate operational needs, with appropriate notice and controls.
- Maintain audit logs for permissions, financial operations, tenant settings, and sensitive record changes.
- Establish backup, restoration, incident response, and disaster-recovery procedures.
- Review applicable privacy, tax, transport, customs, and data-residency obligations for each target market.

---

## 14. Non-Functional Requirements

### Performance and scale

- Use indexed, paginated queries for operational lists.
- Avoid loading full shipment histories or large exports into memory.
- Use asynchronous processing for large imports, exports, and notifications.
- Establish measurable latency and throughput targets before production launch.
- Use caching only with tenant-aware keys and safe invalidation.

### Reliability

- Use transactions for critical multi-step updates.
- Retry transient background-job failures with bounded backoff.
- Use idempotency and deduplication for external events and jobs.
- Track failed jobs and provide safe retry/replay procedures.
- Use an outbox pattern when reliable publication of database changes to queues/events is required.

### Data integrity

- Enforce foreign keys, unique constraints, checks, and transactional invariants.
- Store timestamps consistently in UTC and display them in the user's or tenant's configured time zone.
- Use decimal types for money and explicit currency codes.
- Define units of measurement and conversion rules.
- Use optimistic locking or equivalent controls for concurrent updates where needed.

### Accessibility and maintainability

- Follow practical WCAG accessibility guidance.
- Use typed API contracts and consistent error handling.
- Maintain coding standards, code review, automated tests, and dependency updates.
- Document architectural decisions, business workflows, and operational procedures.

---

## 15. Testing Requirements

### Unit tests

- Pricing calculations and surcharges.
- Shipment state transitions.
- Permission and policy logic.
- Subscription entitlements and quota enforcement.
- COD reconciliation and financial calculations.

### Integration tests

- Database constraints and transactions.
- Tenant scoping and RLS policies where enabled.
- Authentication and permission guards.
- File storage authorization.
- Queue jobs and notification providers.
- Payment/webhook signature verification and idempotency.

### End-to-end tests

- Tenant registration and onboarding.
- Create shipment → assign → collect → transit → deliver with POD.
- Failed delivery → redelivery or return.
- Quote → shipment → invoice → payment.
- COD collection → reconciliation → settlement.
- Plan expiration → entitlements downgrade.
- User invitation → role assignment → denied unauthorized operation.

### Mandatory security tests

- A Tenant A user cannot access Tenant B resources by changing IDs.
- A tenant administrator cannot grant platform-only permissions.
- A driver cannot update shipments outside their assignment.
- A customer cannot access another customer's documents or invoices.
- Reports, search, exports, caches, jobs, and websocket channels respect tenant scope.
- Duplicate webhook or retry requests do not duplicate payments or events.

---

## 16. Deployment and Operations

- Maintain separate development, test/staging, and production environments.
- Use environment-specific secrets; never commit `.env` files or production credentials.
- Build reproducible Docker images.
- Run migrations as a controlled deployment step with rollback/recovery planning.
- Configure HTTPS, health/readiness checks, logs, metrics, traces, and alerts.
- Schedule encrypted backups and regularly test restoration.
- Monitor database connections, queue depth, job failures, latency, and external integrations.
- Use rolling or otherwise low-downtime deployment strategies where supported.
- Keep a documented incident-response and recovery procedure.
- Use CI checks for formatting, linting, type checking, tests, dependency/security scanning, and build validation.

---

## 17. Delivery Roadmap

### Phase 1 — Secure SaaS foundation

- Repository and workspace setup.
- NestJS API and Next.js application.
- PostgreSQL schema and Prisma migrations.
- Authentication, tenants, memberships, RBAC, audit logs.
- Tenant settings, branches, plans, entitlements, subscription lifecycle.
- CI/CD, test setup, logging, monitoring, backups.

**Exit criterion:** Tenant users can securely sign in, manage membership and roles, and cannot cross tenant boundaries.

### Phase 2 — Logistics MVP

- Customers and addresses.
- Shipments, packages, labels, pricing, and tracking events.
- Pickup/delivery tasks and driver assignment.
- Driver interface and proof of delivery.
- Customer portal and public tracking.
- Core dashboard, search, notifications, and reports.

**Exit criterion:** A tenant can book, track, and complete a shipment with auditable proof of delivery.

### Phase 3 — Operational expansion

- Dispatch board, trips, routes, and fleet.
- Warehouse receiving, inventory, picking, and transfers.
- Returns, claims, customer service, and exceptions.
- Invoices, payments, COD, expenses, and settlements.
- Advanced reporting and carrier performance.

**Exit criterion:** Core shipment operations and related financial processes work end to end.

### Phase 4 — Advanced capabilities

- GPS, routing, and ETA integrations.
- Carrier, accounting, ERP, payment, and EDI integrations.
- Workflow automation and scheduled reports.
- Freight forwarding and multimodal transport.
- Enterprise SSO, dedicated tenant infrastructure, and advanced analytics.

**Exit criterion:** Advanced modules are validated against actual customer requirements and operational constraints.

---

## 18. MVP Definition of Done

A feature is not complete until:

- Business rules and acceptance criteria are documented.
- DTO/input validation and error handling are implemented.
- Authentication, tenant scope, permissions, and record ownership are enforced.
- Database constraints and transaction behavior are defined.
- Audit events are emitted for sensitive actions.
- Loading, empty, error, and success UI states exist.
- Unit and integration tests pass; relevant end-to-end tests are added.
- API documentation and user-facing behavior are updated.
- Logs and operational failure handling are in place.
- No secrets or unnecessary sensitive data are exposed.
- The feature is deployed and verified in staging.

---

## 19. Open Product Decisions

Confirm these decisions before committing to a final schema and implementation plan:

1. Initial target: courier/parcel delivery, trucking, warehouse/3PL, freight forwarding, or all-in-one.
2. SaaS audience: external logistics companies, internal company operations, or both.
3. First interface: responsive web/driver interface or separate native mobile apps.
4. Pricing: fixed subscription, usage-based, or a combination.
5. Initial operating country/countries, currencies, languages, tax rules, and compliance obligations.
6. Expected tenant count, shipment volume, branches, and user count.
7. Whether customers can pay online and which payment providers are supported.
8. Whether GPS, carrier, accounting, customs, or ERP integrations are required for MVP.
9. Data retention, export, deletion, and enterprise isolation requirements.
10. Which modules must be included in the first production release.

---

## 20. Recommended First Implementation Order

1. Create the repository structure, linting, formatting, environment configuration, and CI pipeline.
2. Set up PostgreSQL, Prisma, and migration workflows.
3. Implement authentication, tenants, memberships, tenant context, and isolation tests.
4. Implement RBAC and audit logging.
5. Implement plans, subscriptions, entitlements, and quota enforcement.
6. Implement customers and addresses.
7. Implement shipments, packages, pricing, and shipment events.
8. Implement pickup/delivery assignments and proof of delivery.
9. Implement customer tracking and the customer portal.
10. Implement invoices, payment records, COD, and basic reports.
11. Add fleet, warehouse, advanced finance, and specialized freight modules according to demand.

**Architecture recommendation:** Use a NestJS modular monolith with Next.js, PostgreSQL, and Prisma; implement tenant isolation and authorization before building logistics features; then deliver the shipment lifecycle as the first complete vertical workflow.
