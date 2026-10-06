# Phase 3 runbook — Amenities, places & photos

> **Feature flags were removed in October 2026** (every phase was at 100%). This phase is always live; the flag
> steps below are history. Roll back with the previous Worker version.


## What is live

- **Amenities** (`amenity.*` facts, same trust engine): an Amenities tab in Update timings (Yes / No / Not sure),
  "What this place offers" on the mosque page, `place.amenity_bits` kept current on every vote, and explore
  filters (category chips + Filters dialog with a live count; `?needs=women_section,wudhu,…`).
- **Add a place** at `/add`: Google Places Autocomplete + Details (Essentials field mask), duplicate check
  (≤ 150 m, trigram name similarity), draggable pin, kind, access notes, optional times and amenities. Level-0
  members' places are `pending` (visible to them and L2+/moderators) until an L1+ member confirms or 24 h pass with
  no open report. Live Google phone / website / hours are shown with attribution, cached 24 h in KV.
- **Photos**: `/api/v1/uploads` → R2 `originals/` → WebP variants 1600/800/400 via the Images binding (all
  metadata, including GPS, dropped) + blurhash + Workers AI (ResNet-50) labels → approved for L1+ unless flagged,
  otherwise pending in `/admin/queue`. Originals are deleted. Served from `/media/:id/:width.webp`. Timetable photos
  attached in Update timings add ×1.5 to those votes once approved. Profile photos use the same pipeline.
- **Place quality**: report reasons (timing, closed, duplicate, wrong location, inappropriate photo),
  `/admin/places/merge` (merge, keep separate, close/restore), `/m/:old-slug` 308-redirects after merges.
- **Crons**: nightly also activates due pending places and refreshes Google coordinates older than 30 days (≤ 50
  per night). Weekly (`30 3 * * 1`) OSM diff-sync adds new OSM places for the 2 least recently synced cities; it
  never updates existing rows.

## Flag

`phase3.places` in `FLAGS` (same values as `phase2.contributions`). Phase 3 is only on where Phase 2 is on.
Unset: on for localhost / `*.workers.dev`, off on mosques.world.

## Before turning it on in production

1. Time Travel bookmark, then `pnpm exec wrangler d1 migrations apply DB --remote` (0005 is additive; it creates the
   `system` account and imports OSM wheelchair tags as initial step-free values).
2. Secrets / vars: `GOOGLE_MAPS_API_KEY` (Places API New; restrict to Places), optional `GOOGLE_PLACES_DAILY_CAP`
   (default 2,000 billable calls/day; each member is capped at 60). Without a key, `/add` falls back to placing the
   pin on the map.
3. Bindings already declared: `MEDIA` (R2), `IMAGES`, `AI`, `Q_MEDIA`. Workers AI is billed per inference; classification
   runs once per upload on the 400 px variant.
4. Local dev does not use remote bindings (Workers AI has no simulator). Set `CLOUDFLARE_REMOTE_BINDINGS=1` with a
   Cloudflare login to use it locally. Local Images cannot emit raw RGBA, so blurhash falls back to decoding a PNG.

## Load limits

- Uploads: ≤ 15 MB, JPEG/PNG/WebP/HEIC; 10/day (L0), 40 (L1), 100 (L2+); Turnstile for L0 when configured.
- New places: 3/day (L0), 20 (L1), 100 (L2+).
- Photo processing runs on `q-media` in production (3 Images calls + 1 AI call per photo). Preview and localhost
  process inline because preview shares queue names with production.

## Rollback

Flag `phase3.places` off (within 60 s). Previous Worker version if needed. Migration 0005 is additive; Phase 2 code
ignores the new columns and tables.
