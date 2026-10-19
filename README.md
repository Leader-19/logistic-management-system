# Fleetwise Logistics Management System

A TypeScript monorepo for the logistics SaaS in `projectRequirement.md`.

## Structure

- `frontend/`: Next.js operations dashboard
- `backend/`: NestJS API, Prisma schema, and database migrations
- `docker-compose.yml`: local PostgreSQL 16 service

## Start locally

1. Use Node.js 20+ and Docker Desktop.
2. Copy `.env.example` to `.env`; set `JWT_SECRET` to a locally generated random secret (for example, `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`).
3. Install dependencies with `npm install`.
4. Start PostgreSQL with `npm run db:up`.
5. Generate Prisma client and create the development migration: `npm run db:generate`, then `npm run db:migrate`.
6. Start both apps with `npm run dev`.

The dashboard is at `http://localhost:3000`, the API health check is at `http://localhost:4000/api/v1/health`, and Swagger is at `http://localhost:4000/api/docs`.

## Implemented API foundation

- `POST /api/v1/auth/register`: create a tenant, owner account, membership, and audit entry.
- `POST /api/v1/auth/login`: verify the account and issue a one-hour bearer token.
- `GET /api/v1/tenant/context`: requires the bearer token and an `x-tenant-id` matching an active membership; role permission is checked on the server.

Passwords are stored as salted PBKDF2 hashes. The dashboard still displays sample data. Customer and shipment workflows, custom tenant roles, and full audit coverage remain to be completed before operational use. SaaS seat plans and Stripe subscription checkout are available after platform plans and Stripe credentials are configured. The current fixed role permissions are an initial baseline, not a substitute for the tenant-configurable RBAC in the requirements.

