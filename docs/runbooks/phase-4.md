# Phase 4 runbook — Profiles & "I prayed here"

## What is live

- **Check-ins**: "I prayed here" on the mosque page's next-prayer card opens a sheet (prayer defaults to the current or
  most recent window, Jumu'ah on Fridays; date defaults to the place's today; "I prayed here before" takes a month).
  Optional one-shot geolocation: the server computes the distance and stores `geo_verified` (≤ 150 m) and `distance_m`,
  never coordinates. One check-in per (person, place, date, prayer). Signed-out taps return after sign-in
  (`?intent=checkin`).
- **Profiles** at `/@username` (middleware rewrites to `/u/[username]`; `/u/name` 308-redirects; renamed usernames
  308 to the new one): server-rendered night map (Natural Earth 110m, gold pins by visit count, All time / year /
  Jumu'ah filters), stat tiles, profile card, confirmed info, copy link, About, Recently prayed in, Badges,
  Contributions (filter chips with counts). `/@username/map` is a full-screen MapLibre globe (`/map/night.json`, no
  tiles); `?embed=1` drops the chrome and allows framing (`frame-ancestors *`, no `X-Frame-Options`).
- **Stats & badges**: `user_place_stat` and `user_stat` are rebuilt per person on each check-in (inline, so the reply can
  celebrate a new country/badge) and on `q-recompute` `{kind:"user"}` messages after votes, place adds and approved
  photos. Badge rules live in the `badge` table (`rule_json`).
- **Sharing**: `/og/u/[username]` 1200×630 PNG (night map + pins when check-ins are public; counts unless private),
  Web Share with copy-link fallback.
- **Saved places**: Save / Share beside the mosque title; `/saved` lists saved places with the next jamā'ah and any
  "change reported" warning (max 200 per person).
- **Privacy**: `/settings/privacy` — profile public/private, check-ins public / countries only / private, and deleting
  individual check-ins. Tightening visibility removes that person's "prayed here" entries from mosque feeds.

## Flag

`phase4.profiles` in `FLAGS`. Phase 4 is only on where Phases 2 and 3 are on. Unset: on for localhost /
`*.workers.dev`, off on mosques.world.

## Before turning it on in production

1. Time Travel bookmark, then `pnpm exec wrangler d1 migrations apply DB --remote` (0006 is additive: new tables, the
   `user (created_at)` index and the badge rows).
2. Nothing else to configure: the profile map needs no tile provider (`/map/land-110m.json` is static, 27 KB gz).
3. To regenerate land assets: download `world-atlas@2/land-110m.json` and run `pnpm tsx scripts/build-land.ts <file>`.

## Load limits

- Check-ins: RL_WRITE burst limit plus 50 per rolling 24 h per person; each one costs ~8 small indexed queries
  (insert + per-person stats rebuild).
- Profile pins are capped at 2,000 places per query; contributions page in steps of 20 (max 200); the privacy list in
  steps of 50.
- The founding-badge check is a bounded index scan (`LIMIT 1 OFFSET 999`) and only runs until the badge is earned.
- Share cards are cached for an hour (`s-maxage=3600`).

## Rollback

Flag `phase4.profiles` off (within 60 s). Previous Worker version if needed. Migration 0006 is additive; earlier code
ignores the new tables.
