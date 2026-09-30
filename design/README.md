# mosques.world — MVP design

Live canvas (pan/zoom, clickable prototypes): https://claude.ai/artifact/C5AduujXjZbCEDLdvjVgmr

This folder is a snapshot of the canvas source so the design is versioned with the spec.
Each `*.dc.html` file is one artboard; `canvas.json` is the board layout. The files are
authored for the canvas runtime (they load `./support.js`), so open them via the canvas
link above rather than directly in a browser.

| Artboard | Size | What it shows | Spec phase |
|---|---|---|---|
| `Main.dc.html` — Explore · London | 1440×1024 | Split search pill, amenity category bar, mosque card grid, map with next-iqamah pins | Phase 1 |
| `Mosque.dc.html` — Mosque page | 1440×2200 | Photo grid, "Community verified" trust box, prayer-times table with per-row verification, inline dispute banner, Jumu'ah, amenities, sticky next-prayer card, activity feed | Phases 1–3 |
| `Contribute.dc.html` — Update timings | 1440×1024 | Modal: ±5-min iqamah steppers, "applies from", source chips, timetable-photo upload, amenities Yes/No/Not sure | Phases 2–3 |
| `Profile.dc.html` — `/@wahabshaikh` | 1440×2080 | Night world map with gold pins, stats, profile card, recently prayed in, badges, contributions | Phase 4 |
| `MobileMosque.dc.html` | 390×844 | Mobile mosque page with sticky "I'm here" bar | Phases 1–5 |
| `MobileVerify.dc.html` | 390×844 | At-the-mosque quick-verify flow (3 one-tap questions) | Phase 5 |
| `MobileProfile.dc.html` | 390×844 | Mobile profile with map hero and tab bar | Phase 4 |

All timings, counts and profile stats in the mockups are sample data. Photos are drawn
placeholders. Airbnb patterns were referenced via Mobbin (search pill, list + map split,
filter modal, trust badge, profile card); visuals are our own.

The design system these mockups use is specified in [`docs/spec/03-design-system.md`](../docs/spec/03-design-system.md).

## Social & community (phases 9–12, proposed)

[`docs/design/social-community.html`](../docs/design/social-community.html) is a standalone design board for
pray-together gatherings, trips, companions and hosts, grouped into buildable phases 9–12
([live board](https://claude.ai/artifact/U8hsezQDQ2bityRCN3z7CP)). It is a proposal: the spec is updated
phase by phase as each one is built.
