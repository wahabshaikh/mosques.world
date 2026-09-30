# AGENTS.md

Instructions for coding agents (Claude Code, Codex, Cursor, Copilot, …) and humans working in this repo.
Keep this file short and true. When a rule here turns out wrong, fix the rule in the same PR.

## What this is

mosques.world is a community directory of mosques with iqamah times kept accurate by the community,
plus public profiles that map every mosque someone has prayed in. It is one Cloudflare Worker:
[vinext](https://github.com/cloudflare/vinext) (the Next.js App Router API on Vite) with D1, R2, KV,
Queues, Images, Email, Rate Limiting, Turnstile and Workers AI bindings.

The spec in [`docs/spec`](docs/spec/README.md) is the source of truth for product, architecture, design
system, data model and delivery phases. Read the relevant spec section before changing behaviour, and
update the spec in the same PR when behaviour changes. Environments, bindings, secrets, deploys and
rollback are in [`docs/deployment.md`](docs/deployment.md); human contributor setup is in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

## Commands

pnpm only (never npm or yarn). Node 22.

| Task | Command |
| --- | --- |
| Install | `pnpm install --frozen-lockfile` |
| Dev server (http://127.0.0.1:5173) | `pnpm db:migrate:local && pnpm dev` |
| Lint + typecheck + unit tests with coverage gate | `pnpm verify` |
| Unit tests (one file) | `pnpm exec vitest run lib/slug.test.ts` |
| Build | `pnpm build` |
| E2E, one phase (starts the dev server itself) | `pnpm e2e e2e/phase-2` (add `--project=chromium` in sandboxes) |
| E2E against the production build, as CI does | `E2E_BUILD=1 pnpm e2e` |
| E2E against a deployment | `PLAYWRIGHT_BASE_URL=https://… pnpm e2e:smoke` |
| Signed-in screenshots of a page | `pnpm shot /saved --as a@example.com [--mobile] [--dark]` |
| Signed-in session for curl or Playwright | `pnpm auth:session --email a@example.com [--role admin]` |
| Local D1 migrations | `pnpm db:migrate:local` |

[`docs/testing.md`](docs/testing.md) is the full reference for these.

Local secrets go in `.dev.vars` (copy `.dev.vars.example`); everything works without them except the
features that need a third-party key.

Formatting: Prettier is installed but the repo has no formatting baseline yet, so do **not** run
`pnpm format` across the repo. Match the surrounding style (2 spaces, double quotes, semicolons,
long lines are fine).

## Verify before you push

Run these and fix what fails. CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs the
same in its `check` job, plus every E2E suite against the production build in its `e2e` job:

```sh
pnpm verify && pnpm build
```

Then prove the change works, not just that it compiles:

- `lib/` logic: a Vitest test next to the file (`lib/foo.ts` → `lib/foo.test.ts`). Coverage gate is 80% lines.
- A page, route or flow: run the E2E suite for that phase (`pnpm e2e e2e/phase-N`), and look at it with
  `pnpm shot`. Service worker, caching or offline changes need `E2E_BUILD=1`.
- Signed-in tests don't go through the sign-in UI: `POST /api/v1/test/session` (or `newUser()` /
  `signIn()` in [`e2e/support/helpers.ts`](e2e/support/helpers.ts)) opens a real session. Only the
  sign-in flow itself uses the email sink (`GET /api/v1/test/emails?to=`). Both 404 in production.
- Say in the PR what you ran and what you did **not** verify (for example "E2E not run: needs Google
  Places key"). Never claim a check passed that you did not run.

## Repo map

```
app/                 vinext App Router: (site) public pages, (account) sign-in/settings, (admin), (bare) full-screen
  api/v1/…/route.ts  JSON route handlers (versioned; additive changes only)
  api/auth/[...all]  better-auth handler
  og/                OG image routes
components/ui/       shadcn/ui primitives (restyle via tokens, don't fork logic)
components/mw/       product components
lib/                 domain logic, one module per concern, tests beside the code
  db/schema.ts       Drizzle schema (keep in sync with migrations/)
  db/client.ts       appEnv() (typed bindings) and db() (Drizzle)
  environment.ts     isNonProductionHost() / linkBase(): the only place that decides "is this production?"
  trust/ prayer/     consensus engine and prayer-time logic (pure, highest test bar)
  i18n/messages/     server string catalogs, typed against en.ts
  testing/           Vitest stand-ins for cloudflare:workers
worker/index.ts      Worker entry: fetch (vinext) + queue + scheduled handlers, wrapped in Sentry
middleware.ts        locale rewrites, headers, CSP
migrations/          hand-written D1 SQL, numbered, append-only
e2e/phase-N/         Playwright suite per delivery phase;  e2e/support/  shared helpers;  e2e/auth/  test-session
scripts/             ops and dev scripts (tsx): OSM import, preview migrations, shot, dev-session
docs/spec/           the spec;  docs/runbooks/  per-phase rollout;  docs/deployment.md  envs + deploys;  docs/testing.md
design/              design canvas snapshot (reference only, not app code)
```

## Rules that keep phases from breaking each other

From [spec §2.10](docs/spec/02-architecture.md). These are hard rules.

1. **Migrations are additive.** No `DROP`/`RENAME` of anything deployed code still reads. Expand,
   migrate, contract across at least two releases.
2. **URLs are permanent.** Never remove a route; a renamed route gets a 308.
3. **Fact keys** (`iqamah.asr`, `amenity.women_section`) are stable strings: add, never repurpose.
4. **New user-facing work ships behind a KV flag** in [`lib/flags.ts`](lib/flags.ts), gated via
   [`lib/phase.ts`](lib/phase.ts). Flags default **on** outside production (localhost and Previews, per
   `lib/environment.ts`) and **off** in production.
5. **`/api/v1` is versioned**: additive changes only. Update [`lib/openapi.ts`](lib/openapi.ts) for public endpoints.
6. **Email templates and analytics goal names are append-only.** Goals are `snake_case`, never carry PII.

## Code conventions

- TypeScript strict, ESM, `@/` imports from the repo root. Unused vars must start with `_`.
- Read bindings with `appEnv()` from `@/lib/db/client`, never `process.env`. A new binding goes in
  `wrangler.jsonc` at the top level **and** in `previews` (pointed at a preview resource), and in the
  `AppEnv` type. Never add queue producers, `send_email`, routes or crons to `previews`.
- Test-only behaviour (fixtures, the email sink, `x-mw-*` headers) is gated with `isNonProductionHost`
  from `lib/environment.ts`, never a raw hostname check.
- Validate every input at the boundary with zod. Use D1 prepared statements with `.bind()`; never
  interpolate user input into SQL.
- Mutating route handlers follow the pattern in [`app/api/v1/saved/route.ts`](app/api/v1/saved/route.ts):
  flag check → `apiUser(request, { mutate: true })` → zod → rate limit (`writeAllowed`) → D1 →
  `Response.json` / `jsonError`. Error strings are user-facing sentences.
- Dates and times are computed in the **place's** IANA timezone (`@date-fns/tz`), never the server's.
- User-visible strings on localized pages go through the i18n catalogs; layouts use logical
  properties (`ms-`, `me-`, `text-start`) so RTL works. Layouts must not read the request path.
- Keep `lib/` modules pure where possible and push I/O to the edges so they stay unit-testable.
- Comments explain why, not what. Match the existing JSDoc one-liners on exported functions.

## Safety

Workers Builds deploys automatically: every pushed branch gets a Preview (and applies new migrations to
the shared preview D1), and every merge to `main` applies migrations to production D1 and deploys. So a
migration on a branch reaches the shared preview database as soon as you push, and production when merged.

Never do these unless a human explicitly asked for that specific action in this task:

- `pnpm deploy`, `pnpm deploy:preview`, `pnpm cf:deploy`, `pnpm cf:preview`, `wrangler deploy`,
  `wrangler preview`, `wrangler rollback`, or anything with `--remote` (D1, KV, R2).
- `pnpm db:migrate:preview` / `db:migrate:remote`, `wrangler secret put`, Cloudflare dashboard settings,
  DNS, or production KV flags.
- Never commit secrets. Local secrets live in `.dev.vars` (gitignored).

## Git and PRs

- Branch from `main`; never push to `main`. Open PRs as **drafts**.
- Commit subjects are short imperative sentences ("Serve /favicon.ico and …"); one logical change per commit.
- Fill in [the PR template](.github/pull_request_template.md): before/after, how, rollout (flags,
  migrations, secrets) and checks, including the "Not verified:" line. Try UI changes on the PR's Preview URL.
- A delivery phase also updates `docs/runbooks/phase-N.md` and its acceptance E2E in `e2e/phase-N/`.

## Agent tooling

Claude Code reads [`CLAUDE.md`](CLAUDE.md), which imports this file. Task playbooks live in
[`.claude/skills/`](.claude/skills) and path-scoped rules in [`.claude/rules/`](.claude/rules); they are
plain Markdown, so other agents can read them too:

| Playbook | Use it to |
| --- | --- |
| [`preflight`](.claude/skills/preflight/SKILL.md) | run the pre-push checks and report results |
| [`ship-feature`](.claude/skills/ship-feature/SKILL.md) | build a feature end to end (flag, data, logic, UI, tests, runbook, PR) |
| [`d1-migration`](.claude/skills/d1-migration/SKILL.md) | write and apply a D1 migration safely |
| [`steward`](.claude/skills/steward/SKILL.md) | drive an open PR to green |
