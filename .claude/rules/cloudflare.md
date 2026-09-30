---
paths:
  - "wrangler.jsonc"
  - "worker/**"
  - "vite.config.ts"
  - "lib/db/client.ts"
---

# Cloudflare config and the Worker entry

- One Worker serves everything. `worker/index.ts` wraps the vinext fetch handler plus the `queue` and
  `scheduled` handlers in Sentry. Add new queue messages / crons there, with a type guard in `lib/`.
- Adding a binding, var or secret:
  1. Add it to `wrangler.jsonc` for production **and** for previews (the `previews` block and
     `env.preview` do not inherit top-level bindings). Preview gets its own D1/R2/KV resources, never
     production ones.
  2. Add it to `AppEnv` in `lib/db/client.ts` (optional `?` unless every environment has it).
  3. Secrets: document the name in the phase runbook and spec §2.3; never put values in the repo.
     Locally they go in `.dev.vars`.
- Previews must never get routes, cron triggers or queue consumers, so a preview cannot take
  mosques.world traffic or run production jobs.
- Crons in `triggers.crons` must match the constants in `worker/index.ts`.
- Workers AI has no local simulator: `CLOUDFLARE_REMOTE_BINDINGS=1 pnpm dev` (needs a Cloudflare login)
  or stub it in tests.
- Anything that talks to real Cloudflare resources (`--remote`, deploy, secrets) needs an explicit ask
  from a human in the current task.
