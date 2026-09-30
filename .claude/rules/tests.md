---
paths:
  - "**/*.test.ts"
  - "e2e/**"
  - "vitest.config.ts"
  - "playwright.config.ts"
---

# Tests

- Unit tests: Vitest, `lib/**/*.test.ts` beside the module, `describe`/`it` with plain-English names.
  `cloudflare:workers` resolves to `lib/testing/cloudflare-workers.ts`: assign bindings onto its `env`
  in the test. `lib/testing/d1.ts` provides a D1 stand-in.
- Coverage gate (CI): 80% lines/statements/functions, 70% branches over `lib/`. Trust engine and prayer
  logic aim for 95%. Test behaviour through exported functions, not internals.
- Prayer/time code needs fixtures across DST changes, high latitudes and Hanafi Asr.
- E2E: Playwright, one folder per delivery phase (`e2e/phase-N/`). All earlier phase suites must keep
  passing. Runs serially against one database (local Miniflare or preview).
  - Sign up / sign in through the UI with `newUser()` / `signUp()` from `e2e/phase-2/helpers.ts`. OTPs
    come from the email sink at `/api/v1/test/emails` (localhost and preview only).
  - Seed state with `setFixture()` (`/api/v1/test/fixtures`), and use `identity()` so re-runs don't collide.
  - Wait for `[data-app-ready=true]` before interacting. Mark production-safe checks with `@smoke`.
  - Run axe on new pages (`@axe-core/playwright`) and assert no serious/critical violations.
- Never skip, `.only`, or loosen a failing test to get green; fix the cause or say why in the PR.
