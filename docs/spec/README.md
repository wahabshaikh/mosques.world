# mosques.world — Implementation spec

> Status: **Draft v1** · Owner: @wahabshaikh · Last updated: 2026-09-26
> Design: [live canvas](https://claude.ai/artifact/C5AduujXjZbCEDLdvjVgmr) · [snapshot in `/design`](../../design)

mosques.world is a community web app for finding mosques and prayer spaces anywhere in the
world with **iqamah times you can trust**. The community adds and verifies adhan/iqamah
timings, Jumu'ah jamā'ahs and amenities (women's section, wudhu, step-free access, …). Every
member gets a public profile, e.g. `mosques.world/@wahabshaikh`, with their contributions and
a map of every mosque they have prayed in.

## Documents

| # | Document | What's in it |
|---|---|---|
| 1 | [Product](01-product.md) | Problem, users, principles, glossary, non-goals |
| 2 | [Architecture](02-architecture.md) | Stack, Cloudflare bindings, repo layout, environments, data sources & licensing, security, testing, CI/CD, compatibility rules, analytics |
| 3 | [Design system](03-design-system.md) | Tokens, shadcn/ui theme, typography, iconography, components, maps, accessibility |
| 4 | [Sitemap, screens & flows](04-sitemap-screens-flows.md) | Route map, every screen, key user flows |
| 5 | [Data model & trust engine](05-data-model.md) | D1 schema per phase, the facts + votes consensus engine, trust levels |
| 6 | [Delivery phases](06-phases.md) | Priority-ordered phases, each shippable on its own, with acceptance tests |

## Stack at a glance

| Concern | Choice |
|---|---|
| App framework | [vinext](https://github.com/cloudflare/vinext) (Next.js App Router API on Vite) deployed to **Cloudflare Workers** |
| UI | **shadcn/ui** (Radix + Tailwind CSS v4), lucide-react icons, vaul drawers, sonner toasts |
| Auth | **better-auth** (email OTP / magic link, Google OAuth, username plugin) |
| Database | **Cloudflare D1** via Drizzle ORM + hand-written SQL migrations; FTS5 for search |
| Storage | **Cloudflare R2** (photos) + Cloudflare Images binding (resize, strip EXIF) |
| Email | **Cloudflare Email Service** (`send_email` binding) + React Email templates |
| Analytics | **DataFast** (script + goals) |
| Places | **Google Places API (New)**: Autocomplete + Place Details |
| Maps | **MapLibre GL JS** (react-map-gl/maplibre) with OpenFreeMap vector tiles |
| Prayer times | `adhan` (adhan-js) + `tz-lookup` + `Intl` Hijri calendar |
| Async & ops | Queues, Cron Triggers, KV, Rate Limiting binding, Turnstile, Workers AI (later phases), Workers Logs + Sentry |

## Phases (priority order)

Each phase is independently shippable, verifiable end to end, and production ready. Later phases
only **add** routes, tables and columns; they never change the meaning of earlier ones.

| Phase | Name | Ships | User can… |
|---|---|---|---|
| 1 | **Find a mosque** | Public directory, search, map, mosque pages with calculated adhan times, city pages, SEO | Find the nearest mosque and see today's prayer times |
| 2 | **Trusted iqamah times** | Accounts, onboarding, iqamah + Jumu'ah contributions, confirm/dispute, consensus engine, moderation | Add, confirm and correct iqamah times; see how trustworthy each time is |
| 3 | **Amenities, places & photos** | Amenity facts + filters, add a mosque/prayer space via Google Places, photos on R2, reports & duplicates | Filter by women's section/wudhu/step-free, add missing places, upload photos |
| 4 | **Profiles & "I prayed here"** | Check-ins, `/@username` profile with world map, badges, saved places, share cards | Build and share a map of every mosque they have prayed in |
| 5 | **At the mosque (PWA)** | Installable PWA, "I'm here" geo check-in, quick-verify flow, offline saved mosques | Verify timings in 10 seconds while standing at the mosque |
| 6 | **Stewards & notifications** | Mosque stewards, change alerts, email digests, web push | Get told when their mosque's times change; stewards keep a mosque accurate |
| 7 | **Timetables & seasons** | Monthly timetables, photo-to-timetable OCR, Ramadan/Eid/Taraweeh, ICS feeds | See the whole month, subscribe in a calendar, find Eid prayers |
| 8 | **Global & open** | i18n (incl. RTL), public read API, open-data exports | Use the site in their language; developers build on the data |

Phases 1–4 are the MVP shown in the design.
