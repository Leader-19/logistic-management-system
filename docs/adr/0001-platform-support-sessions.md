# ADR 0001: Platform support sessions

- Status: Accepted
- Date: 2026-10-16

## Context

Platform administrators need cross-tenant operational access while tenant data access remains explicit and auditable. A platform administrator is a global account, separate from a tenant membership and tenant Owner role.

## Decision

- Provision the first platform administrator with the interactive `pnpm platform:admin:create` command. It creates a user with `is_platform_admin=true`, requires a unique email, and reads the password without echoing it.
- Platform administrators discover tenants through platform-only endpoints guarded by the database-backed `isPlatformAdmin` flag.
- Access to tenant endpoints requires a persisted support session bound to the administrator and tenant. Starting a session requires a reason, a duration from 1 to 240 minutes, and explicit permission keys.
- Each tenant request must provide the session ID and matching tenant ID. The backend validates the administrator, session expiry, session end time, tenant status, and requested permission on every request.
- Administrators can end a session early. Sessions expire automatically. The browser stores the active session ID in an HTTP-only cookie and forwards it only through the same-origin backend proxy.
- Session start/end, platform requests, supported tenant requests, and denied support permissions are recorded in audit logs. Request bodies and query values are excluded.

## Consequences

Platform administrators do not receive implicit tenant membership or a wildcard tenant permission. A support session grants only the selected permission keys. A tenant must be active to start or use a session. New platform administrator accounts are not created through public registration.
