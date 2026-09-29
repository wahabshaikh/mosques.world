# Phase 1 runbook

## What is live

Public directory: explore, search, mosque pages with calculated adhan times, city and country pages, sitemap, and waitlist double opt-in.

## Rollback

Deploy the previous Worker version and leave the database as-is. Migrations are additive, so there is no database rollback.

```bash
wrangler rollback
```

## Local

```bash
pnpm install
pnpm exec wrangler d1 migrations apply DB --env preview --local
CLOUDFLARE_ENV=preview pnpm dev
```

The app listens on http://127.0.0.1:5173. Local development uses preview bindings so missing phase flags default on. Local and preview hosts accept `x-mw-latitude`, `x-mw-longitude`, and `x-mw-now` so tests can pin a place and a clock. Production ignores those headers.

## Data

`migrations/0001_phase1.sql` creates the directory tables. `migrations/0002_seed.sql` loads launch-city places from OpenStreetMap (London, Istanbul, Makkah, Toronto, Jakarta, Oslo, Mumbai).

To import another region when Overpass is reachable:

```bash
pnpm exec tsx scripts/import-osm.ts --bbox 51.28,-0.52,51.70,0.30 --country GB --city london --city-name London \
  | pnpm exec wrangler d1 execute DB --remote --file=/dev/stdin
```

A nightly cron recounts `city.place_count`.

## Deploy

Production is the `mosques-world` Worker on `mosques.world`.

```bash
pnpm deploy
```

Preview is `mosques-world-preview` on `workers.dev` only. Its Wrangler env sets `routes` and `triggers.crons` to empty, uses separate D1/KV/R2 resources, and has no production queue or email bindings. Build with `CLOUDFLARE_ENV=preview`, then deploy the flattened config vinext writes:

```bash
pnpm deploy:preview
```

Before running remote E2E against preview, set a unique 32-character-or-longer `TEST_FIXTURE_SECRET` Worker secret on that preview Worker and pass it as `PLAYWRIGHT_TEST_SECRET` to the test runner. The `/api/v1/test/*` routes return 404 without it on remote preview. Rotate the secret if exposed. Production never enables these routes.

## Email

Waitlist confirmation is stored in D1. Preview and localhost copy the message into KV (`email:latest`) for the protected test sink at `/api/v1/test/emails`. Production enqueues the message on `q-email`. The consumer sends it with the Email Service binding from `no-reply@mail.mosques.world` (SPF, DKIM, and DMARC on `mail.mosques.world`).

## Known gaps before the definition of done is fully closed

- `GOOGLE_MAPS_API_KEY`, `DATAFAST_WEBSITE_ID`, and `DATAFAST_API_KEY` are unset. Search falls back to the city table. Geocode requests past 20 per hour per IP ask for the Turnstile widget when `TURNSTILE_SECRET_KEY` is bound.
- `SENTRY_DSN` is a Worker secret (already set on production and preview). The Worker reports server errors when it is present and does nothing when it is absent. No build-time variable is required. On preview, `GET /api/v1/test/sentry` throws `Sentry preview check` (same gate as the email sink). Production returns 404.
- Lighthouse is run against the deployed mosque page after each production deploy.
