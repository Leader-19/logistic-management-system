# Local testing

## Browser end-to-end smoke tests

Run `npm run test:e2e` from the repository root. Playwright starts the Next.js frontend and checks login and registration rendering at desktop and mobile widths. Install its browser once with `npm exec --workspace @lms/web -- playwright install chromium`.

Set `E2E_BASE_URL` to use a separately running web server. In CI, set `CI=true` to enable retries and the GitHub reporter.

## Repeatable demo records

The guarded local seed script adds synthetic records for list, search, filter, and pagination testing. Its default is 250 records for each supported list feature. Set `DEMO_VOLUME_COUNT` from 1 to 500 to choose a different volume. It remains disabled in production and requires `ALLOW_DEMO_SEED=true`; it does not overwrite records or duplicate deterministic seed keys.
