# SaaS subscription billing setup

## Platform setup

1. Set `DEFAULT_INCLUDED_USERS` to the number of starter user accounts included for each new workspace. The default is 10.
2. Set `STRIPE_CURRENCY` to the single currency used by platform plans (default `USD`). Plan amounts are entered in major currency units, for example `29.00`.
3. Configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in the deployment secret store.
4. In Stripe, add a webhook endpoint at `https://<api-host>/api/v1/webhooks/stripe` for `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
5. Run the forward migration, then sign in as a platform administrator and open **Plans & billing**. Create one or more plans with monthly and yearly amounts and a `max_users` seat limit higher than the starter allowance.

The tenant-facing **Billing & plan** page displays seat usage and available plans. The API verifies Stripe webhook signatures and deduplicates event IDs before activating paid seats. Checkout remains unavailable until Stripe is configured.

## Operations notes

- Active users and pending invitations count toward a plan's seats. Deactivated users release a seat.
- A failed or cancelled subscription does not remove existing accounts; new account creation falls back to the starter allowance.
- Existing active subscriptions should be changed through **Manage subscription** in the Stripe customer portal. Configure the portal in Stripe to allow plan changes and cancellation.
- Never put Stripe secret keys in frontend environment variables.
