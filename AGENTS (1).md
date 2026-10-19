# AGENTS.md — SaaS Logistics Management System (LMS)

Instructions for AI coding agents and developers working in this repository.
Read this file fully before making changes. When this file conflicts with a quick shortcut, follow this file.

---

## 1. Project Summary

A configurable, secure, **multi-tenant SaaS Logistics Management System**. Many logistics companies (tenants) subscribe and run their own customers, shipments, staff, branches, warehouses, drivers, vehicles, deliveries, billing, and reports with strict data isolation.

- **Initial focus:** courier / parcel delivery (expandable to trucking, warehouse/3PL, freight forwarding, air and ocean freight).
- **Architecture:** modular monolith first. Clear domain boundaries so services can be extracted later.
- **Core principle:** one configurable platform with optional modules, not one app per customer.
- **Scope model:** the platform covers the full logistics chain shown in the reference diagram (Section 17): Packaging → Loader → Warehouse → Shipping → Transportation (Truck / Tanker-Ocean / Airplane / Drone) → Delivery, with a Control tower and Robot/automation layer on top.

### Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | NestJS, TypeScript |
| Database | PostgreSQL (Docker), Prisma ORM + migrations |
| Cache / queue | Redis + BullMQ |
| Object storage | S3-compatible private storage (MinIO locally) |
| API docs | OpenAPI / Swagger |
| Realtime | WebSockets or SSE (tenant-scoped) |
| Testing | Jest/Vitest (unit, integration), Playwright (e2e) |
| Tooling | pnpm, Turborepo, ESLint, Prettier, Docker, CI/CD |

---

## 2. Repository Layout

```
.
├── apps/
│   ├── api/                 # NestJS backend
│   │   └── src/modules/     # one folder per domain module
│   └── web/                 # Next.js frontend
│       └── src/app/
│           ├── (public)/    # landing, login, register, public tracking
│           ├── (platform)/  # SaaS platform admin
│           ├── (tenant)/    # tenant admin + logistics operations + control tower
│           ├── (customer)/  # customer portal
│           └── (driver)/    # responsive driver interface (PWA)
├── packages/
│   ├── shared/              # shared types, Zod schemas, permission constants, enums
│   ├── config/              # eslint, tsconfig, prettier presets
│   └── db/                  # Prisma schema, migrations, seed, tenant-aware client
├── docker/                  # Dockerfiles, compose files
├── docs/                    # ADRs, workflows, API contract, runbooks
├── AGENTS.md
└── docker-compose.yml
```

### Backend modules (`apps/api/src/modules/`)

Core: `auth`, `tenants`, `memberships`, `users`, `roles`, `permissions`, `subscriptions`, `billing`, `entitlements`, `branches`, `customers`, `carriers`, `shipments`, `tracking`, `pricing`, `dispatch`, `fleet`, `warehouse`, `delivery`, `documents`, `customer-service`, `finance`, `ledger`, `reports`, `notifications`, `integrations`, `automation`, `custom-fields`, `numbering`, `audit`

Added from the logistics diagram (Section 17):

| Module | Diagram node | Purpose |
|---|---|---|
| `packaging` | Packaging | Package types, materials, packing stations, cartonization, labels |
| `loading` | Loader | Dock/yard scheduling, load plans, loading/unloading, MHE (forklift) tasks |
| `outbound` | Shipping | Outbound orders, manifests, consolidation, carrier booking, shipping documents |
| `transport` | Transportation / Truck | Transport orders, routes, trips, freight cost, mode management |
| `air-freight` | Airplane | Air waybill, flights, ULD, cut-off times |
| `ocean-freight` | Tanker | Bookings, bill of lading, containers, vessels, port events |
| `drone-ops` | Drone | Drone delivery missions, geofence, flight logs (P2) |
| `automation-devices` | Robot | Robot/AGV/AMR, sorter, scanner and IoT device registry and task adapters |
| `control-tower` | Control | Live monitoring, exceptions, alerts, KPI and SLA cockpit |
| `customs` | Tanker / Airplane | Customs declarations, HS codes, duties, trade documents (P2) |

**Rule:** each module owns its business rules and its tables. Do not write directly to another module's tables. Call that module's service or publish an event through the outbox.

---

## 3. Local Setup and Commands

```bash
pnpm install
cp .env.example .env              # never commit .env
docker compose up -d              # postgres, redis, minio, mailpit
pnpm db:migrate                   # prisma migrate dev
pnpm db:seed                      # permissions, default roles, demo tenants
pnpm dev                          # runs api + web via turbo
```

| Task | Command |
|---|---|
| Lint | `pnpm lint` |
| Type check | `pnpm typecheck` |
| Unit tests | `pnpm test` |
| Integration tests | `pnpm test:int` |
| E2E tests | `pnpm test:e2e` |
| Tenant isolation tests | `pnpm test:isolation` |
| Generate Prisma client | `pnpm db:generate` |
| Create migration | `pnpm db:migrate --name <change>` |
| Build | `pnpm build` |

Before finishing any task run: `pnpm lint && pnpm typecheck && pnpm test`.

### Docker Compose (local services)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: lms
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: lms
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lms"]
      interval: 5s
      retries: 10
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    ports: ["9000:9000", "9001:9001"]
    volumes: [miniodata:/data]
  mailpit:
    image: axllent/mailpit
    ports: ["8025:8025", "1025:1025"]
volumes:
  pgdata:
  miniodata:
```

Use two database roles: a **migration/owner role** and a **non-superuser app role** (so RLS actually applies).

---

## 4. Non-Negotiable Rules

### 4.1 Tenant isolation (highest priority)

1. Every tenant-owned table has `tenant_id` (UUID, NOT NULL, indexed).
2. Resolve tenant from a **validated membership**, never from a raw request field alone.
3. Every read, write, count, aggregate, search, export, cache key, queue job payload, websocket room, storage path, and signed URL **must be tenant-scoped**.
4. Use tenant-aware unique constraints, e.g. `UNIQUE (tenant_id, tracking_number)`, and composite foreign keys where practical to prevent cross-tenant references.
5. Enable PostgreSQL **Row-Level Security** as defense in depth. Set the tenant context per transaction (`SET LOCAL app.tenant_id = ...`) through a Prisma client extension. Do not rely on session-level settings with pooled connections.
6. Background jobs and scheduled tasks must establish and validate tenant context before touching data.
7. Platform admin and tenant admin are separate. Support access is audited, restricted, and time-limited.
8. Never query tenant data without going through the tenant-aware data access layer.
9. Device and robot credentials (scanners, AGVs, drones, telematics) are issued per tenant, scoped, revocable, and never shared across tenants.

### 4.2 Authorization

- Backend enforces everything. Hiding UI is never security.
- Use NestJS guards and decorators plus service-level policy checks (CASL or equivalent) for branch, ownership, assignment, customer, and field-level rules.
- Permission IDs use `resource.action` format, e.g. `shipments.create`, `shipments.cancel`, `warehouse.stock.adjust`, `settlements.approve`. Define them once in `packages/shared`.
- Tenant admins can only grant permissions within their own authority. Platform-only permissions are never grantable by tenants.
- Sensitive steps (discount approval, settlement approval, stock adjustment) need explicit approval permissions and separation of duties.
- Role and permission changes are audited.

### 4.3 Money

- Use `Decimal(18,4)` with an explicit currency code. **Never use floats** for money.
- Prices and totals are always calculated **server-side**. Never trust totals sent by the browser.
- Posted financial records are immutable. Correct with reversals or adjustment entries, never by delete or silent edit.
- COD, merchant wallets, driver cash holdings, and settlements go through the **ledger** module (double-entry style, append-only).

### 4.4 Events and history

- `shipment_events` and `stock_movements` are **append-only**.
- Store both `occurred_at` (when it happened, device or source time) and `recorded_at` (when the server stored it). Keep a per-shipment `sequence`.
- Define handling for duplicate and out-of-order events. Never allow arbitrary event insertion; events must pass the state machine.
- Corrections use correction/reversal events. Do not erase history.

### 4.5 State machines

- Keep an explicit allowed-transition table for shipments, tasks, trips, returns, claims, invoices, subscriptions.
- Enforce in the backend, inside a transaction, with concurrency control (row lock or optimistic version).
- Each transition records actor, source, timestamp, reason, and location when relevant.
- Selected transitions require evidence (e.g. delivery needs POD/OTP, or an authorized exception).
- Prevent unauthorized backdating.

### 4.6 Idempotency and reliability

- Mutating endpoints where duplicates are harmful accept an `Idempotency-Key`.
- Webhooks (payment and others): verify signatures, store `webhook_events` with a unique provider event ID, process idempotently.
- Use the **outbox pattern** for reliable event publishing to queues.
- Retries use bounded exponential backoff. Failed jobs go to a dead-letter queue with a safe replay procedure.
- Use database transactions for every multi-record business change.

### 4.7 Security

- TLS everywhere, secrets only in environment or a secret manager. Never commit `.env` or credentials.
- Never log passwords, tokens, payment secrets, integration credentials, or unnecessary personal data.
- Integration credentials are encrypted at rest and never returned after initial entry.
- Validate all input with DTOs (class-validator or Zod). Validate uploaded file type, size, and content.
- Guard against injection, XSS, CSRF, SSRF, IDOR, broken access control.
- Apply rate limits, request size limits, secure headers, and a CORS allowlist.
- Object storage is private. Use short-lived signed URLs, tenant-prefixed paths.
- Public tracking exposes **only explicitly approved fields**. Never expose internal notes, costs, or private customer data.

---

## 5. Flexibility Architecture (Configurable by Tenant)

Build these as data-driven features, not hardcoded behavior.

| Capability | Design |
|---|---|
| **Custom fields** | `custom_field_definitions` (entity, key, type, validation, visibility) + JSONB `custom_data` column with GIN index on supported entities (shipments, customers, etc.). Validate against definitions on write. |
| **Configurable workflows** | Fixed internal core states (safety layer). Tenants map their own labels, visibility, required evidence, and notifications onto them. Tenants cannot create transitions that break core invariants. |
| **Automation rules** | `automation_rules` with trigger, conditions, actions (notify, create ticket, assign, escalate, webhook). Executed asynchronously from outbox events via BullMQ. Rules are tenant-scoped, versioned, and logged. |
| **Pricing engine** | Rate cards and rules as data (zone, weight, volumetric weight, distance, package count, service, customer contract, surcharges, tax, discounts). Versioned. Always record the rule/version used. Provide a "simulate price" endpoint. Optional sandboxed formula support. |
| **Entitlements and feature flags** | Central `entitlements` service. Backend guards and frontend menus both read from it. Plans, limits, and modules are data (never hardcoded plan names). Each diagram module (Section 17) is a separately entitled module. |
| **Numbering** | `number_sequences` per tenant, branch, and document type with configurable format. Concurrency-safe allocation (row lock or atomic update). Used for tracking numbers, invoices, manifests, AWB references, load plans, bag/pallet IDs. |
| **Templates** | Versioned, tenant-scoped templates for labels, invoices, manifests, waybills, and notifications. Variables, multi-language. Sanitize rendering. |
| **Public API and webhooks** | API keys with scopes and rate limits, webhook subscriptions per event type, signed deliveries, retries, delivery logs. |
| **White-label** | Per-tenant logo, colors, custom domain, branded tracking page. |
| **Localization** | Per-tenant language, currency, units, time zone, date/number formats. Store timestamps in UTC. |
| **Transport modes** | Modes (road, air, sea, rail, drone) are data with per-mode required fields, documents, and milestones. Tenants enable only the modes they operate. |
| **Device adapters** | Robots, scanners, sorters, telematics, and drones connect through a common adapter interface; new device types are added without changing core modules. |

---

## 6. Domain Priorities

- **P0 (MVP):** auth, tenants, memberships, RBAC, audit, plans/entitlements, customers, shipments, packages, labels, pricing, tracking events, pickup/delivery tasks, driver interface + proof of delivery, customer portal, public tracking, core dashboard, basic reports, COD ledger design, basic packaging (package types, weight/dimensions, label), basic control view (shipment status board and exceptions list).
- **P1:** dispatch board, trips/routes, fleet, warehouse (WMS), returns/claims/tickets, invoices/payments/COD/expenses/settlements, hub scanning and containers (bags/pallets), automation engine, merchant payouts, e-commerce integrations, advanced reports, dock/yard and loading (Loader), outbound shipping/manifests (Shipping), full control tower (Control), packing stations and cartonization, truck telematics basics.
- **P2:** route optimization, GPS/ETA, carrier rate shopping, freight forwarding/multimodal, air freight (Airplane), ocean freight (Tanker), customs, EDI, drone delivery (Drone), robot/AGV integration (Robot), enterprise SSO/SCIM, dedicated tenant infrastructure, white-label domains.

Do not build P1/P2 features before the P0 vertical slice works end to end:
**create shipment → price → assign → collect → transit → deliver with POD → invoice.**

### Logistics features to design for (beyond the baseline)

- Hub and sorting operations: scan-in/out, bags/pallets, manifests, cross-docking.
- Zones, postal-code coverage, serviceability checks, address validation/geocoding.
- Delivery time windows, customer self-reschedule, delivery OTP/PIN.
- SLA engine per service and customer with breach alerts and escalation.
- Dangerous goods, restricted items, declared value and insurance.
- Franchise/agent network with commissions.
- Driver pay (per stop/parcel, incentives, penalties) and driver cash holding.
- Messaging channels: email, SMS, WhatsApp, Telegram, push.
- Delivery ratings / NPS.
- Offline-first driver PWA with a local action queue and defined conflict rules.
- Read replica or analytics store for heavy reports.

---

## 7. Database Conventions (Prisma + PostgreSQL)

- UUID primary keys (UUID v7 preferred for index locality), `created_at`, `updated_at`, and `version` for optimistic locking where concurrent edits matter.
- Soft-delete only where business history allows; shipments, events, invoices, ledger entries are never hard-deleted by users.
- Use `snake_case` in the DB, map to `camelCase` in Prisma (`@map`).
- Add indexes for every foreign key, tenant-scoped list queries, and common filters (`tenant_id, status, created_at`).
- Add CHECK constraints for invariants (non-negative amounts, valid enums, weight > 0).
- Migrations are forward-only in shared environments, reviewed, and tested against a copy of seed data.
- Seed includes: permissions catalog, default role templates, plans, demo tenants A and B (for isolation tests).

### Key entities

- **Tenancy/identity:** `tenants`, `tenant_settings`, `branches`, `users`, `tenant_memberships`, `roles`, `permissions`, `role_permissions`, `membership_roles`
- **Plans/billing:** `plans`, `plan_versions`, `plan_features`, `subscriptions`, `subscription_items`, `usage_records`, `billing_invoices`, `payment_transactions`, `webhook_events`
- **Customers/resources:** `customers`, `customer_contacts`, `customer_addresses`, `customer_contracts`, `carriers`, `drivers`, `vehicles`, `vehicle_maintenance_records`, `warehouses`, `warehouse_locations`, `products`
- **Shipments/delivery:** `shipments`, `packages`, `shipment_items`, `shipment_events`, `shipping_labels`, `pickup_tasks`, `trips`, `trip_stops`, `delivery_tasks`, `proof_of_delivery`, `shipment_documents`, `returns`, `claims`
- **Inventory/finance:** `inventory_balances`, `stock_movements`, `stock_transfers`, `stock_counts`, `rate_cards`, `rate_rules`, `quotes`, `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `cod_collections`, `carrier_settlements`, `expense_claims`, `ledger_accounts`, `ledger_entries`
- **Platform:** `audit_logs`, `notifications`, `notification_templates`, `integration_connections`, `webhook_endpoints`, `webhook_deliveries`, `outbox_events`, `import_jobs`, `import_errors`, `scheduled_reports`, `custom_field_definitions`, `automation_rules`, `number_sequences`, `api_keys`
- **Diagram modules (Section 17.3):** `package_types`, `packing_stations`, `packing_sessions`, `dock_doors`, `dock_appointments`, `load_plans`, `load_plan_lines`, `loading_tasks`, `mhe_assets`, `outbound_orders`, `manifests`, `manifest_lines`, `consolidations`, `transport_orders`, `routes`, `freight_costs`, `air_waybills`, `flights`, `uld_units`, `ocean_bookings`, `bills_of_lading`, `containers`, `vessels`, `customs_declarations`, `drone_missions`, `devices`, `device_tasks`, `control_alerts`, `exception_cases`, `kpi_snapshots`

---

## 8. API Conventions

- Base path `/api/v1`. Version breaking changes.
- Controllers are thin. Business logic lives in services. Policy checks in guards and services.
- Every endpoint has DTO validation, an explicit response schema, and OpenAPI decorators.
- Consistent error format:

```json
{
  "error": {
    "code": "SHIPMENT_INVALID_TRANSITION",
    "message": "Cannot move shipment from DELIVERED to IN_TRANSIT",
    "details": {},
    "requestId": "..."
  }
}
```

- Pagination, sorting, and filtering on all list endpoints with documented limits (cursor pagination preferred for large tables).
- Long work (imports, exports, notifications, reports) runs as background jobs. Exports are delivered via private expiring links.
- Public tracking (`GET /api/v1/tracking/:trackingNumber`) uses a separate DTO and controller from authenticated shipment details.
- Include a `requestId` in logs and responses for traceability.
- Device endpoints (`/api/v1/devices/...`) authenticate with device credentials, are rate limited per device, and are idempotent.

---

## 9. Frontend Conventions (Next.js)

- Use server-side session validation and a single typed API client (generated from OpenAPI where possible).
- Server-side pagination, sorting, filtering for large lists. No loading whole datasets into the browser.
- Every screen has loading, empty, error, success, and permission-denied states.
- Menus reflect entitlements and permissions, but never replace server checks.
- Forms: accessible, keyboard navigable, with useful validation messages. Share Zod schemas from `packages/shared`.
- Confirm destructive or high-impact actions. Bulk actions are validated and audited.
- Imports: upload → preview → row-level validation → downloadable error file → safe retry.
- Display timestamps in the user/tenant time zone. Support i18n from day one (no hardcoded UI strings).
- Never expose secrets in client bundles. Only `NEXT_PUBLIC_*` variables for non-secret values.
- Driver interface: mobile-first PWA, large touch targets, offline queue for approved actions, safe sync with idempotency keys.
- Warehouse/loader interface: handheld-friendly screens (scan-first, large buttons, minimal typing), works with hardware barcode scanners and camera scanning.
- Control tower: live map and boards update via tenant-scoped SSE/WebSocket, with a polling fallback.

---

## 10. Testing Requirements

**Every feature ships with tests.** Priorities:

- **Unit:** pricing, surcharges, state transitions, permission/policy logic, entitlements and quotas, COD and ledger calculations, volumetric weight, cartonization, load-plan capacity checks.
- **Integration:** DB constraints and transactions, tenant scoping and RLS, auth guards, file storage authorization, queue jobs, webhook signature and idempotency, device authentication.
- **E2E:** tenant onboarding; create → assign → collect → transit → deliver with POD; failed delivery → redelivery/return; quote → shipment → invoice → payment; COD → reconciliation → settlement; plan expiry → entitlement downgrade; invite user → assign role → denied unauthorized action; pack → load → manifest → dispatch → deliver (Section 17).

### Mandatory security tests (must always pass)

- Tenant A cannot read or modify Tenant B resources by changing IDs (API, search, reports, exports, files, caches, jobs, websockets).
- Tenant admin cannot grant platform-only permissions.
- Driver cannot update shipments outside their assignment.
- Customer cannot access another customer's documents or invoices.
- Duplicate webhooks or retried requests do not create duplicate payments or events.
- A device credential of Tenant A cannot post scans, tasks, or telemetry for Tenant B.
- A scanner or robot replaying the same scan does not create duplicate stock movements or shipment events.

---

## 11. Definition of Done

A change is not done until:

- [ ] Business rules and acceptance criteria are documented.
- [ ] DTO validation and error handling are implemented.
- [ ] Auth, tenant scope, permissions, branch scope, and ownership are enforced server-side.
- [ ] DB constraints, indexes, and transaction behavior are defined.
- [ ] Audit events are emitted for sensitive actions (actor, tenant, timestamp, action, target, outcome).
- [ ] Loading, empty, error, success, and denied UI states exist.
- [ ] Unit and integration tests pass; relevant e2e and isolation tests added.
- [ ] OpenAPI docs and user-facing behavior are updated.
- [ ] Logs and failure handling are in place, with no secrets or unnecessary personal data.
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass.

---

## 12. Working Rules for AI Agents

**Do**

- Read the relevant module and existing patterns before writing code. Match them.
- Make small, focused changes with a clear commit message (Conventional Commits: `feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- Put shared types, enums, and permission constants in `packages/shared`.
- Add or update tests in the same change.
- Write an ADR in `docs/adr/` for any significant architectural decision.
- Ask for clarification when a requirement touches an open decision (section 13) instead of guessing.

**Do not**

- Do not bypass the tenant-aware data layer or write raw SQL without tenant scoping.
- Do not hardcode plan names, limits, roles, statuses labels, or tenant-specific behavior.
- Do not trust client-supplied tenant IDs, prices, totals, or statuses.
- Do not delete or edit posted financial records or events. Use reversals/corrections.
- Do not add `any`, disable lint rules, or skip tests to make a build pass.
- Do not add new dependencies without justification. Prefer maintained, widely used packages.
- Do not commit `.env`, keys, or real customer data. Use synthetic seed data.
- Do not introduce microservices, new databases, or new queues without an ADR.
- Do not implement P1/P2 features while P0 slice is incomplete.
- Do not let a device, robot, or drone integration write directly to stock or shipment tables; it must call the owning module's service.

---

## 13. Open Product Decisions

Confirm before finalizing schema or implementation. If a task depends on one of these, stop and ask.

1. Initial target: courier/parcel, trucking, warehouse/3PL, freight forwarding, or all-in-one.
2. Audience: external logistics companies, internal operations, or both.
3. First interface: responsive web + driver PWA vs native mobile apps.
4. Pricing model: fixed subscription, usage-based, or combined.
5. Operating countries, currencies, languages, tax rules, local payment methods, compliance.
6. Expected tenant count, shipment volume, branches, users.
7. Online customer payments and supported payment providers.
8. Required integrations for MVP (GPS, carrier, accounting, customs, ERP, e-commerce).
9. Data retention, export, deletion, and enterprise isolation requirements.
10. Modules included in the first production release.
11. Which transport modes are in scope for release 1 (road only, or also air, sea, rail, drone).
12. Which automation devices must be supported (handheld scanners, sorters, AGV/AMR brands, telematics vendors, drone platforms) and their protocols.
13. Whether warehouse/dock/yard operations are used by tenants themselves or by 3PL customers on their behalf.

**Current default assumptions (until decided):** courier/parcel first, external logistics companies, responsive web + driver PWA, shared database with `tenant_id` + RLS, English first with i18n-ready UI, USD default currency per tenant setting, road transport only, handheld scanners via HID/camera only (no robot or drone integration).

---

## 14. Delivery Roadmap

| Phase | Scope | Exit criterion |
|---|---|---|
| **1. Secure foundation** | Monorepo, CI, Docker, Prisma, auth, tenants, memberships, RBAC, audit, plans, entitlements, number sequences, **RLS proof with pooled connections** | Users sign in, manage members and roles, and cannot cross tenant boundaries |
| **2. Logistics MVP** | Customers, addresses, zones/serviceability, shipments, packages and package types, labels, pricing, custom fields, tracking events, tasks, driver PWA + POD + OTP, customer portal, public tracking, dashboard, basic control view, notifications, COD ledger design | A tenant books, tracks, and completes a shipment with auditable POD |
| **3. Operational expansion** | Dispatch, trips, fleet, warehouse, packing stations, dock/loading, outbound manifests, hubs/containers, returns/claims, invoices, payments, COD, settlements, merchant payouts, automation engine, control tower, e-commerce integrations | Core shipment operations and financial processes work end to end |
| **4. Advanced** | GPS/routing/ETA, telematics, carrier rate shopping, accounting/ERP/EDI, freight forwarding (air, ocean), customs, robot/AGV and sorter integration, drone delivery, SSO/SCIM, dedicated infrastructure, white-label domains, analytics | Validated against real customer requirements |

---

## 15. Recommended First Implementation Order

1. Monorepo, lint/format, env config, CI pipeline.
2. PostgreSQL (Docker), Prisma, migration workflow.
3. Auth, tenants, memberships, tenant context, isolation tests (including RLS with `SET LOCAL`).
4. RBAC and audit logging.
5. Plans, subscriptions, entitlements, quota enforcement.
6. Number sequences and custom fields foundation.
7. Customers and addresses.
8. Shipments, packages (with package types), pricing, shipment events, state machine.
9. Pickup/delivery tasks and proof of delivery.
10. Customer tracking and customer portal.
11. Invoices, payments, COD ledger, basic reports, basic control view.
12. Warehouse, packing, dock/loading, outbound manifests, fleet, hubs, control tower, automation, advanced finance.
13. Air, ocean, customs, robots, and drones by demand (each behind an entitlement and an ADR).

---

## 16. Logistics Management Concepts → System Functions

Source: two educational videos on logistics management ("Logistics Management in 12 minutes" and AIMS Education's "What is Logistics Management?"). These notes are based on the videos' titles, descriptions, and chapter lists (transcripts were not available). They translate textbook logistics concepts into concrete, tenant-configurable system functions. Treat them as additions to the existing priorities, not replacements.

### 16.1 Core definition the system must satisfy

Logistics management is moving and storing goods, services, and **information** from origin to destination, on time, at minimal cost. The platform therefore tracks three flows together:

| Flow | System coverage |
|---|---|
| **Flow of goods** | shipments, packages, trips, hubs, warehouses, stock movements |
| **Flow of information** | tracking events, notifications, webhooks, APIs, EDI, customer portal |
| **Flow of money** | quotes, invoices, COD ledger, settlements, payouts, margin reports |

### 16.2 The Seven R's → validation and KPI mapping

| R | Meaning | Feature (priority) |
|---|---|---|
| Right product | correct item delivered | Item/SKU on shipment, pick/pack verification by barcode scan (P1) |
| Right quantity | correct count | Package/piece count check at pickup, hub scans, delivery; discrepancy report (P0) |
| Right condition | undamaged | Condition notes and photos at pickup and delivery, damage claim flow (P0/P1) |
| Right place | correct destination | Address validation, zones, serviceability check, geocoding (P0) |
| Right time | on schedule | Delivery time windows, SLA engine, delay alerts, on-time-delivery KPI (P0/P1) |
| Right customer | correct recipient | Recipient name, OTP/PIN, signature, ID check option (P0) |
| Right cost | profitable and fair | Server-side pricing, cost per shipment, gross margin report (P0/P1) |

Add a **"Seven R's scorecard"** report per tenant, branch, driver, and carrier (perfect-order rate = delivered right quantity, right condition, right place, on time, with correct documents).

### 16.3 Key logistics functions → modules

| Function | Module | Notes |
|---|---|---|
| Transportation | `dispatch`, `fleet`, `carriers`, `transport` | Mode field (road first; air/sea/rail in P2), carrier assignment, trips, stop sequencing |
| Warehousing | `warehouse` | Receiving, put-away, picking, packing, dispatch, locations |
| Inventory management | `warehouse` | Balances, movement ledger, reserved/available/damaged, reorder point, safety stock, cycle counts |
| Order processing | `shipments`, `pricing` | Booking, validation, quote-to-order, bulk import |
| Packaging and unitization | `shipments`, `packaging` | Package types, dimensions, volumetric weight, pallets, bags, containers |
| Materials handling | `warehouse`, `loading`, hubs | Scan-in/out, sorting, cross-docking, handling instructions and fragile flags |
| Information and visibility | `tracking`, `integrations`, `control-tower` | Real-time milestones, public tracking, webhooks, API |
| Customer service | `customer-service` | Tickets, claims, complaints, SLA and escalation |
| Reverse logistics | `returns` | Return authorization, reverse pickup, inspection, restock/refurbish/dispose/refund (P1) |

### 16.4 Strategy features (from the "goals and strategies" chapters)

**Substitute information for inventory** (know more, hold less)
- Real-time stock and shipment visibility across all warehouses and hubs (P1).
- Advance shipping notices (ASN) from customers and carriers so receiving is planned (P1).
- Demand and volume forecasting from historical shipment data, used for staffing and fleet planning (P2).
- Dynamic reorder points and safety-stock suggestions based on lead time and demand variability (P1/P2).
- Exception alerts before a delay becomes a failure (P1).

**Pool risks** (share buffers across locations)
- Multi-warehouse inventory pooling: view total available stock across locations and fulfil from the best location (P1/P2).
- Shipment consolidation and deconsolidation to share transport cost (P1).
- Network capacity view across branches, hubs, and vehicles to rebalance load (P1/P2).

**Reduce supply chain partners** (fewer, better partners)
- Carrier and subcontractor scorecards: on-time rate, first-attempt success, damage rate, cost per parcel, claim rate (P1).
- Carrier consolidation analysis: volume per carrier per lane to support rate negotiation (P2).
- Preferred-carrier rules per lane, customer, or service (P1).

**Cost efficiency and value proposition**
- Total logistics cost report: transport, handling, storage, last-mile, returns, claims (P1).
- Cost-to-serve per customer, lane, and service type (P1).
- Customer service level vs. cost trade-off dashboard (service level target vs. actual cost) (P2).
- Lean/responsive operations: configurable SLA targets per service and customer.

### 16.5 Suggested data model additions

- `shipments.mode` (road, air, sea, rail, drone), `shipments.condition_at_pickup`, `shipments.condition_at_delivery`
- `package_types`, `handling_flags` (fragile, hazardous, temperature, upright)
- `advance_shipping_notices`, `asn_lines`
- `reorder_policies` (product, warehouse, reorder point, safety stock, lead time)
- `carrier_scorecards` (period, carrier, KPIs; derived and rebuildable)
- `lane_definitions` (origin zone, destination zone, preferred carrier rules)
- `perfect_order_metrics` (derived per shipment: quantity ok, condition ok, place ok, on time ok, documents ok)
- `cost_allocations` (shipment or customer, cost type, amount, currency)

All new tables follow the rules in section 4 (`tenant_id`, tenant-aware constraints, RLS, audit where sensitive).

### 16.6 Reports to add

- Perfect-order rate and Seven R's scorecard
- Carrier scorecard and lane performance
- Cost-to-serve by customer, lane, and service
- Inventory turnover, stock-outs, and low-stock risk
- Forecast vs. actual shipment volume (P2)
- Reverse logistics rate and disposition outcomes

### 16.7 Agent notes for this section

- Derived metrics (scorecards, perfect-order, cost-to-serve) are computed from append-only events and ledger data by background jobs. Never edit source records to fix a metric.
- Forecasting and pooling are P2; do not build them before the P0 shipment slice and P1 warehouse basics work.
- Open question for the product owner: which of these strategy features matter for the first target segment (courier/parcel favours the Seven R's, SLA, carrier scorecards, and reverse logistics; warehouse/3PL favours inventory and pooling features).

---

## 17. Logistics Network Diagram → Modules, Functions, and Features

Source: the reference isometric logistics diagram. The center node **LOGISTICS** connects to: **Loader, Warehouse, Shipping, Control, Packaging, Transportation, Robot, Tanker (ocean/ship), Truck, Airplane, Drone, Delivery**. Each node below becomes a configurable, entitled module. The center node is the platform itself: a shared event backbone (`shipment_events`, `stock_movements`, `outbox_events`) that every node reads and writes through its owning module.

### 17.1 End-to-end flow

```
Packaging → Loader → Warehouse → Shipping → Transportation ─┬─ Truck
                                                            ├─ Tanker (ocean)
                                                            ├─ Airplane
                                                            └─ Drone
                                                                  ↓
                                                              Delivery → POD → Invoice
Control (monitors every step)      Robot (automates Warehouse, Loader, Packaging, hubs)
```

### 17.2 Node → module map

| Diagram node | Module(s) | Core purpose | Priority |
|---|---|---|---|
| Packaging | `packaging`, `shipments` | Package types, packing, cartonization, labels | P0 basic / P1 full |
| Loader | `loading` | Dock scheduling, load plans, loading/unloading, forklift tasks | P1 |
| Warehouse | `warehouse` | Receiving, put-away, pick, pack, stock control | P1 |
| Shipping | `outbound`, `documents`, `carriers` | Outbound orders, manifests, consolidation, carrier booking, shipping docs | P1 |
| Transportation | `transport`, `dispatch`, `pricing` | Transport orders, routing, mode selection, freight cost | P1 |
| Truck | `fleet`, `dispatch`, `transport` | Vehicles, drivers, trips, maintenance, fuel, telematics | P1 |
| Tanker (ocean) | `ocean-freight`, `customs` | Bookings, B/L, containers, vessels, port milestones | P2 |
| Airplane | `air-freight`, `customs` | AWB, flights, ULD, cut-offs | P2 |
| Drone | `drone-ops` | Drone missions, geofence, flight logs, regulatory data | P2 |
| Robot | `automation-devices` | AGV/AMR, sorter, scanner, IoT adapters and task queue | P2 (scanners P1) |
| Delivery | `delivery`, `tracking` | Last-mile tasks, POD, OTP, time windows, failed delivery, redelivery | P0 |
| Control | `control-tower`, `reports`, `automation` | Live monitoring, exceptions, alerts, KPI and SLA cockpit | P0 basic / P1 full |

### 17.3 Functions per node

#### Packaging (`packaging`)
- Package type catalog per tenant: box, envelope, pallet, bag, drum, crate, with dimensions, tare weight, max load, stackability.
- Dimension and weight capture at the packing station (scale and dimensioner integration optional); volumetric/chargeable weight computed server-side.
- Cartonization: suggest the smallest suitable package type for a set of items (P1).
- Packing sessions: scan items into packages, verify product and quantity (Right product, Right quantity), record condition photos.
- Handling flags: fragile, hazardous (dangerous goods class), temperature controlled, keep upright, high value.
- Packaging materials stock (boxes, tape, bubble wrap) as consumables with reorder points (P1).
- Label generation with tracking number, barcode/QR, routing code, handling icons; reprint is audited.
- Package, bag, and pallet unitization with parent/child relationships (package in bag in pallet in container).

#### Loader (`loading`)
- Dock door and yard management: dock doors, appointments, truck check-in/check-out, wait-time tracking (P1).
- Load plans: assign packages, bags, and pallets to a vehicle/container with capacity checks (weight, volume, pallet positions) and stop sequence (last-in first-out aware).
- Loading and unloading tasks with scan-to-load and scan-to-unload verification; discrepancy report (missing, extra, damaged).
- Forklift/MHE (material handling equipment) assets: registry, operator assignment, task queue, maintenance and inspection checklist (P1).
- Load seal numbers, loading photos, driver and loader sign-off.
- Block loading of packages that are on hold, unpaid (when configured), restricted, or not manifested.
- Loader-productivity metrics: units per hour, dock turnaround time.

#### Warehouse (`warehouse`)
- Receiving against ASN or without; inbound inspection; put-away rules to locations.
- Locations: zone, aisle, rack, bin; location types (pick, bulk, quarantine, damaged, returns, staging).
- Inventory balances with reserved, available, damaged, in-transit; append-only `stock_movements`.
- Picking: single, batch, wave, zone picking; pick-path ordering; short-pick handling.
- Packing handoff to Packaging; dispatch handoff to Shipping.
- Cycle counts, adjustments with approval permission and separation of duties.
- Reorder policies, safety stock, lot/batch and expiry (FEFO), serial numbers (optional per tenant).
- Cross-docking: inbound to outbound without put-away.
- Returns inspection and disposition (restock, refurbish, dispose, refund).
- Multi-warehouse transfers via `stock_transfers` (request → ship → receive).

#### Shipping (`outbound`)
- Outbound orders: created from shipments, e-commerce orders, or warehouse picks.
- Manifests and handover: group shipments by carrier, route, or hub; closed manifests are immutable; reopen requires a permission and audit entry.
- Consolidation and deconsolidation: combine shipments to the same destination into one transport unit; split cost fairly across shipments.
- Carrier booking: assign carrier/service per lane rules; store carrier reference; booking confirmation and cancellation.
- Shipping documents: label, packing list, commercial invoice, delivery note, waybill; versioned templates; stored privately.
- Rate shopping across carriers (P2) with recorded decision basis.
- Cut-off times per service and branch; late-pick warnings.
- Dangerous goods and restricted-item checks before booking; declared value and insurance.

#### Transportation (`transport`, `dispatch`)
- Transport orders: origin, destination, mode, service level, requested dates, equipment type.
- Mode selection assist (cost vs. time vs. SLA) with tenant-configurable rules.
- Routes and lanes (`lane_definitions`), stop sequencing, multi-stop trips, linehaul legs between hubs.
- Dispatch board: unassigned tasks, driver/vehicle assignment, drag-and-drop planning, re-assignment with reason.
- Freight cost capture per leg: carrier rate, fuel surcharge, tolls, handling, accessorials; compare estimated vs. actual (P1).
- Subcontractor/carrier management: contracts, rate cards, scorecards, insurance expiry.
- Route optimization and ETA from GPS (P2).
- Multimodal legs (road + air + sea) linked under one master shipment (P2).

#### Truck (`fleet`)
- Vehicle registry: type, capacity (weight, volume, pallets), plate, documents, insurance and inspection expiry.
- Driver registry: licence, expiry, availability, assignment, shift and rest-time rules (configurable per country).
- Trips: planned → loaded → departed → in transit → arrived → completed; odometer and fuel at start and end.
- Maintenance: schedules by date or mileage, work orders, parts, downtime (`vehicle_maintenance_records`).
- Fuel and expense logging with receipts; driver expense claims with approval.
- Telematics and GPS ingestion (P1/P2): position, speed, ignition, geofence enter/exit, route deviation alerts.
- Driver cash holding for COD and daily cash handover via the ledger.
- Vehicle inspection checklist (pre-trip/post-trip) with photos and defect reporting.

#### Tanker / Ocean (`ocean-freight`, P2)
- Ocean bookings: shipper, consignee, port of loading/discharge, incoterm, container type and count (FCL/LCL).
- Container registry: number, size/type, seal, status, free-time and demurrage/detention tracking.
- Bill of lading (master/house) with versioned drafts and approval before release.
- Vessel and voyage schedules, ETD/ETA, cut-offs (documents, cargo, VGM).
- Port milestones as shipment events: gate-in, loaded, departed, transshipment, arrived, discharged, gate-out.
- Dangerous goods and reefer (temperature) handling; tank/bulk liquid cargo as an optional cargo type.
- Charges: freight, THC, BAF, documentation fees; link to invoices and cost allocations.
- Carrier/liner integrations and tracking feeds via the integrations module.

#### Airplane / Air (`air-freight`, P2)
- Air waybill (AWB) master/house with number-range management per airline/agent.
- Flight schedules, booking, cut-off, ETD/ETA, flight events.
- ULD (unit load device) build-up and break-down; weight and balance data capture.
- Chargeable weight rules (IATA volumetric divisor configurable), rate classes, fuel/security surcharges.
- Air cargo security declarations, known-consignor flags, dangerous goods (IATA classes).
- Airport handling milestones: received, manifested, departed, arrived, customs hold, released.

#### Drone (`drone-ops`, P2)
- Drone registry: model, payload limit, range, battery cycles, maintenance, firmware version.
- Mission planning: pickup point, drop point, flight path, payload check, weather and no-fly-zone check, regulatory approval reference.
- Geofence and altitude limits enforced by the platform before mission release; kill-switch/return-to-home command (via adapter).
- Mission states: planned → approved → preflight check → launched → delivering → delivered/aborted → returned.
- Flight logs and telemetry (append-only); incident reporting.
- Delivery confirmation: recipient OTP at landing point or secure drop-box scan.
- Pilot/operator certification and assignment; every mission has an accountable human operator.
- Region and tenant entitlement required; disabled by default.

#### Robot / Automation (`automation-devices`)
- Device registry per tenant: handheld scanner, fixed scanner, sorter, conveyor, AGV/AMR, robotic arm, scale, dimensioner, label printer, telematics unit.
- Common adapter interface (register, heartbeat, receive task, report result, error) so new device types plug in without core changes.
- Task orchestration: warehouse and hub tasks (move pallet, sort parcel, pick item) published to devices; results flow back as validated events.
- Sorter integration: scan → lookup route/destination → return chute/bag assignment; fallback to manual sort on timeout.
- Device health: online/offline, battery, error codes, last heartbeat, maintenance schedule; alerts to Control.
- Human-in-the-loop: any device action that changes stock or shipment state passes the same state machine and permissions as a human action.
- Offline buffering on device with idempotency keys for replay.
- Safety: emergency stop status ingested and shown in Control; never disable safety signals from the platform.

#### Delivery (`delivery`, `tracking`)
- Delivery tasks from trips or direct assignment; stop list with navigation link.
- Delivery time windows, customer self-reschedule, delivery OTP/PIN, signature, photo, ID check option.
- Failed-delivery reasons (configurable list), attempt counter, auto-reschedule or return-to-sender rules.
- Contactless/safe-place delivery, neighbor delivery, locker/pickup point delivery (P1).
- COD collection at door with receipt and ledger posting.
- Customer notifications: out for delivery, ETA window, delivered, failed; multi-channel.
- Delivery rating / NPS request after completion.
- Proof of delivery is immutable once recorded; corrections add a correction event.
- Public tracking page (approved fields only) and customer portal timeline.

#### Control (`control-tower`)
- Live operations dashboard: shipments by state, trips in progress, late shipments, vehicles on map, dock status, warehouse queue sizes, device status.
- Exception management: automatically created `exception_cases` for late, stuck, damaged, missing, failed-delivery, temperature breach, geofence breach, device error; assign owner, SLA timer, resolution notes.
- Alerts and escalation rules (powered by `automation` rules): who is notified, when, and how.
- SLA monitoring per service/customer with predicted-breach warnings.
- KPI cockpit: on-time delivery, first-attempt success, perfect-order rate, dock turnaround, pick accuracy, fleet utilization, cost per shipment, claims rate.
- Search by tracking number, reference, phone, or customer from one global search (tenant-scoped, permission-filtered).
- Drill-down from KPI to the underlying shipments/events.
- Role-based views: operations manager, branch manager, warehouse supervisor, dispatcher, customer-service agent.
- Saved filters, scheduled report emails, wall-display (full-screen) mode.

### 17.4 Suggested data model (new tables)

All tables include `tenant_id`, `created_at`, `updated_at`, tenant-aware unique constraints, indexes, and RLS.

| Area | Tables (key columns) |
|---|---|
| Packaging | `package_types` (code, dims, tare, max_load), `packing_stations` (branch, status), `packing_sessions` (station, operator, started/ended), `handling_flags` |
| Loading | `dock_doors` (warehouse, type), `dock_appointments` (door, vehicle, window, status), `load_plans` (vehicle/container, status, seal_no), `load_plan_lines` (package/pallet, stop_seq), `loading_tasks` (type load/unload, assignee, status), `mhe_assets` (type, status) |
| Outbound | `outbound_orders`, `manifests` (carrier, route, status, closed_at), `manifest_lines`, `consolidations`, `consolidation_lines` |
| Transport | `transport_orders` (mode, service, equipment), `routes`, `route_legs`, `freight_costs` (leg, type, amount, currency, estimated/actual) |
| Truck | existing `vehicles`, `drivers`, `trips`, `trip_stops`; add `vehicle_inspections`, `fuel_logs`, `telematics_positions` (append-only, partitioned by time) |
| Ocean | `ocean_bookings`, `bills_of_lading`, `containers`, `container_events`, `vessels`, `voyages` |
| Air | `air_waybills`, `flights`, `uld_units`, `air_events` |
| Drone | `drones`, `drone_missions`, `drone_telemetry` (append-only), `drone_incidents`, `geofences` |
| Devices | `devices` (type, status, credential_hash, last_seen), `device_tasks` (type, payload, status, result), `device_events` (append-only) |
| Control | `exception_cases` (type, severity, owner, sla_due, status), `control_alerts`, `kpi_snapshots` (derived, rebuildable), `saved_views` |
| Customs (P2) | `customs_declarations`, `hs_codes`, `duty_calculations`, `trade_documents` |

Notes:
- `shipment_events`, `stock_movements`, `container_events`, `air_events`, `drone_telemetry`, `device_events`, and `telematics_positions` are append-only.
- High-volume telemetry tables are time-partitioned with a retention policy per tenant plan.
- Device credentials are stored hashed or encrypted and are never returned after creation.

### 17.5 State machines to define (explicit transition tables)

| Entity | States (core) |
|---|---|
| Package/Packing session | open → packing → packed → verified → labeled → closed (cancelled) |
| Load plan | draft → planned → loading → loaded → sealed → departed → (unloading → unloaded) → closed |
| Dock appointment | scheduled → checked_in → at_dock → loading/unloading → completed → departed (no_show, cancelled) |
| Manifest | open → closed → handed_over → received (reopened by permission) |
| Transport order | requested → planned → booked → in_transit → completed (cancelled) |
| Trip | planned → loading → departed → in_transit → arrived → completed (cancelled) |
| Device task | queued → dispatched → accepted → running → done/failed → (retry or manual) |
| Drone mission | planned → approved → preflight → launched → delivering → delivered/aborted → returned → closed |
| Ocean booking | requested → confirmed → container_released → gated_in → loaded → departed → arrived → discharged → delivered |
| Air booking | requested → confirmed → received_at_airport → manifested → departed → arrived → released → delivered |
| Exception case | open → acknowledged → in_progress → resolved → closed (reopened) |

Every transition records actor (human or device), source, `occurred_at`, `recorded_at`, reason, and location where relevant, and requires the evidence defined for it (for example scan, photo, seal number, OTP, signature, approval).

### 17.6 Permissions (add to `packages/shared`)

Examples (resource.action format):
- `packaging.types.manage`, `packaging.session.run`, `labels.reprint`
- `loading.plan.create`, `loading.plan.seal`, `loading.dock.manage`, `loading.override`
- `warehouse.receive`, `warehouse.pick`, `warehouse.stock.adjust`, `warehouse.stock.adjust.approve`
- `manifests.create`, `manifests.close`, `manifests.reopen`
- `transport.orders.manage`, `dispatch.assign`, `dispatch.reassign`
- `fleet.vehicles.manage`, `fleet.maintenance.manage`, `fleet.inspection.submit`
- `ocean.booking.manage`, `ocean.bl.release`, `air.awb.manage`, `customs.declaration.submit`
- `drone.mission.plan`, `drone.mission.approve`, `drone.mission.abort`
- `devices.manage`, `devices.credentials.rotate`, `devices.tasks.override`
- `control.dashboard.view`, `control.exceptions.manage`, `control.alerts.configure`, `reports.kpi.view`

Separation of duties: the person who plans a drone mission, adjusts stock, or releases a bill of lading cannot also be the sole approver.

### 17.7 Automation rule examples (Control + Robot + Delivery)

- If a shipment is not scanned at the hub within X hours of expected time → create exception, notify hub manager.
- If a dock appointment is late by more than Y minutes → notify dispatcher and re-slot.
- If a vehicle leaves its geofence/route → alert Control and driver.
- If a device is offline for more than Z minutes → alert supervisor and route tasks to manual.
- If delivery fails twice → notify customer with reschedule link and open a customer-service ticket.
- If a reefer/temperature reading breaches limits → create high-severity exception and notify the customer (when configured).
- If a container free-time is about to expire → notify the ocean desk to avoid demurrage.

### 17.8 Reports and KPIs

- **Packaging:** pack accuracy, packing time per order, package-type usage, damaged-in-packing rate.
- **Loader/dock:** dock turnaround time, truck wait time, loading discrepancies, units loaded per hour.
- **Warehouse:** inventory accuracy, put-away time, pick rate and accuracy, stock-outs, turnover, space utilization.
- **Shipping:** manifest on-time handover, cut-off misses, consolidation savings, carrier booking success.
- **Transportation/Truck:** fleet utilization, empty-run %, cost per km and per parcel, fuel efficiency, maintenance downtime, trip on-time rate.
- **Ocean/Air:** transit time vs. schedule, demurrage/detention cost, rolled cargo rate, chargeable-weight variance.
- **Drone:** mission success rate, aborted missions, flight time, battery cycle usage, incidents.
- **Robot/devices:** device uptime, task completion time, error rate, manual-fallback rate.
- **Delivery:** first-attempt success, on-time delivery, failed-delivery reasons, POD completeness, NPS.
- **Control:** open exceptions by age and severity, SLA breaches, mean time to resolve.
- All of the above feed the Seven R's scorecard and perfect-order metrics from Section 16.

### 17.9 Integrations for these nodes

- Barcode/QR scanners (HID, camera, SDK), label and receipt printers, scales, dimensioners.
- GPS/telematics vendors, fuel cards, toll systems.
- Carrier APIs (booking, labels, tracking), liner/airline tracking feeds.
- E-commerce and ERP/WMS (orders in, status out).
- Customs/trade systems and EDI (P2).
- Drone platform APIs and UTM/airspace services (P2, region-dependent).
- Messaging providers (email, SMS, WhatsApp, Telegram, push).

All integrations use `integration_connections` with encrypted credentials, retries with bounded backoff, delivery logs, and a dead-letter queue.

### 17.10 Tests specific to this section

- Unit: load-plan capacity and stop-order validation, cartonization, chargeable weight (road, air, ocean), consolidation cost split, device task state machine, drone geofence/payload checks.
- Integration: scan-to-load idempotency, manifest close immutability, device credential isolation, exception creation from automation rules, telemetry partition and retention jobs.
- E2E: pack → label → load → seal → manifest → depart → hub scan → deliver with POD; sorter scan → chute assignment → manual fallback on device timeout; failed delivery → exception → redelivery; ocean booking → container events → delivered (P2); drone mission planned → approved → delivered (P2).
- Security: Tenant A device cannot post to Tenant B; loader without `loading.plan.seal` cannot seal; same person cannot both plan and approve a drone mission.

### 17.11 Agent notes for this section

- Build in this order inside the P1 phase: packaging → warehouse → loading → outbound/manifests → transport/dispatch/fleet → control tower. Air, ocean, customs, robot, and drone come after P0 and P1 work and each needs an ADR and an entitlement flag.
- Do not model modes as separate shipment tables. Use one `shipments` core with `mode` plus mode-specific extension tables (`air_waybills`, `ocean_bookings`, etc.) linked by `shipment_id`.
- Devices, robots, and drones are clients of the API and services. They never write directly to the database or bypass state machines.
- Control tower reads from events and derived tables; it does not own shipment data. Never fix a KPI by editing source records.
- Where the diagram label "Tanker" appears, implement it as general ocean freight (containers, bulk, and tank cargo), not only liquid tankers.
- Ask the product owner (Section 13, items 11 to 13) before building P2 modes or device integrations.
