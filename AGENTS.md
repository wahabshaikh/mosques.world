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
update the spec in the same PR when behaviour changes.

## Commands

pnpm only (never npm or yarn). Node 22.

| Task | Command |
| --- | --- |
| Install | `pnpm install --frozen-lockfile` |
| Dev server (http://127.0.0.1:5173) | `pnpm db:migrate:local && pnpm dev` |
| Lint | `pnpm lint` |
| Typecheck | `pnpm typecheck` |
| Unit tests (one file) | `pnpm exec vitest run lib/slug.test.ts` |
| Unit tests + coverage gate | `pnpm test:coverage` |
| Build | `pnpm build` |
| E2E (starts the dev server itself) | `pnpm e2e e2e/phase-2` |
| E2E against a deployment | `PLAYWRIGHT_BASE_URL=https://… pnpm e2e --grep @smoke` |
| Local D1 migrations | `pnpm db:migrate:local` |

Formatting: Prettier is installed but the repo has no formatting baseline yet, so do **not** run
`pnpm format` across the repo. Match the surrounding style (2 spaces, double quotes, semicolons,
long lines are fine).

## Verify before you push

Run these, in this order, and fix what fails. They are exactly what CI runs
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```sh
pnpm lint && pnpm typecheck && pnpm test:coverage && pnpm build
```

Then prove the change works, not just that it compiles:

- `lib/` logic: a Vitest test next to the file (`lib/foo.ts` → `lib/foo.test.ts`). Coverage gate is 80% lines.
- A page, route or flow: run the E2E suite for that phase (`pnpm e2e e2e/phase-N`) or drive it in a
  browser. Sign-in in E2E uses the email sink, see `signUp()` in [`e2e/phase-2/helpers.ts`](e2e/phase-2/helpers.ts).
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
  trust/ prayer/     consensus engine and prayer-time logic (pure, highest test bar)
  i18n/messages/     server string catalogs, typed against en.ts
  testing/           Vitest stand-ins for cloudflare:workers
worker/index.ts      Worker entry: fetch (vinext) + queue + scheduled handlers, wrapped in Sentry
middleware.ts        locale rewrites, headers, CSP
migrations/          hand-written D1 SQL, numbered, append-only
e2e/phase-N/         Playwright suite per delivery phase
scripts/             one-off ops scripts (tsx), OSM import
docs/spec/           the spec;  docs/runbooks/  per-phase rollout + rollback notes
design/              design canvas snapshot (reference only, not app code)
```

## Rules that keep phases from breaking each other

From [spec §2.10](docs/spec/02-architecture.md). These are hard rules.

1. **Migrations are additive.** No `DROP`/`RENAME` of anything deployed code still reads. Expand,
   migrate, contract across at least two releases.
2. **URLs are permanent.** Never remove a route; a renamed route gets a 308.
3. **Fact keys** (`iqamah.asr`, `amenity.women_section`) are stable strings: add, never repurpose.
4. **New user-facing work ships behind a KV flag** in [`lib/flags.ts`](lib/flags.ts), gated via
   [`lib/phase.ts`](lib/phase.ts). Flags default **on** for localhost and `*.workers.dev`, **off** in production.
5. **`/api/v1` is versioned**: additive changes only. Update [`lib/openapi.ts`](lib/openapi.ts) for public endpoints.
6. **Email templates and analytics goal names are append-only.** Goals are `snake_case`, never carry PII.

## Code conventions

- TypeScript strict, ESM, `@/` imports from the repo root. Unused vars must start with `_`.
- Read bindings with `appEnv()` from `@/lib/db/client`, never `process.env`. New bindings or secrets go
  in `wrangler.jsonc` **and** the `AppEnv` type.
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

Never do these unless a human explicitly asked for that specific action in this task:

- `wrangler deploy`, `wrangler versions deploy`, `pnpm deploy`, or anything with `--remote`
  (D1 migrations, `d1 execute`, KV/R2 writes against real namespaces).
- `wrangler secret put`, editing Cloudflare dashboard settings, DNS, or production KV flags.
- Before a data-changing production D1 migration, record a Time Travel bookmark
  (`wrangler d1 time-travel info DB`) and put it in the PR or runbook.
- Never commit secrets. Local secrets live in `.dev.vars` (gitignored).

## Git and PRs

- Branch from `main`; never push to `main`. Open PRs as **drafts**.
- Commit subjects are short imperative sentences ("Serve /favicon.ico and …"); one logical change per commit.
- Fill in the PR template, and always list what you verified **and what you did not** (and any
  rollout steps a human must do: flag, migration, secrets).
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
