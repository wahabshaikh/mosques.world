# Phase 1 runbook

> **Feature flags were removed in October 2026** (every phase was at 100%). This phase is always live; the flag
> steps below are history. Roll back with the previous Worker version.


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

### On-demand area fill (`places.osm` flag)

With `places.osm` on, the explore page asks `POST /api/v1/places/fill` to load any area that has no
OpenStreetMap mosques yet: one geohash-4 cell per Overpass query, nearest first, two cells per request
(the browser calls again until `remaining` is 0). Cells live in `osm_cell`; failures retry after 30
minutes, finished cells re-sync after 30 days via the weekly cron. Cells with 10+ OSM places from the
original seed (London, Istanbul) are left to the weekly city sync. The same flag switches "Where" search,
`/search?where=` links and add-a-place search from Google Places to Photon (free, KV-cached).

- Always on (feature flags were removed in October 2026).
- Watch: Workers Logs for `Area fill failed for …` (Overpass 429/504 on every mirror).
- Inspect: `SELECT status, COUNT(*), SUM(inserted) FROM osm_cell GROUP BY status`.
- Turn off: set the flag to `off`; filled places stay (they are ordinary directory rows).
- Locally and in E2E, Overpass and Photon are answered by `lib/osm-fixture.ts` when the request has the
  `x-mw-osm-fixture: 1` header or `mw_osm_fixture=1` cookie (non-production hosts only).

## Deploy

Production is the `mosques-world` Worker on `mosques.world`. Workers Builds deploys every push to `main`
(`pnpm cf:deploy`, migrations first); other branches get a Worker Preview on the preview database. See
[docs/deployment.md](../deployment.md) for environments, secrets and manual commands.

## Email

Waitlist confirmation is stored in D1. Preview and localhost copy the message into KV (`email:latest`) for the test sink at `/api/v1/test/emails`. Production enqueues the message on `q-email`. The consumer sends it with the Email Service binding from `salam@mosques.world` (SPF, DKIM, and DMARC on `mosques.world`).

## Known gaps before the definition of done is fully closed

- `GOOGLE_MAPS_API_KEY`, `DATAFAST_WEBSITE_ID`, and `DATAFAST_API_KEY` are unset. Search falls back to the city table. Geocode requests past 20 per hour per IP ask for the Turnstile widget when `TURNSTILE_SECRET_KEY` is bound.
- `SENTRY_DSN` is a Worker secret (already set on production and preview). The Worker reports server errors when it is present and does nothing when it is absent. No build-time variable is required. On preview, `GET /api/v1/test/sentry` throws `Sentry preview check` (same gate as the email sink). Production returns 404.
- Lighthouse is run against the deployed mosque page after each production deploy.
