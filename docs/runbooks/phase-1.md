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
pnpm exec wrangler d1 migrations apply DB --local
pnpm dev
```

The app listens on http://127.0.0.1:5173. Local and preview hosts accept `x-mw-latitude`, `x-mw-longitude`, and `x-mw-now` so tests can pin a place and a clock. Production ignores those headers.

## Data

`migrations/0001_phase1.sql` creates the directory tables. `migrations/0002_seed.sql` loads launch-city places from OpenStreetMap (London, Istanbul, Makkah, Toronto, Jakarta, Oslo, Mumbai).

To import another region when Overpass is reachable:

```bash
pnpm exec tsx scripts/import-osm.ts --bbox 51.28,-0.52,51.70,0.30 --country GB --city london --city-name London \
  | pnpm exec wrangler d1 execute DB --remote --file=/dev/stdin
```

A nightly cron recounts `city.place_count`.

## Deploy

Production is the `mosques-world` Worker on `mosques.world`. Workers Builds deploys every push to `main`
(`pnpm cf:deploy`, migrations first); other branches get a Worker Preview on the preview database. See
[docs/deployment.md](../deployment.md) for environments, secrets and manual commands.

## Email

Waitlist confirmation is stored in D1. Preview and localhost copy the message into KV (`email:latest`) for the test sink at `/api/v1/test/emails`. Production enqueues the message on `q-email`. The consumer sends it with the Email Service binding from `no-reply@mail.mosques.world` (SPF, DKIM, and DMARC on `mail.mosques.world`).

## Known gaps before the definition of done is fully closed

- `GOOGLE_MAPS_API_KEY`, `DATAFAST_WEBSITE_ID`, and `DATAFAST_API_KEY` are unset. Search falls back to the city table. Geocode requests past 20 per hour per IP ask for the Turnstile widget when `TURNSTILE_SECRET_KEY` is bound.
- `SENTRY_DSN` is a Worker secret. The Worker reports server errors when it is present and does nothing when it is absent. Browser errors also need `NEXT_PUBLIC_SENTRY_DSN` as a Workers Builds build variable (same DSN; vinext inlines it). On preview, `GET /api/v1/test/sentry` throws `Sentry preview check` (same gate as the email sink). Production returns 404.
- Lighthouse is run against the deployed mosque page after each production deploy.
