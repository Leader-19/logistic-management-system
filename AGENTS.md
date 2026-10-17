# AGENTS.md — SaaS Logistics Management System (LMS)

Instructions for AI coding agents and developers working in this repository.
Read this file fully before making changes. When this file conflicts with a quick shortcut, follow this file.

---

## 1. Project Summary

A configurable, secure, **multi-tenant SaaS Logistics Management System**. Many logistics companies (tenants) subscribe and run their own customers, shipments, staff, branches, warehouses, drivers, vehicles, deliveries, billing, and reports with strict data isolation.

- **Initial focus:** courier / parcel delivery (expandable to trucking, warehouse/3PL, freight forwarding).
- **Architecture:** modular monolith first. Clear domain boundaries so services can be extracted later.
- **Core principle:** one configurable platform with optional modules, not one app per customer.

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
│           ├── (tenant)/    # tenant admin + logistics operations
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

`auth`, `tenants`, `memberships`, `users`, `roles`, `permissions`, `subscriptions`, `billing`, `entitlements`, `branches`, `customers`, `carriers`, `shipments`, `tracking`, `pricing`, `dispatch`, `fleet`, `warehouse`, `delivery`, `documents`, `customer-service`, `finance`, `ledger`, `reports`, `notifications`, `integrations`, `automation`, `custom-fields`, `numbering`, `audit`

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
| **Entitlements and feature flags** | Central `entitlements` service. Backend guards and frontend menus both read from it. Plans, limits, and modules are data (never hardcoded plan names). |
| **Numbering** | `number_sequences` per tenant, branch, and document type with configurable format. Concurrency-safe allocation (row lock or atomic update). Used for tracking numbers, invoices, manifests. |
| **Templates** | Versioned, tenant-scoped templates for labels, invoices, and notifications. Variables, multi-language. Sanitize rendering. |
| **Public API and webhooks** | API keys with scopes and rate limits, webhook subscriptions per event type, signed deliveries, retries, delivery logs. |
| **White-label** | Per-tenant logo, colors, custom domain, branded tracking page. |
| **Localization** | Per-tenant language, currency, units, time zone, date/number formats. Store timestamps in UTC. |

---

## 6. Domain Priorities

- **P0 (MVP):** auth, tenants, memberships, RBAC, audit, plans/entitlements, customers, shipments, packages, labels, pricing, tracking events, pickup/delivery tasks, driver interface + proof of delivery, customer portal, public tracking, core dashboard, basic reports, COD ledger design.
- **P1:** dispatch board, trips/routes, fleet, warehouse (WMS), returns/claims/tickets, invoices/payments/COD/expenses/settlements, hub scanning and containers (bags/pallets), automation engine, merchant payouts, e-commerce integrations, advanced reports.
- **P2:** route optimization, GPS/ETA, carrier rate shopping, freight forwarding/multimodal, customs, EDI, enterprise SSO/SCIM, dedicated tenant infrastructure, white-label domains.

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

---

## 10. Testing Requirements

**Every feature ships with tests.** Priorities:

- **Unit:** pricing, surcharges, state transitions, permission/policy logic, entitlements and quotas, COD and ledger calculations.
- **Integration:** DB constraints and transactions, tenant scoping and RLS, auth guards, file storage authorization, queue jobs, webhook signature and idempotency.
- **E2E:** tenant onboarding; create → assign → collect → transit → deliver with POD; failed delivery → redelivery/return; quote → shipment → invoice → payment; COD → reconciliation → settlement; plan expiry → entitlement downgrade; invite user → assign role → denied unauthorized action.

### Mandatory security tests (must always pass)

- Tenant A cannot read or modify Tenant B resources by changing IDs (API, search, reports, exports, files, caches, jobs, websockets).
- Tenant admin cannot grant platform-only permissions.
- Driver cannot update shipments outside their assignment.
- Customer cannot access another customer's documents or invoices.
- Duplicate webhooks or retried requests do not create duplicate payments or events.

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

**Current default assumptions (until decided):** courier/parcel first, external logistics companies, responsive web + driver PWA, shared database with `tenant_id` + RLS, English first with i18n-ready UI, USD default currency per tenant setting.

---

## 14. Delivery Roadmap

| Phase | Scope | Exit criterion |
|---|---|---|
| **1. Secure foundation** | Monorepo, CI, Docker, Prisma, auth, tenants, memberships, RBAC, audit, plans, entitlements, number sequences, **RLS proof with pooled connections** | Users sign in, manage members and roles, and cannot cross tenant boundaries |
| **2. Logistics MVP** | Customers, addresses, zones/serviceability, shipments, packages, labels, pricing, custom fields, tracking events, tasks, driver PWA + POD + OTP, customer portal, public tracking, dashboard, notifications, COD ledger design | A tenant books, tracks, and completes a shipment with auditable POD |
| **3. Operational expansion** | Dispatch, trips, fleet, warehouse, hubs/containers, returns/claims, invoices, payments, COD, settlements, merchant payouts, automation engine, e-commerce integrations | Core shipment operations and financial processes work end to end |
| **4. Advanced** | GPS/routing/ETA, carrier rate shopping, accounting/ERP/EDI, freight forwarding, SSO/SCIM, dedicated infrastructure, white-label domains, analytics | Validated against real customer requirements |

---

## 15. Recommended First Implementation Order

1. Monorepo, lint/format, env config, CI pipeline.
2. PostgreSQL (Docker), Prisma, migration workflow.
3. Auth, tenants, memberships, tenant context, isolation tests (including RLS with `SET LOCAL`).
4. RBAC and audit logging.
5. Plans, subscriptions, entitlements, quota enforcement.
6. Number sequences and custom fields foundation.
7. Customers and addresses.
8. Shipments, packages, pricing, shipment events, state machine.
9. Pickup/delivery tasks and proof of delivery.
10. Customer tracking and customer portal.
11. Invoices, payments, COD ledger, basic reports.
12. Fleet, warehouse, hubs, automation, advanced finance, and freight modules by demand.
