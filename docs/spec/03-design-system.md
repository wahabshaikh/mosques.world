# 3. Design system

Source of truth for visuals: the [design canvas](https://claude.ai/artifact/C5AduujXjZbCEDLdvjVgmr)
(snapshot in [`/design`](../../design)). This document turns it into tokens and components for
**shadcn/ui + Tailwind CSS v4**.

**Character:** calm, warm and trustworthy, like Airbnb's clarity (white space, rounded
photography, pill search, one strong accent) with an emerald accent, amber for
"needs attention" and a night-green map as the signature moment.

## 3.1 Color tokens

All pairs below meet WCAG AA (4.5:1 for text, 3:1 for large text and UI).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FFFFFF` | `#121110` | Page |
| `--foreground` | `#1F1D1A` (ink) | `#F3F1EC` | Primary text |
| `--card` / `--popover` | `#FFFFFF` | `#1B1A18` | Cards, menus |
| `--muted` | `#F6F4EF` (sand) | `#24221F` | Table headers, subtle fills, badge tiles |
| `--muted-foreground` | `#5E5A53` | `#A9A399` | Secondary text (never lighter than this for text) |
| `--border` / `--input` | `#E8E4DC` / `#E0DBD2` | `#2E2B27` / `#38352F` | Hairlines, inputs |
| `--border-strong` | `#C9C3B8` | `#4A463F` | Steppers, segmented controls |
| `--primary` | `#0B6E4F` (emerald) | `#34B98A` | Primary buttons, links, verified state, logo |
| `--primary-foreground` | `#FFFFFF` | `#0B1F17` | Text on primary |
| `--primary-soft` | `#E6F1EB` | `#16322A` | Verified chip/bg, "next prayer" row (`#F2F8F4`) |
| `--secondary` | `#1F1D1A` | `#F3F1EC` | Black "commit" buttons (Submit, Confirm), selected pins |
| `--secondary-foreground` | `#FFFFFF` | `#121110` | |
| `--warning` | `#A4520A` (amber) | `#E8A55A` | "Change reported", "Needs check", disputed pins |
| `--warning-soft` | `#FCF1E1` | `#3A2A14` | Dispute banners |
| `--destructive` | `#B42318` | `#F97066` | Delete, reject |
| `--ring` | `#0B6E4F` | `#34B98A` | Focus rings (2px + 2px offset) |
| `--info` | `#2F6FDB` | `#6EA0F0` | "You are here" dot only |
| `--map-ocean-night` | `#0E2A22` | same | Profile map water |
| `--map-land-night` | `#1D4A3A` (stroke `#2A5E4B`) | same | Profile map land |
| `--map-pin-gold` | `#E9B949` | same | Profile map pins (user-tweakable accent later) |

**Place cover tints** (used for photo placeholders and avatar fallbacks, picked by `hash(place_id) % 6`):
sage `#D6E6DB/#B3CFBC`, sand `#EDE3D1/#D9C8A8`, lilac `#DEDAEA/#C3BDD8`, clay `#EFD9CC/#DDBBA6`,
sky `#D3E0EA/#B3C8D8`, olive `#E3E6D2/#C9CFAE` (background / silhouette).

**User avatar fallback colors:** `#0B6E4F`, `#A4520A`, `#4B4F9C`, `#1F1D1A` with white initials.

Implement as CSS variables in `app/globals.css` (Tailwind v4 `@theme inline` mapping,
shadcn convention); store hex as authored and let the build convert to `oklch`.

```css
:root {
  --radius: 0.75rem;
  --background: #ffffff; --foreground: #1f1d1a;
  --primary: #0b6e4f; --primary-foreground: #ffffff;
  --secondary: #1f1d1a; --secondary-foreground: #ffffff;
  --muted: #f6f4ef; --muted-foreground: #5e5a53;
  --border: #e8e4dc; --input: #e0dbd2; --ring: #0b6e4f;
  --warning: #a4520a; --warning-soft: #fcf1e1; --primary-soft: #e6f1eb;
  /* …card, popover, destructive, chart-1..5 */
}
.dark { /* dark column above */ }
@theme inline {
  --color-warning: var(--warning); --color-warning-soft: var(--warning-soft);
  --color-primary-soft: var(--primary-soft);
  /* shadcn defaults map the rest */
}
```

Dark mode: `next-themes` with `system` default. The profile map is always "night".

## 3.2 Typography

| Role | Font | Weight | Size / line-height |
|---|---|---|---|
| Display (profile hero) | Plus Jakarta Sans | 800 | 34/40, tracking −0.6px (mobile 26/32) |
| H1 page title | Plus Jakarta Sans | 700 | 30/36, −0.5px (mobile 24/30) |
| H2 section | Plus Jakarta Sans | 700 | 22/28 |
| H3 | Plus Jakarta Sans | 700 | 18/24 |
| Body | Plus Jakarta Sans | 400 | 16/24 |
| Body small | Plus Jakarta Sans | 400/600 | 14/20 |
| Caption / meta | Plus Jakarta Sans | 400/700 | 12–13/16 |
| Overline | Plus Jakarta Sans | 700–800 | 12/16, tracking +0.4px, uppercase ("NEXT PRAYER") |
| Times | Plus Jakarta Sans | 800 | tabular-nums (`font-variant-numeric: tabular-nums`) |
| Arabic script (names, Phase 8) | Amiri | 400/700 | +2px relative to Latin |

Load with `next/font`-compatible self-hosting (`@fontsource-variable/plus-jakarta-sans`) to avoid
a Google Fonts runtime dependency. Subset to Latin + Latin-ext at MVP.

## 3.3 Spacing, radius, elevation, layout

- **Spacing** on a 4px grid; common steps 4, 8, 12, 16, 20, 24, 32, 40, 48, 80.
- **Radius**: pills `9999px` (search, chips, pins, badges); cards and photos `14–16px`; the modal
  `20px`; bottom sheets `24px` top corners; inputs and buttons `10–12px`.
- **Elevation**: `shadow-sm` `0 1px 4px rgba(0,0,0,.12)` (chips on photos); `shadow-md`
  `0 3px 12px rgba(31,29,26,.08)` (search pill, map controls); `shadow-lg`
  `0 6px 20px rgba(31,29,26,.12)` (sticky prayer card, profile card); `shadow-xl`
  `0 16px 48px rgba(0,0,0,.3)` (modal).
- **Breakpoints**: `sm 640`, `md 768`, `lg 1024`, `xl 1280`. The content max width is 1120px
  (`px-40` gutters at 1440). The explore page is a full-bleed split with the list 840px and the
  map filling the rest at `≥lg`, and a list/map toggle with a map FAB below `lg`.
- **Header**: 80–84px desktop, 64px mobile. The category bar is 78px.
- **Touch targets** ≥ 44×44px.

## 3.4 Iconography

**lucide-react**, stroke 1.8 (2–2.6 for small emphasis). Mapping from the mockups:

| Concept | Lucide icon |
|---|---|
| Nearby | `Navigation` |
| Jumu'ah | `CalendarDays` |
| Women's section | `User` (custom `UserRound` + label; never gendered pictograms) |
| Wudhu | `Droplet` |
| Step-free | `Accessibility` |
| Parking | `SquareParking` |
| Prayer room | custom `Arch` icon (SVG in `/components/mw/icons`) |
| Open for Fajr | `Moon` |
| Classes | `BookOpen` |
| Filters | `SlidersHorizontal` |
| Verified | `ShieldCheck` / `Check` |
| Needs check | `CircleAlert` |
| Save | `Bookmark` |
| Share | `Share` |
| Photos | `Camera` |
| Report | `Flag` |
| I prayed here | `MapPinCheck` |
| Logo | Custom dome mark (the arch/dome glyph from the design) in an emerald rounded square |

No emoji in UI chrome.

## 3.5 Components

### shadcn/ui primitives used

`button`, `badge`, `card`, `dialog`, `drawer` (vaul, mobile sheets), `sheet`, `popover`,
`command` (search suggestions), `dropdown-menu`, `tabs`, `toggle-group` (Yes/No/Not sure),
`checkbox`, `radio-group`, `switch`, `input`, `input-otp` (email code), `textarea`, `select`,
`form`, `label`, `separator`, `skeleton`, `avatar`, `tooltip`, `sonner` (toasts),
`scroll-area`, `carousel` (photos), `progress`, `alert`, `breadcrumb`, `pagination`, `table`.

Button variants extended: `default` (emerald), `secondary` (ink, for committing actions),
`outline` (ink border, as in "Show all amenities"), `ghost`, `link` (underlined ink, as in
Airbnb's "Share"/"Save"), `warning`.

### Product components (`/components/mw`)

| Component | Anatomy | States |
|---|---|---|
| `SiteHeader` | Logo · `SearchPill` (compact on inner pages) · "Add a mosque" · account menu (hamburger + avatar) | signed out / signed in / mobile collapsed |
| `SearchPill` | Three segments: **Where** (Places autocomplete), **Prayer** (Next / Fajr … / Jumu'ah), **Needs** (amenity multiselect) + round emerald search button | idle, focused segment (white raised), mobile: one tappable pill opening a full-screen `Drawer` |
| `CategoryBar` | Horizontal scroll of icon+label toggles, selected = ink with 2px underline; trailing "Filters" button with count badge | selected, hover, overflow arrows |
| `FiltersDialog` | Airbnb-style modal: sections for place type, amenities, Jumu'ah language, open-for-Fajr; footer "Clear all" + "Show N places" | live count |
| `MosqueCard` (list row) | 56px thumbnail (Commons photo, else a two-letter monogram on the place tint), name + ✓verifier count, locality · distance · tag, and on the end side the next time with one trust word: "iqamah · verified", "iqamah · unverified", "iqamah · change reported" (amber) or "adhan · no iqamah yet" (muted time). Replaced the 4:3 cover grid in the October 2026 redesign: blank covers filled the screen and every adhan-only card read the same | hover (map pin highlights), focus ring |
| `PlaceMap` | MapLibre map, pins = `TimePin` (white pill with next iqamah; ink when selected/hovered; amber dot when disputed; arch icon for prayer rooms without jamā'ah), clusters as ink circles with counts, zoom controls, "Search as I move the map" toggle, legend | loading, empty area ("No places here yet — add one") |
| `TimePin` | Pill 13px/700 text | default, selected (scale 1.08, ink), disputed, no-time (icon) |
| `PhotoGrid` | 1 large + 4 small, 16px outer radius, "Show all N photos" | fewer photos, none (tinted illustration + "Add photos") |
| `TrustSummary` | ShieldCheck badge + "Community verified" + sentence + agreement % + last check | verified / partially verified / unverified / needs check |
| `PrayerTimesTable` | Columns Prayer · Adhan · Iqamah · Community check. Next row tinted `primary-soft` with "NEXT · IN 38 MIN". A disputed row status appears in amber; the inline `DisputeBanner` sits below the table | calculated-only (iqamah "—" + "Add"), Jumu'ah day |
| `DisputeBanner` | Amber soft background, alert icon, "Isha may have changed. 3 people say 8:30 PM." + [Still 8:45] [Confirm 8:30] | signed out (buttons open sign-in), voted |
| `JumuahCards` | Grid of jamā'ah cards: overline, salah time, khutbah time · language | 1–6 jamā'ahs |
| `AmenityList` | 2-column icon rows with label + note ("Separate first floor · 18 confirm"); unavailable = strikethrough | expanded dialog for all |
| `NextPrayerCard` | Sticky on desktop (top 104px): overline, "Asr · 4:30 PM", adhan + verified meta, countdown pill, walk/"for you" split box, **Get directions** (primary), **I prayed here** (outline), helper text | before Fajr, after Isha ("Fajr tomorrow"), Jumu'ah, no iqamah |
| `MobileActionBar` | Fixed bottom: next iqamah + countdown · primary "I'm here" | |
| `ActivityFeed` | Avatar, **@handle** action, relative time | empty |
| `UpdateTimesDialog` | Tabs (Iqamah times, Jumu'ah, Amenities); "Applies from" date; rows with `TimeStepper` (±5 min, tap to type); "was X" amber chip when changed; source chips; timetable photo dropzone; footer Reset · helper · "Submit N changes"/"Confirm times are correct" | desktop `Dialog`, mobile `Drawer` |
| `TimeStepper` | − [h:mm] + ; long-press repeats; keyboard ↑/↓ = ±1 min, PgUp/PgDn = ±5 | min/max bounds per prayer window |
| `QuickVerifySheet` | Progress segments, overline "YOU'RE AT", question, 2 big answers + tertiary, success state | Phase 5 |
| `ProfileHeroMap` | Night globe/equirectangular map, gold pins sized by visit count, dashed journey arcs (optional), overlay title, filter pills (All time / year / Jumu'ah only), stat tiles, "Share my map" | empty ("Your map starts with your first check-in") |
| `ProfileCard` | Avatar with verified tick, name, trust badge, stats column (Verifications, Places added, Years) | own profile shows "Edit profile" |
| `BadgeTile` | Colored circle icon, title, description | locked (muted, progress text) |
| `ContributionList` | Filter chips with counts + rows (icon tile, action · place, detail, time) | paginated |
| `ShareCard` | OG image template 1200×630: night map + name + stats | Phase 4 |

### Content and formatting rules

- Times are shown in the **place's local time**, as `4:30 PM` in `en` (12h/24h by locale). Adhan
  and iqamah use the **same clock style** everywhere (table, cards, pins, countdown, subline), so a list
  never mixes "16:35" and "5:00 PM". Adhan is secondary (muted); iqamah is bold.
- Relative freshness: "Verified 2 days ago · 9 people". Beyond 60 days, show amber "Needs check".
- Calculated values are always labelled: "Adhan times are calculated (Muslim World League)".
- Arabic terms use a consistent transliteration: Jumu'ah, jamā'ah, iqamah, wudhu, Qur'an, Janazah.
- Microcopy is warm and short: "JazakAllahu khayran", "Help confirm", "Only mark what you've seen yourself".

## 3.6 Maps

- **Explore map style** `/public/map/explore.json`: forked from OpenFreeMap *Positron*. Land
  `#ECEEE7`, water `#C4DBE3`, parks `#D3E4CF`, roads white, labels `#7A766E` uppercase small
  caps for districts; POIs hidden except transit stations.
- **Profile map** `/public/map/night.json`: no tiles. A Natural Earth 110m land GeoJSON fill
  `--map-land-night` on `--map-ocean-night` background, 30° graticule at 6% white,
  **globe projection** at zoom < 2 (MapLibre v5+), equirectangular-looking flat map when
  embedded in the OG image (rendered server-side as SVG).
- Pins: HTML markers when ≤ 150 features in view, otherwise a GeoJSON cluster source with
  symbol layers (text = iqamah time) for performance.
- Attribution control is always visible (collapsed "ⓘ" on mobile).

## 3.7 Motion

- 150–200ms `ease-out` for hovers/pins; 250ms for dialogs/drawers (shadcn defaults).
- Map `flyTo` on selecting a card (duration 600ms). Respect `prefers-reduced-motion` (jump, no fly).
- The countdown pill updates every 30s; no seconds ticking.

## 3.8 Accessibility

- Real `<button>`/`<a>`/`<input>` everywhere. The map has a list equivalent (the card grid is
  the accessible primary) and pins are focusable buttons with `aria-label`
  ("East London Mosque, Asr iqamah 4:30 PM").
- Stepper: `role="spinbutton"` with `aria-valuetext="4:30 PM"`.
- Dialog/drawer focus trapping via Radix/vaul; ESC closes.
- Color is never the only signal: disputed = amber **and** an icon/label.
- Test with axe in E2E; manual VoiceOver pass on iOS Safari each phase.
