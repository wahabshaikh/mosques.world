# Contributing

Thanks for helping keep mosque information accurate. Code, translations, bug reports and data fixes are all welcome.

## Set up

You need Node.js 22 (see `.nvmrc`) and pnpm 10.

```sh
pnpm install
pnpm db:migrate:local   # creates the local D1 database with seed data
pnpm dev                # http://127.0.0.1:5173
```

No Cloudflare account is needed for local work: D1, R2, KV and queues run in local simulators, emails land in a
local sink (`/api/v1/test/emails`), and features that need a third-party key are off until you add one to
`.dev.vars` (copy [`.dev.vars.example`](.dev.vars.example)). Workers AI has no simulator; set
`CLOUDFLARE_REMOTE_BINDINGS=1` with a Cloudflare login to use it.

## Before you open a pull request

```sh
pnpm lint && pnpm typecheck && pnpm test
```

- Read the [spec](docs/spec/README.md), especially the compatibility rules in
  [2.10](docs/spec/02-architecture.md#210-compatibility-rules-so-phases-never-break-each-other): migrations are
  append-only and additive, URLs are permanent, and new features ship behind a flag.
- New migrations go in `migrations/` with the next number. Never edit one that has been merged.
- Bindings, environments and deploys are described in [docs/deployment.md](docs/deployment.md). A new binding must
  be added both at the top level of `wrangler.jsonc` and in its `previews` block, pointed at a preview resource.
- Pull requests from this repository get a Preview URL on the preview database. Fork PRs run CI only.

## Project layout

```
app/            vinext App Router: pages, route handlers (app/api/v1), OG images
components/ui   shadcn/ui primitives
components/mw   product components
lib/            domain logic, one folder or file per area (places, trust, prayer, email, …); tests sit beside code
worker/         Worker entry: fetch, queue and scheduled handlers
middleware.ts   locale routing, security headers, cache headers
migrations/     D1 SQL migrations (append-only)
scripts/        one-off and operational scripts (OSM import, roles, preview migrations)
e2e/            Playwright suites, one folder per phase
docs/           spec, runbooks, deployment
design/         design canvas snapshot
```
