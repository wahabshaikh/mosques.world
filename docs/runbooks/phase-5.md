# Phase 5 runbook — At the mosque (PWA + quick verify)

## What is live

- **PWA**: `/manifest.webmanifest` (standalone, 192/512 + maskable icons from `scripts/build-icons.mjs`, shortcuts
  to "I'm here" and Saved) and `/sw.js`, a small hand-written service worker:
  - hashed build assets (`/_next/static/`, `/assets/`, `/icons/`) are cache-first;
  - navigations to `/`, `/saved`, `/m/*` and `/@*` are network-first with a cached copy (≤ 40 pages) and an inline
    offline page otherwise;
  - `/api/v1/saved/offline` (7 days of adhan + iqamah per saved place) is network-first with a cached copy;
  - auth, mutations, `/api/*` (other than the saved feed) and test routes are never cached;
  - sign-out posts `clear-user-caches`, which drops cached pages and data.
  The install prompt appears from the second visit (per browser session) when the browser offers one.
- **"I'm here"**: a sticky action bar on phones (next jamā'ah + countdown · I'm here) and `/verify`. The device
  position is sent once to `/api/v1/verify/nearby`; one place within 150 m starts at once, several show a picker.
- **Quick verify**: `/api/v1/verify/start` re-checks the distance, checks the person in for the current prayer
  (geo-verified, idempotent per day) and returns up to 3 questions: open disputes → stale → unverified iqamah →
  missing amenities → timetable photo. Each answer (`/api/v1/verify/answer`) re-checks the distance and is stored as
  a vote or value with `geo_verified = 1` (weight × 1.5). The success screen offers push notifications; the
  subscription is stored in `push_subscription` (sending arrives in Phase 6).
- **Mobile polish**: Explore's map mode has a bottom sheet of places; answers buzz on devices with haptics.

## Flag

`phase5.mobile` in `FLAGS`. Phase 5 is only on where Phases 2–4 are on. Unset: on for localhost / `*.workers.dev`,
off on mosques.world. The service worker registers only while the flag is on.

## Before turning it on in production

1. Time Travel bookmark, then `pnpm exec wrangler d1 migrations apply DB --remote` (0007 adds `push_subscription`).
2. `VAPID_PUBLIC_KEY` (Web Push application server key) is read at request time and stored as a Worker secret, set
   together with `VAPID_PRIVATE_KEY` (used from Phase 6); see the Phase 6 runbook, step 2. Without it the
   "tell me when my saved mosques change" prompt is hidden.

## Load limits

- Verify endpoints: RL_WRITE burst limit; answers also count toward the daily vote/value limits by trust level.
- `placesWithin` scans a ~0.35 km bounding box on the `(lat, lng)` index (≤ 50 rows).
- The offline feed covers at most 50 saved places × 7 days and is computed on request (no storage).

## Testing notes

`e2e/phase-5` targets WebKit mobile (`mobile-webkit` project, iPhone 13). Where WebKit is not installed, run it with
iPhone 13 emulation on Chromium. The installability check uses Chromium's `Page.getInstallabilityErrors` (the same
checks Lighthouse used) and is skipped on WebKit.

## Rollback

Flag `phase5.mobile` off (within 60 s): the worker stops registering; existing workers keep serving network-first,
so nothing goes stale. To remove it completely, ship a `sw.js` that calls `self.registration.unregister()`.
Migration 0007 is additive.
