# Launch-readiness QA (October 2026)

A full pass over every screen and flow, signed out, signed in and as an admin, on desktop (1440×900) and
phone (iPhone 13 viewport), against the two launch goals:

1. **See nearby mosques**, anywhere in the world, without a paid places API.
2. **The community keeps adhan times, iqamah times and amenities right.**

## How it was tested

- A Playwright crawl of 47 routes × 3 roles × 2 viewports: HTTP status, console errors, failed requests,
  hydration (`data-app-ready`) and a full-page screenshot of each (`.artifacts/qa/crawl.ts`, local only).
- The full E2E suite (phases 1–8, 42 tests) as a baseline: **all passed** before any change, so
  existing flows (OTP sign-in, onboarding, iqamah add/confirm/dispute, moderation, amenities, photos,
  check-ins, saved, PWA/offline, stewards, timetables, i18n, public API) work locally.
- Read-only probes of production (`https://mosques.world`) through its public API and pages.
- Manual flows in a browser: area fill, "Where" search, adding a place, setting a mosque's adhan.

## Findings

Severity: **P0** blocks a launch goal, **P1** visibly broken or misleading, **P2** polish.

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | P0 | **Production is Phase 1 only.** Every phase flag (`phase2.contributions` … `phase8.global`) is off, so on mosques.world nobody can sign in, add or confirm a time, add amenities or a mosque. `/add` returns 404. | Needs a human: turn the flags on (see Rollout). |
| 2 | P0 | **Almost no mosques outside London and Istanbul.** The directory was seeded city by city. Production returned 0 mosques for New York, Los Angeles and Karachi and 4 for Mumbai; anyone else lands on "0 mosques nearby". | Fixed: on-demand area fill from OpenStreetMap (free). |
| 3 | P0 | **Picking a city in "Where" didn't move the map in production.** Google autocomplete suggestions have no coordinates; the client wrote `lat=null` into the URL, which the server ignored, so you stayed on your IP location under the new label. | Fixed: Photon suggestions carry coordinates; Google ones are resolved through the details route first. |
| 4 | P0 | **Adhan times couldn't be updated by the community.** Only iqamah, Jumu'ah and amenities were editable. The `asr_madhab` fact existed but nothing applied it. | Fixed: Adhan tab (calculation method, Asr school, per-prayer mosque adhan). |
| 5 | P1 | `/search?where=Karachi` (a shared link without coordinates) showed the visitor's own area labelled "Karachi". | Fixed: geocoded server-side. |
| 6 | P1 | Nearest mosques could be missing in dense cities: the map query took any 500 rows in the box, then sorted. A Karachi cell alone has ~2,400 mosques. | Fixed: ordered by distance in SQL. |
| 7 | P1 | "Where" autocomplete hit a 429/Turnstile after a few searches: every keystroke counted against 20 searches per IP per hour. | Fixed: 250 ms debounce; 200/hour on the free geocoder. |
| 8 | P1 | The "Where" box is prefilled ("Near you"), and typing appended to it ("KarachiNear you"). | Fixed: selects all on focus. |
| 9 | P1 | "Use your location" did nothing when permission was denied or unavailable. | Fixed: explains what happened and suggests searching. |
| 10 | P1 | Mosque page mini map was an OpenStreetMap iframe: cramped, duplicate attribution, and heavy use of OSM's own tile servers is against their usage policy. | Fixed: lazy MapLibre/OpenFreeMap map (same as the rest of the site). |
| 11 | P1 | Update dialog: with nothing set the button read "Confirm times are correct" (disabled), and the helper text explaining why was hidden on phones. | Fixed: "Submit" when there is nothing to confirm; helper shown on phones. |
| 12 | P1 | Add-a-place search depended on Google; without a key it offered nothing, and it never suggested the mosque was already listed. | Fixed: listed mosques first ("Already on mosques.world" opens them), then Photon. |
| 13 | P2 | Empty area copy said the directory "grows city by city" and pointed to London. | Fixed: invites adding the place; shows a loading state while the area fills. |
| 14 | P2 | Mosques with names only in Arabic/Urdu script got slugs like `karachi-2`, and Urdu localities in an English UI. | Fixed: `mosque-<city>` slugs and the city name as locality. |
| 15 | P2 | Nothing nudged people to share after contributing (the viral loop). | Fixed: "Share this mosque" on the thank-you screen. |
| 16 | P2 | Locked badges read like achievements ("Reached the Trusted verifier level"); a day-old account shows "1 Month on mosques.world". | Not changed: descriptions are criteria by design (seeded in migration 0006); tenure rounding is tested behaviour. |
| 17 | P2 | 404 pages for an unknown mosque or profile never mark the app ready (hydration marker is in route-group layouts). | Not changed: cosmetic for E2E only. |

Environment notes, not app bugs: map tiles and Overpass fail inside the QA sandbox because of its network
proxy; they load in production.

## What changed for the launch goals

### Nearby mosques, anywhere, for free

- The first time anyone looks at an area, the browser calls `POST /api/v1/places/fill`. The server
  pulls that area's mosques from OpenStreetMap through the Overpass API, one geohash-4 cell
  (≈39×20 km) per query, nearest cells first and two per request, then inserts them into D1. The page shows
  "Finding mosques…" and refreshes as cells land; everyone after that is served from D1.
- `osm_cell` records each cell (also a two-minute lock, so concurrent visitors don't double-fetch).
  Failures retry after 30 minutes; the weekly cron re-syncs cells older than 30 days.
- Community edits always win: existing rows are never updated, excluded OSM elements stay excluded.
- Search ("Where", `?where=` links, add a place) uses Photon, a free OpenStreetMap geocoder, cached in
  KV for 30 days. No Google Places calls while `places.osm` is on.
- Measured: central Karachi (one cell) is 2,367 mosques in a 2.6 s Overpass query.

### Community-maintained adhan, iqamah and amenities

- New **Adhan** tab in Update timings: calculation method (as printed on the timetable), Asr school,
  and "Set mosque's adhan" per prayer. A time is stored as minutes from the calculated adhan so it
  follows the seasons, or as a fixed time with "Same time every day".
- They go through the same trust engine as iqamah times (confirmations, holds for new accounts,
  history, moderation). Once current, they are copied to the place row, so the mosque page, cards,
  timetables, ICS feeds, offline times and the public API all show the mosque's own adhan.
- The mosque page says when the adhan follows the community's timetable and links "Mosque's adhan
  different?" straight to the tab.

## Learnings

- **D1 is not SQLite.** D1 rejects compound SELECTs with more than a handful of terms; `node:sqlite`
  (our unit-test stand-in) allows 500. A `UNION ALL` per map cell passed every unit test and silently
  disabled the fill for most real views. Only the E2E run against Miniflare caught it. Keep one E2E per
  new query shape, and prefer grouped queries over per-item unions.
- **Flags hide launches as well as risk.** Every phase was built, tested and deployed, yet production
  still behaves like Phase 1. A launch checklist needs "flags on" as an explicit step.
- **External services don't belong in E2E.** Overpass and Photon are stubbed in-process for tests
  (header or cookie, non-production only), so CI never depends on them, while local dev and Previews
  use the real services.
- **Seeded data hides empty states.** Local data is London and Istanbul, so "0 mosques nearby" (the
  first thing most of the world would see) never came up in development. Test from a random point.

## Rollout (human steps)

1. Merge: migration `0011_launch.sql` (new `osm_cell` table, nullable `place.adhan_adjust_json`) is
   additive and applies automatically.
2. Every phase is live (feature flags were removed in October 2026 after all were on). Phase 2 needs `BETTER_AUTH_SECRET` (required in
   production) and the Email Service sender; Turnstile, VAPID (push) and Google sign-in are optional
   (`docs/deployment.md`).
3. Watch Workers Logs for `Area fill failed` and the `osm_cell` status counts in the first days.
