---
paths:
  - "app/api/**"
  - "lib/public-api.ts"
  - "lib/openapi.ts"
---

# Route handlers (`app/api/**/route.ts`)

- Everything lives under `/api/v1`. Changes are additive: never remove or rename a field, status code
  or route another client may use. A breaking change means a new route.
- `export const dynamic = "force-dynamic";` on handlers that read the request or D1.
- Order inside a handler (see `app/api/v1/saved/route.ts`):
  1. Feature gate: `phaseNEnabledFor(request)` → `jsonError("Not found", 404)` while the flag is off.
  2. Auth: `apiUser(request, { mutate: true })` for writes (checks session **and** `Origin`); return
     `guarded.response` when present. Role checks via `lib/roles.ts` / `isModerator`.
  3. Input: zod `safeParse` of `await request.json().catch(() => null)` or search params; 400 on failure.
  4. Abuse: `writeAllowed(env.RL_WRITE, \`write:${user.id}\`)` for writes (429), Turnstile where the spec says.
  5. Work: `appEnv().DB.prepare(sql).bind(...)` or Drizzle `db()`. Never string-build SQL from input.
  6. Reply: `Response.json({ ok: true, ... })` or `jsonError(message, status)`. Messages are short,
     friendly sentences shown to people.
- Every new mutation needs unit tests for authZ and rate limiting in `lib/` (spec §6.0).
- `/api/v1/test/*` routes exist only for E2E and must 404 in production: gate them with
  `isNonProductionHost` from `lib/environment.ts` (or `usesEmailSink`), never a raw hostname check.
- Public API (`/api/v1/public/*`): key auth via `lib/api-keys.ts`, `RL_API`, open CORS for GET, never
  return contributor identities. Document every change in `lib/openapi.ts`.
