---
paths:
  - "wrangler.jsonc"
  - "worker/**"
  - "vite.config.ts"
  - "lib/db/client.ts"
  - "lib/environment.ts"
  - "package.json"
  - "docs/deployment.md"
---

# Cloudflare config and the Worker entry

`docs/deployment.md` is the reference for environments, bindings, secrets, deploys and rollback. Keep it
in sync with any change here.

- One Worker serves everything. `worker/index.ts` wraps the vinext fetch handler plus the `queue` and
  `scheduled` handlers in Sentry. Add new queue messages / crons there, with a type guard in `lib/`.
- `wrangler.jsonc`: the top level is **production**; the `previews` block is what every Worker Preview
  runs with and inherits nothing from the top level.
- Adding a binding or var:
  1. Top level (production resource) **and** `previews` (a `-preview` resource; rate limits use the
     `11xx` namespaces). Never point a Preview at a production D1/R2/KV. `lib/wrangler-config.test.ts` checks this.
  2. Never add queue producers, `send_email`, routes, crons or queue consumers to `previews`. Previews
     run jobs inline and send mail to the KV sink.
  3. Add it to `AppEnv` in `lib/db/client.ts` (optional `?` unless every environment has it).
  4. Secrets: add to `.dev.vars.example` and the secrets table in `docs/deployment.md`; never put values
     in the repo. Setting them in Cloudflare is a human step listed under the PR's Rollout.
- "Is this production?" is decided only by `isNonProductionHost()` in `lib/environment.ts` (host +
  `ENVIRONMENT` var). Links in emails and feeds use `linkBase()`.
- Crons in `triggers.crons` must match the constants in `worker/index.ts`.
- `wrangler deploy` / `wrangler preview` read the config vinext writes into `dist/`, so they only work
  after `pnpm build`. Deploys are done by Workers Builds (`pnpm cf:deploy` on `main`, `pnpm cf:preview`
  on branches); don't run them yourself unless asked.
- Workers AI has no local simulator: `CLOUDFLARE_REMOTE_BINDINGS=1 pnpm dev` (needs a Cloudflare login)
  or stub it in tests.
