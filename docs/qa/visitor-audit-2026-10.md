# Visitor audit and redesign (October 2026)

A walk through every screen and flow as a first-time visitor, then signed in as a contributor, a moderator
and on a phone, asking one question: **does the app do what I came for?** The redesign is on the design
canvas ([mosques.world redesign](https://claude.ai/artifact/CWYh6SrKjSWVedqKPF1h3u)); this PR ships the parts
that were bugs or that most changed the answer to that question.

## Why people arrive

| Who | What they came to do | Did the app do it? (before this PR) |
|---|---|---|
| **Traveller / new in town** (most visitors) | "It's nearly Asr. Where's the nearest mosque, when does the jamā'ah start, and is there a women's section?" | **Production: no** for most of the world. New York, LA and Karachi return 0 places because the `places.osm` flag is off. **Locally/London: partly**: the list is there, but every card said "Asr 16:35 adhan" on a blank tinted tile, so the one thing a traveller needs (the iqamah) was neither there nor clearly missing. On a phone the prayer table was the fifth screen down. |
| **Local regular** | Check the iqamah at their 2–3 mosques; hear when it changes | Yes, once someone has added times: Saved shows the week, offline, with a calendar feed. |
| **Contributor** | Add or confirm the board's times in under 30 s | Mostly. The update dialog works, but the thank-you screen vanished after a second and reopened the form as "Confirm times are correct / Applies from tomorrow", inviting a second submission. |
| **Steward / moderator** | Keep a mosque right; clear the queue | Yes. The admin pages are plain but clear; empty states say what to do. |

The product promise ("prayer times you can trust") only lands once a place has iqamah times. Before that, the
app must still answer "where and when" honestly and make adding the times the obvious next step. That is the
lens for everything below.

## How it was tested

- Dev server with the local seed (London, Istanbul, Toronto, Jakarta, Mumbai, Oslo, Makkah), a Playwright walker
  over 40+ routes signed out, signed in (contributor, not-yet-onboarded, admin), at 1440×900 and iPhone 13, with
  screenshots of every page and the console/network errors.
- Scripted flows: save → update timings (5 iqamahs) → submit → thank-you → Done → "I prayed here" → second account
  confirms → profile, saved, account menu, explore.
- Read-only probes of production (`/search?where=New York`, `/api/v1/places?bbox=…`).
- After the changes: `pnpm verify`, `pnpm build`, and every E2E suite on Chromium (43 tests).

## Findings

Severity: **P0** stops a visitor getting what they came for, **P1** visibly broken or misleading, **P2** polish.

### Finding a mosque (explore, home, city pages)

| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | P0 | **Production shows 0 mosques outside the seeded cities.** `places.osm` is off, so the on-demand OpenStreetMap fill (built in #32) never runs: New York renders "0 mosques & prayer spaces nearby". | Fixed: `places.osm` turned on in production KV (5 Oct 2026). |
| 2 | P1 | An empty area was a dead end: "0 mosques nearby" and a link to add one, nothing else. | Fixed: **"Prayer times here today"** (calculated, labelled) shows above the empty/finding state, so the visitor still leaves knowing when to pray. |
| 3 | P1 | **Two clock styles in one list**: iqamah "5:00 PM" next to adhan "16:35" on cards, pins, the subline, the prayer table and the countdown. | Fixed: one clock style everywhere (`l.adhan()` follows the locale like `l.time()`). |
| 4 | P1 | The card grid was 60 identical blank tiles with an "Adhan" chip; at 3 columns the London page was 7,000 px tall, and 40 cards in a row read "Maghrib 6:32 PM adhan". | Fixed: a single-column list. Each row has a Commons photo or a two-letter monogram, locality · distance · amenity, and the next time with one trust word (*iqamah · verified / unverified / change reported*, or *adhan · no iqamah yet* in muted type so community times stand out). |
| 5 | P2 | The "Nearby" chip looks like a filter but is the reset state; "Prayer rooms" sits among amenities. | Fixed: "Nearby" chip removed (it was the reset state); "Prayer rooms" is a toggle; "Near me" sits in the search bar. |
| 6 | P2 | Location already granted? The home still asks "Use your location…" every visit. | Fixed: a granted permission is used at once; a denied one hides the prompt. |
| 7 | P2 | City pages are a bare list with a vague "Times" link: no next prayer, no map. | Fixed: city pages use the same rows (next time, trust word, photo) and say how many places have community iqamah times. |
| 8 | P2 | On a phone the floating "Map" button covers the last row and the footer. | Fixed: the button is centred and the list leaves room for it. |

### The mosque page

| # | Sev | Finding | Status |
|---|---|---|---|
| 9 | P1 | **Times were below the fold.** A full-width placeholder illustration and a large "Iqamah times not yet added" box came first; on a phone the table started on the fifth screen. | Fixed: **Today's prayer times** comes first; the "not yet added" prompt is one compact row with a single *Add iqamah times* button above the table; photos move below. |
| 10 | P1 | The sticky next-prayer card had no background, so the activity feed scrolled *through* it. | Fixed (`bg-card`, `z-10`). |
| 11 | P1 | "Unverified" next to "**100% agreement**" when one person has added times. | Fixed: agreement is a dash until two people have voted. |
| 12 | P2 | Ten-plus calls to action on an empty page (five "Add" links, Add iqamah, Update timings, email, Add facilities, Suggest an edit, Add Eid…). | Fixed: one "Add iqamah times" button; per-row "Add" links and the empty "Community check" column only appear once something is set. |
| 13 | P2 | Copy: "hanafi asr" in lower case; the timetable footnote printed `MoonsightingCommittee`; the website as a raw `http://www…/` URL; the next-prayer time wrapped mid-time in the sidebar. | Fixed. |
| 14 | P2 | No photo, no description: every page looked the same until someone uploaded a photo. | Fixed with free data: a credited **Wikimedia Commons** photo and a **Wikipedia** summary, founding year and website from **Wikidata** (`places.enrich`). |
| 15 | P2 | Today's date shows as `2026-10-05`. | Fixed: "Monday 5 October 2026" (`l.date` in every language). |
| 16 | P2 | "Apple Maps" is a second link under *Get directions*; the spec asks for one button that picks the app by device. | Fixed: one *Get directions* button, Apple Maps on Apple devices, Google Maps elsewhere. |
| 17 | P2 | Non-English pages computed dispute labels from the *localised* adhan string (e.g. Arabic digits), so an "N min after adhan" challenger could show the wrong time. | Fixed: arithmetic reads the raw day; only display rows are localised. |

### Contributing (update dialog, check-ins, verify)

| # | Sev | Finding | Status |
|---|---|---|---|
| 18 | P1 | **The thank-you screen disappeared** about a second after submitting (`router.refresh()` re-rendered the intercepted route) and the form came back as "Confirm times are correct", applying from *tomorrow*. People could submit twice and never saw "Share this mosque". | Fixed: the dialog refreshes the page underneath when it closes. Verified: results stay up; after *Done* the page shows the new times. |
| 19 | P2 | "Applies from" uses the browser's date format (`10/05/2026`) while the rest of the page is en-GB style. | Fixed: *Today* / *Tomorrow* chips next to the date field. |
| 20 | P2 | Every row carries "Use minutes after adhan": jargon, repeated five times. | Fixed: shown on Maghrib (where it is usual) and on rows already using it; one link reveals it for the rest. |
| 21 | P2 | The design's one-tap "Are these still right? → Yes, all 5" is still a full form on a phone. | Partly: with all five times set the tab opens with "Are these still right?" and one *Confirm times are correct* button. The at-the-mosque `/verify` flow already asks one question at a time. |
| 22 | P2 | `/verify` on desktop: a phone sheet in the middle of an empty map. | Fixed: a centred card on desktop. |

### Profile, saved, account

| # | Sev | Finding | Status |
|---|---|---|---|
| 23 | P2 | "0 Verifications" right after adding five live times; the list says "Suggested Isha" with amber icons although they are live. | Fixed: the card counts all contributions; the list says "Reported Isha" like the activity feed. |
| 24 | P2 | Long usernames break mid-word in the profile card. | Fixed: smaller display size. |
| 25 | P2 | "Steward" is in everyone's account menu. | Fixed: shown to stewards (approved or requested) and moderators. |
| 26 | P2 | Saved shows blank tint squares as thumbnails. | Fixed: same photo/monogram thumbnail as the list. |
| 27 | P2 | About page said iqamah times come "in a later release". | Fixed. |

### Data quality

| # | Sev | Finding | Status |
|---|---|---|---|
| 28 | P1 | Duplicates sit side by side: "East London Mosque" and "The East London Mosque". | Fixed going forward: two places that match one Wikidata item are queued in `place_duplicate_candidate` for the moderators' merge page (never merged automatically). Found this one locally. |
| 29 | P2 | Localities are often just "London"; the London city page includes "Surrey Muslim Centre (Runnymede)". | Partly: the fill now takes the most local OSM address tag (`addr:suburb` → `neighbourhood` → `quarter` → `district` → `city`). Photon reverse geocoding for untagged places is still open. |

## What changed in this PR

- **Explore**: list rows with photo/monogram and a trust word; quiet adhan-only times; area prayer times when empty.
- **Mosque page**: times first; compact empty state; trust box fixes; sticky card fix; photos after times; Commons
  photo with credit; "About this place" with Wikipedia summary, founding year and sources.
- **One clock style** for adhan and iqamah in every locale.
- **Update dialog**: the thank-you screen stays until *Done*.
- **Copy**: About page, madhab/method labels, website display, attribution page credits Wikimedia.
- **Open-data enrichment** (`lib/enrich/wikidata.ts`, migration `0012_enrichment.sql`, `places.enrich` flag):
  nightly cron plus `POST /api/v1/admin/enrich` for moderators.

## Data: what we learned and how to improve it

All sources below are free and need no key.

**Measured locally** (one run over the seed, 140 places): 27 matched a Wikidata item, 23 got a Commons photo and
23 a Wikipedia summary. Istanbul matched 15/15 (its seed is the famous mosques); London 11/88 (the notable ones);
the small neighbourhood mosques have no Wikidata item. One duplicate pair was found. So Wikimedia data makes the
landmark pages rich; it does not fill neighbourhood mosques. That still has to come from people.

**How the enrichment works**: one SPARQL `wikibase:box` query per geohash-4 cell (the same cells as the OSM fill)
for instances of *mosque*; places are matched by name similarity (filler words like "masjid", "centre" ignored)
and distance (≤60 m on distance alone; ≤400 m with half the name; anywhere within 1.5 km with nearly the same name,
because Wikidata coordinates are often rounded). Commons photos are kept only under PD/CC0/CC BY/CC BY-SA and always
credited. Website is filled only when empty. Failures retry after a day; matches refresh quarterly.

**Done in this PR, from what OSM actually holds.** [taginfo](https://taginfo.openstreetmap.org/tags/religion=muslim)
(free) shows which tags mappers use with `religion=muslim`: `wikidata` on 5,151 mosques, `name:ar` on 17,582,
`addr:district`/`addr:neighbourhood` on thousands; women's-section tags are effectively unused, so seeding amenities
from OSM would add almost nothing. So the fill now stores the mappers' `wikidata` link (an exact enrichment match),
an Arabic-script name (`name:ar`/`name:ur`/`name:fa`) and the most local address tag; flags new rows that look like an
existing place (within 80 m, nearly the same name) into the duplicate queue; and the empty-area times card uses the
visitor's country's usual method (`calc_default`) when the view is where they are.

**Next, in order of value**

1. **Photon reverse geocoding** (free) for the neighbourhood of places with no address tags.
2. **Ask, don't import, amenities**: OSM has almost no women's-section data, so the quick-verify flow should ask
   "Is there a women's section?" the first time someone checks in, not wait for the update dialog.
3. **Give back**: the monthly ODbL export already exists; add a "fix this on OpenStreetMap" link (OSM's edit URL)
   on pages where the address or location is wrong, so corrections flow upstream.
4. **Not free / not used**: Mapillary street-level photos need a token and have per-image licences; Google Places
   stays as the paid fallback only while `places.osm` is off.

## Learnings

- **Audit as a visitor, from a random point.** The seed hides the most common first impression. Production New
  York is 0 places; a dev box in London shows 60. Always look at the empty state first.
- **A component can be "correct" and still unreadable.** Every card was accurate, but sixty accurate cards that
  all say "Maghrib 6:32 PM" tell the visitor nothing. Design the list for the difference between places.
- **One clock per screen.** The 24h adhan was a deliberate rule ("English keeps its 24h adhan") that made every
  list mix two formats. Rules about formatting belong in one function, decided once.
- **`router.refresh()` inside an intercepted modal remounts it.** Anything that must survive a refresh (a result,
  a thank-you) either lives outside the refreshed tree or the refresh waits until the modal closes. E2E missed it
  because the test clicks *Done* within the second the screen is up.
- **Keep display strings out of arithmetic.** Localising the `day.rows[].adhan` strings in place meant later code
  did `toMinutes()` on "٤:٣٥". Keep raw values for computation and map to display at the edge.
- **Wikimedia rate limits shared egress.** From this sandbox's proxy, Commons answered 429 to plain curl, while the
  Worker's own fetch succeeded. The code treats photos and summaries as extras: a 429 there still stores the match.
- **Open data is rich for landmarks and thin for neighbourhoods.** Plan the product for the neighbourhood case.

## Rollout (human steps)

1. Merge: migration `0012_enrichment.sql` adds two nullable `place` columns, an index and the `enrich_cell` table.
   Additive; changes no existing data.
2. `places.osm` and `places.enrich` are on in production KV (set 5 Oct 2026). The nightly cron enriches 3 areas a
   night; a moderator can run an area now with `POST /api/v1/admin/enrich {"lat":…,"lng":…}`.
3. Watch Workers Logs for `Enrichment failed` and `Possible duplicate places`, and the merge page for new pairs.

## Not verified

- Wikimedia Commons and Wikipedia from production Workers (they worked from the local Worker; plain curl from this
  sandbox got 429). The code stores the Wikidata match even when they fail.
- WebKit E2E suites (run in CI); the phone checks here used Chromium with the iPhone 13 viewport.
- The first production area fill after turning on `places.osm`: it runs on the first real visit to an area.
