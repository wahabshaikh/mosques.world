# Phase 7 runbook — Timetables & seasons

> **Feature flags were removed in October 2026** (every phase was at 100%). This phase is always live; the flag
> steps below are history. Roll back with the previous Worker version.


## What is live

- **Monthly timetable** `/m/:slug/timetable?month=YYYY-MM`: every day's calculated adhan and its iqamah. A date's
  iqamah comes from the monthly timetable when one was imported (`data-source="timetable"`), otherwise from the
  mosque's usual times. Linked from the mosque page ("Monthly timetable").
- **Timetable values are facts**: `timetable.<prayer>` with the local date as qualifier, so votes, disputes, holds,
  stewards and notifications all apply. The mosque page and the update dialog load only today's; the place summary
  carries the next two weeks (`tt`), which cards, Saved, offline times and calendar feeds use. The nightly job slides
  that window for up to 200 places.
- **Photo → timetable** `/m/:slug/timetable/import`: upload (evidence photo, EXIF stripped) → Workers AI
  (`@cf/meta/llama-3.2-11b-vision-instruct`) reads iqamah times → editable review grid (next to the photo) →
  `POST /api/v1/places/:id/timetable`. New (date, prayer) values are written in batches of 90 statements with the
  engine's own verdict (no per-value recompute); values that already exist get the importer's vote and are recomputed
  on `q-recompute` (inline on preview/localhost). Stewards' imports replace differing values outright (audit-logged).
  `timetable` / `timetable_row` keep each import's provenance. If the model is unavailable the grid opens empty for
  typing.
- **Special prayers** `/m/:slug/special` (contributors level 1+ and stewards): Eid al-Fitr / al-Adha with up to 6
  jamā'ahs (time, place, khutbah language) and nightly Taraweeh / Tahajjud (range, start, rakʿahs). "Eid & special
  prayers" on the mosque page; `/eid` lists upcoming Eid jamā'ahs within 30 km, and the header links to it in season
  (last ten nights of Ramadan to 3 Shawwal, 1–13 Dhul Hijjah).
- **Calendar feeds**: `/m/:slug/calendar.ics` (30 rolling days of iqamah events, the place's own VTIMEZONE; cached
  1 h) and `/calendar/:token/saved.ics` (a person's saved mosques, 14 days; the token is HMAC-signed with
  `BETTER_AUTH_SECRET`, so rotating the secret revokes every link).

## Flag

`phase7.timetables` in `FLAGS`, on only where Phases 2–6 are on.

## Before turning it on in production

1. Time Travel bookmark, then `pnpm exec wrangler d1 migrations apply DB --remote` (0009 is additive).
2. Workers AI: accept the Llama 3.2 Vision licence once for the account (send one request with `prompt: "agree"` to
   `@cf/meta/llama-3.2-11b-vision-instruct`). Each import makes one AI call on the 1600 px variant.

## Load limits

- Imports: 5 per person per day, ≤ 31 rows × 5 prayers; ≤ 90 statements per D1 batch; existing values recomputed in
  chunks of 25 on the queue.
- Special prayers: 20 per person per day; a new entry for the same kind and date replaces the previous one.
- ICS: computed on request (30 × 5 events max per mosque, 20 places × 14 days per personal feed), cached 1 h.

## Rollback

Flag `phase7.timetables` off. Timetable facts stay in D1 but are ignored by the summary only after the next refresh;
to hide them immediately, run the nightly job or `refreshPlaceSummary` for affected places. Migration 0009 is additive.
