---
paths:
  - "app/**/*.tsx"
  - "components/**"
  - "app/globals.css"
---

# Pages and components

- Design tokens, typography, spacing and component rules are in `docs/spec/03-design-system.md`;
  screens and flows are in `docs/spec/04-sitemap-screens-flows.md`. The `design/` folder is a reference
  snapshot, not code to import.
- `components/ui/` are shadcn/ui primitives: theme them through CSS variables, don't fork their logic.
  Product components go in `components/mw/` (kebab-case file, named export).
- Server components by default; add `"use client"` only for interactivity. Read data on the server with
  `appEnv()` / `db()`; client components call `/api/v1` routes.
- Gate new screens with the phase helpers in `lib/phase.ts` and `notFound()` while off.
- i18n: strings on localized pages come from `lib/i18n/messages/*.ts` (add to `en.ts` first; the other
  catalogs are typed against it) or `lib/i18n/client-messages.ts` for client components. Use logical
  Tailwind classes (`ms-*`, `me-*`, `ps-*`, `text-start`) so Arabic and Urdu render right-to-left.
  Layouts must not read the request path (vinext reuses mounted layouts across navigations).
- Accessibility: labelled inputs, real buttons/links, visible focus, 44px touch targets on mobile. E2E
  runs axe and fails on serious/critical violations.
- Every route-group layout renders `<ReadyMark />` (`data-app-ready`) so E2E can wait for hydration.
  A new route group's layout needs it too.
- Analytics: `track("snake_case_goal", props)` from `lib/analytics.ts`. Goal names are append-only and
  props never contain emails, names or exact coordinates.
- Maps (MapLibre) are heavy: load them lazily and keep them off the critical path of the mosque page.
