# Deployment and environments

mosques.world is one Cloudflare Worker (`mosques-world`) built with [vinext](https://github.com/cloudflare/vinext).
It serves pages, the JSON API, auth, the queue consumer and the cron jobs. Everything it binds is declared in
[`wrangler.jsonc`](../wrangler.jsonc).

## Environments

| | Local | Preview | Production |
|---|---|---|---|
| URL | `http://127.0.0.1:5173` | `<branch>-mosques-world.<subdomain>.workers.dev` | `https://mosques.world` |
| How | `pnpm dev` | [Worker Previews](https://developers.cloudflare.com/workers/previews/) from Workers Builds on every pushed branch | Workers Builds on every push to `main` |
| Config | top level of `wrangler.jsonc`, local simulators | the `previews` block | top level |
| D1 / R2 / KV | Miniflare, in `.wrangler/state` | `mosques-world-preview`, `mosques-media-preview`, `*-preview` KV (shared by all Previews) | `mosques-world`, `mosques-media`, production KV |
| Queues, crons | run inline | none: jobs run inline | `q-email`, `q-recompute`, `q-media` → `q-dlq`; two crons |
| Email | KV sink (`/api/v1/test/emails`) | KV sink | Email Service from `mail.mosques.world` |
| `ENVIRONMENT` | `production` (localhost is still non-production) | `preview` | `production` |

`lib/environment.ts` decides whether a request is non-production: localhost, or a `*.workers.dev` host on a
deployment whose `ENVIRONMENT` is not `production`. Non-production turns on the test hooks (`x-mw-now`,
`x-mw-latitude`/`x-mw-longitude`, unreleased phase flags defaulting on, inline jobs). The production Worker has
`workers_dev: false`, and its Version URLs on `workers.dev` still count as production.

### What a Preview can and cannot touch

Previews do not inherit anything from the top level, so the `previews` block lists every binding the code reads,
pointed at preview resources. It deliberately has no queue producers (they would send onto the production queues,
whose consumer reads production D1), no `send_email` (previews use the email sink), no routes and no crons.
Rate limits use their own namespaces (`11xx`) so preview and E2E traffic never spends production's budgets.
`lib/wrangler-config.test.ts` fails CI if the `previews` block ever shares a D1 database, R2 bucket, KV namespace
or rate-limit namespace with production, or gains an email binding, queue, route or cron.

All Previews share one D1 database. Migrations are additive (spec 2.10), so a PR that adds one can apply it to the
shared database without breaking other Previews.

## Continuous deployment

[Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/) (the Cloudflare GitHub app) builds every
push. Its commands live in `package.json`, so they are reviewed like code:

| Builds setting | Value | Runs |
|---|---|---|
| Build command | `pnpm build` | `vinext build` |
| Deploy command (`main`) | `pnpm cf:deploy` | print a D1 Time Travel bookmark → `wrangler d1 migrations apply DB --remote` → `wrangler deploy` |
| Preview command (other branches) | `pnpm cf:preview` | `pnpm db:migrate:preview` → `wrangler preview` (Preview named after the branch) |

Builds posts the Preview URL on the pull request. GitHub Actions (`ci.yml`) runs lint, typecheck, tests and the build
on every PR.

### One-time setup (Cloudflare dashboard → Workers & Pages → mosques-world)

1. **Settings → Builds**: set the three commands above and turn on preview builds for non-production branches.
2. **Domains**: under **Worker URL**, turn on **Preview** so Previews get a `workers.dev` URL. (A `wrangler deploy`
   with `preview_urls: true` also sets it.) Leave the production `workers.dev` URL off.
3. The build token needs **D1: Edit** for the migration steps. If a build fails with an authorization error on
   `d1 migrations apply`, pick an API token under **Settings → Builds → API token** that has Workers Scripts: Edit
   and D1: Edit.
4. Delete old Preview settings under **Settings → Previews** (base config) that `wrangler.jsonc` no longer declares,
   such as queue or email bindings. Secrets stay there.

## Secrets

Secrets never go in `wrangler.jsonc` or the repo. Locally they go in `.dev.vars` (see
[`.dev.vars.example`](../.dev.vars.example)). Production and Previews hold separate values:

```sh
# Production
openssl rand -base64 32 | tr -d '\n' | pnpm exec wrangler secret put BETTER_AUTH_SECRET

# Every new Preview (base config), and one existing Preview
pnpm exec wrangler preview base-config secret put BETTER_AUTH_SECRET
pnpm exec wrangler preview secret put BETTER_AUTH_SECRET --name my-branch
```

| Name | Production | Preview | Notes |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | required | recommended | Non-production hosts fall back to a development secret. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | optional | optional | Google sign-in. |
| `GOOGLE_MAPS_API_KEY` | optional | optional | Places search and add. |
| `TURNSTILE_SECRET_KEY` | optional | not used | Previews use the email sink, which skips the captcha. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | optional | optional | Web Push. |
| `SENTRY_DSN` | optional | optional | Errors are tagged with `ENVIRONMENT`. |
| `DATAFAST_WEBSITE_ID`, `DATAFAST_API_KEY` | optional | not used | Analytics. |

## Manual commands

```sh
pnpm db:migrate:local      # local D1
pnpm db:migrate:preview    # shared preview D1 (reads previews.d1_databases)
pnpm db:migrate:remote     # production D1, take a Time Travel bookmark first

pnpm deploy:preview        # build + Preview named after the current git branch
pnpm deploy                # build + production (prefer Workers Builds, which also migrates)
```

`vinext build` writes the deployable config to `dist/server/wrangler.json` and points Wrangler at it through
`.wrangler/deploy/config.json`, so `wrangler deploy` and `wrangler preview` must run after a build.

## Rollback

- Code: `pnpm exec wrangler rollback` (or pick a version under **Deployments** in the dashboard). Rolling back to
  a version from before a secret change also drops that secret.
- Features: every phase is behind a KV flag in `FLAGS`; set it to `off` (takes effect within 60 s).
- Data: migrations are additive, so code rollbacks need no data rollback. For data damage, restore the bookmark the
  deploy printed in its build log: `pnpm exec wrangler d1 time-travel restore DB --bookmark=<bookmark>`.

## Resources

| Binding | Production | Preview |
|---|---|---|
| `DB` (D1) | `mosques-world` | `mosques-world-preview` |
| `MEDIA` (R2) | `mosques-media` | `mosques-media-preview` |
| `FLAGS`, `CACHE` (KV) | `mosques-world-FLAGS`, `mosques-world-CACHE` | `…-preview` |
| `Q_EMAIL`, `Q_RECOMPUTE`, `Q_MEDIA` | `q-email`, `q-recompute`, `q-media` (DLQ `q-dlq`) | none |
| `EMAIL` (Email Service) | `mail.mosques.world` senders | none |
| `RL_WRITE`, `RL_AUTH`, `RL_API` | namespaces 1001–1003 | 1101–1103 |
| `IMAGES`, `AI`, `ASSETS` | account bindings | same |
