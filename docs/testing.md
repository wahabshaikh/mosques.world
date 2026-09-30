# Testing and verifying changes

Everything here runs offline against a local Worker (Miniflare D1, KV, R2) with the seed places
from `migrations/`. No Cloudflare account, secrets or real email are needed.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm verify` | Lint, typecheck, unit tests with coverage thresholds. Run before every push. |
| `pnpm e2e` | Every phase's Playwright suite. Starts `pnpm dev` (after local migrations) unless one is already on :5173. |
| `pnpm e2e e2e/phase-3` | One phase. Add `-g "title"` for one test, `--project=chromium` to skip WebKit. |
| `E2E_BUILD=1 pnpm e2e` | Same, against the production build running in workerd (`vite preview`), as CI does. Use it for service worker, caching and offline changes: the dev server serves hundreds of unbundled modules. |
| `pnpm e2e:smoke` | Only tests tagged `@smoke`. |
| `pnpm verify:e2e` | `verify`, then the whole E2E suite (what CI runs). |
| `pnpm auth:session --email a@example.com [--role admin] [--trust 2] [--not-onboarded]` | Signs a person in on a running server and writes a Playwright storage state to `.auth/`, plus a cookie for `curl`. |
| `pnpm shot /saved /settings/profile --as a@example.com [--mobile] [--dark]` | Signed-in (or signed-out, without `--as`) full-page screenshots to `.artifacts/screenshots/`; prints status codes and browser errors. |

CI (`.github/workflows/ci.yml`) runs `check` (lint, typecheck, unit, build) and `e2e` (all phases,
Chromium and mobile WebKit, against the production build) on every pull request. Phase-5 tests tagged
`@chromium-phone` (the offline reload, which Playwright's WebKit fails with "internal error" even on the production
build) run on a phone-sized Chromium project instead. A failed `e2e` job uploads the HTML report and
traces as the `playwright-report` artifact (`pnpm exec playwright show-trace <trace.zip>`).

## Signing in during tests

Two test-only endpoints answer on `localhost`, `127.0.0.1` and preview hosts (`EMAIL_SINK=1`), and
return 404 in production:

- `POST /api/v1/test/session` `{ email, username?, name?, onboarded?, role?, trustLevel?, ageDays? }`
  creates the account if needed, applies the fields, opens a real better-auth session and sets its
  cookie. Use it for everything that isn't the sign-in UI itself.
- `GET /api/v1/test/emails?to=<email>` returns the last email sent to that address (the OTP code is
  in the subject). The phase-2 suite uses it to drive the real email OTP sign-up.

In specs, use the helpers in `e2e/support/helpers.ts`:

```ts
import { newUser, signIn } from "../support/helpers";

// A fresh onboarded person in their own context (page, page.request and context.request are signed in).
const { page, person } = await newUser(browser, "amina", { trustLevel: 2 });

// Or sign the default context in.
test("…", async ({ context, page }) => {
  await signIn(context, "mod@example.com", { role: "moderator" });
});
```

Other fixtures (trust, places, timetables, raw rows for assertions) go through
`POST /api/v1/test/fixtures`; see `setFixture` and `resetPlace`.

## Writing E2E tests that stay green on re-runs

The local database persists between runs (`.wrangler/state`), and suites share it.

- Use `identity(prefix)` for unique emails, usernames and client IPs. Rate limits are counted per
  `cf-connecting-ip`, so a fixed IP gets blocked after a few re-runs.
- Read emails with `?to=<address>`, never the global latest message.
- Reset a place you mutate with `resetPlace(request, slug)` at the start of the test.
- Wait for hydration with `[data-app-ready=true]` before interacting.
- `@axe-core/playwright` checks: zero serious or critical violations on pages you touch.

To start clean: `rm -rf .wrangler/state && pnpm db:migrate:local`.

## Sandboxes without Playwright's browser download

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to a system Chromium (for example `/opt/pw-browsers/chromium`
in Claude Code cloud sessions) and run with `--project=chromium`. WebKit-only suites (phase 5) then
run in CI.

## Against a preview deployment

`PLAYWRIGHT_BASE_URL=https://<preview>.workers.dev pnpm e2e` skips the local server. The preview
Worker has `EMAIL_SINK=1`, so the same test endpoints work there.
