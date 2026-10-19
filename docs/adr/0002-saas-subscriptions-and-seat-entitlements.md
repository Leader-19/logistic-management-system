# ADR 0002: SaaS subscriptions and seat entitlements

- Status: Accepted
- Date: 2026-10-18

## Context

The product needs recurring tenant billing, a configurable included-seat allowance, and a server-enforced user limit. A browser redirect alone cannot safely grant seats because payment completion can be delayed or faked.

## Decision

- The platform administrator manages recurring monthly and yearly plans, including their price and `max_users` feature.
- New workspaces receive the configured starter allowance (`DEFAULT_INCLUDED_USERS`, default 10).
- Tenant owners use Stripe Checkout for the first paid plan. Stripe subscription webhooks are signature-verified and idempotent before updating the local subscription record.
- Member creation, invitations, bulk member creation, and reactivation enforce the active subscription plan's `max_users` feature inside a transaction. Active users and pending invitations reserve seats.
- A plan can be changed through the Stripe customer portal. Platform administrators retain tenant and plan oversight in the platform console.

## Consequences

- Production must configure Stripe API credentials, a webhook endpoint, and the platform currency before online billing is enabled.
- Existing customers are not charged automatically; they move to a paid plan through explicit checkout.
- If a subscription lapses, creation is limited to the starter allowance. Existing accounts and records remain intact.
