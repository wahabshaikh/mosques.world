---
name: preflight
description: Run mosques.world's pre-push checks (pnpm verify, build, and the E2E suites the change touches) and report exactly what passed, failed or was not run. Use before pushing, before opening or marking a PR ready, and whenever asked to verify a change.
---

# Preflight

Run the same checks CI runs, plus the E2E that covers the change, and report results honestly.

## 1. Static checks and unit tests

This is CI's `check` job. Fix the first failure before moving on:

```sh
pnpm verify   # lint, typecheck, unit tests with coverage gate
pnpm build
```

- A coverage failure means new `lib/` code lacks tests: add them, don't lower thresholds.
- `pnpm build` catches vinext/RSC boundary errors that typecheck misses (server-only imports in client
  components, unsupported Next APIs).

## 2. Pick the E2E that covers the change

Map changed files (`git diff --name-only origin/main...`) to suites:

| Changed | Run |
| --- | --- |
| Only `lib/` logic with unit tests, docs, config comments | none required; say so |
| A page, component, route handler, proxy, auth, i18n | `pnpm e2e e2e/phase-N` for each phase whose screens/routes it touches |
| `proxy.ts`, `lib/auth.ts`, `lib/session.ts`, layouts, `worker/index.ts` | `pnpm e2e` (every phase) |
| A migration | `pnpm db:migrate:local`, then the phase suite that reads the new tables |

`pnpm e2e` starts the dev server (with local migrations) itself. In sandboxes add `--project=chromium`
(the SessionStart hook sets `PLAYWRIGHT_CHROMIUM_EXECUTABLE`); WebKit then runs only in CI. Use
`E2E_BUILD=1` (the production build, as CI's `e2e` job does) for service worker, caching and offline
changes. Signed-in tests use `POST /api/v1/test/session`; no real email or Google account is needed.
For UI changes also run `pnpm shot <path> [--as <email>] [--mobile]` and look at the screenshots in
`.artifacts/screenshots/`. Suites that call Google Places or Workers AI may need
keys in `.dev.vars` or remote bindings; if a test can't run for that reason, record it rather than
skipping it silently.

## 3. Report

Reply (or put in the PR body under "Verification") one line per check, for example:

```
- pnpm verify ✅ (lines 86%)  pnpm build ✅
- pnpm e2e e2e/phase-2 --project=chromium ✅ (14 passed)
- Not run: e2e/phase-3 photo upload (needs IMAGES binding locally)
```

Never write ✅ for something you did not run in this session.
