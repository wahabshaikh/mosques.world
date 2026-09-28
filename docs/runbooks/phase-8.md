# Phase 8 runbook — Global & open

## What is live

- **Languages** en, ar, ur, bn, id, ms, tr, fr. `/{locale}/…` renders the same page in that language; the middleware
  rewrites the path onto the existing route and passes the locale in `x-mw-locale`. Unprefixed URLs stay English and
  unchanged (so caches, links and search results keep working); `/en/…` 308-redirects to the unprefixed URL.
  - `<html lang dir>` per locale; Arabic and Urdu are right-to-left (layout uses logical `ms`/`me`/`text-start`).
  - Catalogs: `lib/i18n/messages/*.ts` (server strings, typed against `en.ts` so a missing key fails the build) and
    `lib/i18n/client-messages.ts` (the few client-component strings, keyed by their English text; only the page's own
    language is sent, nothing on English pages).
  - Prayer names, clock style (12 h: en, ar, ur, bn, ms; 24 h: id, tr, fr), dates, Hijri date and relative ages are
    localized. Translated today: site header and footer, the mosque page (headings, table, next-prayer card, trust
    lines, Jumu'ah, Eid, facility and source sections) and the main buttons on it. Other pages render inside the
    localized chrome in English until their strings move into the catalogs.
  - Fonts: Noto Naskh Arabic for Arabic-script UI text and Amiri (+2 px) for names in Arabic script, self-hosted and
    fetched only when Arabic glyphs are on the page (`unicode-range`).
  - `hreflang` alternates (+ `x-default`) and a locale-specific canonical on the home and mosque pages. The footer's
    language switcher links to the same page in each language (full loads). On the home page only, a visitor whose
    `Accept-Language` prefers a supported language gets a one-line link to it (never on the CDN-cached mosque/city
    pages).
  - Layouts must not read the request path: vinext reuses mounted layouts across client navigations and answers a
    Flight request with 404 (forcing a full load) when a layout's output would differ. The switcher reads the path
    on the client for that reason.
- **Public read API** `/api/v1/public/places`, `/places/{id|slug}`, `/places/{id|slug}/times?date=` with keys from
  `/settings/developers` (up to 5 active per person; only a SHA-256 is stored, the key is shown once). Docs at
  `/developers`, OpenAPI 3.1 at `/api/v1/openapi.json`. Times come from the same code as the mosque page. CORS is open
  for GET. No contributor identities are returned.
- **Open data**: every month, all active and closed places with their current iqamah, Jumu'ah and amenity values and
  confirmation counts, as GeoJSON and CSV (ODbL), at `/open-data` → `/open-data/files/places-YYYY-MM.{geojson,csv}`
  (R2 `MEDIA` bucket, `open-data/` prefix). No accounts, authors, votes, check-ins, notes or phone numbers.

## Flag

`phase8.global` in `FLAGS`. It depends only on Phase 1 (spec dependency map); key management additionally needs
accounts (`phase2.contributions`). While off, `/ar/…` etc. are not found and the API, docs and export pages 404.

## Before turning it on in production

1. Time Travel bookmark, then `pnpm exec wrangler d1 migrations apply DB --remote` (0009 adds `api_key` and
   `export_run`; additive).
2. Deploy with the new `RL_API` rate-limit binding (namespace 1003, 60 requests / 60 s per key) in `wrangler.jsonc`.
3. Turn the flag on. The first nightly run afterwards queues that month's export (see below); to publish right away,
   send `{"type":"open_data_export","period":"YYYY-MM"}` to `q-recompute`.

## Load limits

- API: 60 requests a minute per key (binding, no D1 write per request). Key lookups are cached per isolate for 60 s;
  `last_used_at` is written at most hourly. `bbox` ≤ 2° each way, radius ≤ 50 km, ≤ 500 results.
- Export: once a month. The nightly cron does one indexed read; the export runs on the `q-recompute` consumer, reading
  places in keyset pages of 1,000 (one place query + one fact query per page) and streaming both files to R2 as
  multipart uploads in 5 MiB parts, so memory stays flat. A failed run is retried by the queue; a finished month is
  never re-run. Old months stay in R2 (a few MB each); the page lists the last 12.
- Localized pages cost the same as English ones: catalogs are server-side. With every phase on, the mosque page loads
  192 KB of JS (gz) in English and Arabic; links from it to the map routes don't prefetch, so the map stays lazy.

## Rollback

Flag `phase8.global` off: prefixed URLs stop resolving (English pages are untouched), and the API, docs and download
routes 404. Revoke all keys with `UPDATE api_key SET revoked_at = unixepoch() * 1000 WHERE revoked_at IS NULL` if
needed. Migration 0009 is additive; export files can be deleted from R2 under `open-data/`.
