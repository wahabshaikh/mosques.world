# Phase 2 runbook — Trusted iqamah times

## What is live

Accounts (email OTP, optional Google), onboarding with usernames, profile and account settings
(JSON export, delete → "former member"), iqamah and Jumu'ah contributions through the Update timings
dialog (`/m/:slug/update`, intercepted as a modal), one-tap confirm, dispute banners, per-fact history
(`/m/:slug/history`), timing reports, explore upgrades (next iqamah on cards and pins, "Community
verified" / "Change reported" chips, sort by soonest iqamah / most verified, "Has verified times"
filter) and moderation (`/admin/queue`, `/admin/reports`, `/admin/users`, `/admin/audit` with revert).

Everything is behind the KV flag `phase2.contributions` in `FLAGS`:

| Value | Effect |
|---|---|
| unset | on for localhost and `*.workers.dev`, **off on mosques.world** |
| `on` / `off` | forced |
| `0`–`100` | percentage rollout, bucketed by client IP |

Flags are cached for 60 s per isolate.

```bash
pnpm exec wrangler kv key put --binding FLAGS phase2.contributions 10 --remote   # 10%
pnpm exec wrangler kv key put --binding FLAGS phase2.contributions on --remote   # 100%
```

When the flag is off, the site is exactly Phase 1: auth and contribution routes return 404 and the
mosque page shows adhan times and the waitlist.

## Before turning the flag on in production

1. Apply the migration (it is additive): record a Time Travel bookmark, then
   `pnpm exec wrangler d1 migrations apply DB --remote`.
2. Secrets: `BETTER_AUTH_SECRET` (32+ random bytes) is required. It was not set in production until 28 Sep 2026
   (now set; how to generate, set and rotate it: Phase 6 runbook, step 2). `GOOGLE_CLIENT_ID` and
   `GOOGLE_CLIENT_SECRET` enable "Continue with Google" (redirect URI
   `https://mosques.world/api/auth/callback/google`); without them only email OTP is offered.
   `TURNSTILE_SECRET_KEY` guards the OTP email endpoint. `DATAFAST_API_KEY` enables the server-side
   `dispute_resolved` goal.
3. Moderators: after they have signed in once,
   `pnpm exec tsx scripts/grant-role.ts --email them@example.com --role moderator | pnpm exec wrangler d1 execute DB --remote --file=/dev/stdin`
   (`--role admin` for admins, `--role user` to remove). Moderators get trust level 3.
4. Sentry alerts for `/api/v1/votes`, `/api/v1/places/:id/contributions` and `/api/auth/*`.

## Launch email

After the flag is at 100%, send the one-off "times are live" email to confirmed waitlist members.
It is idempotent and batched (50 per call, 5 s apart):

```bash
MW_BASE_URL=https://mosques.world MW_SESSION_COOKIE='__Secure-better-auth.session_token=…' \
  pnpm exec tsx scripts/broadcast-times-live.ts
```

The cookie must belong to an admin. Each email carries RFC 8058 one-click unsubscribe headers.

## Trust engine

`lib/trust` (pure engine, D1 store, read models). Each vote recomputes one fact synchronously in a
single D1 batch and refreshes the place's `iqamah_summary_json`, `verification_state` and
`last_verified_at`. Thresholds and limits are in spec 5.4; the engine allows 0.01 of score tolerance so
a few hours of recency decay never flips a value that just met a threshold.

Nightly cron (`15 2 * * *`):

- one `UPDATE` recomputes trust levels for users who can hold a level above 0;
- up to 100 held values with no dispute after 48 h are released;
- up to 1,000 facts whose state can drift with time (oldest first) are queued on `q-recompute` in
  messages of 25 IDs, so a consumer invocation touches at most 250 facts. The remainder rolls over to
  the next night.

## Rollback

Set the flag to `off` (takes effect within 60 s). If code must be rolled back, deploy the previous
Worker version. Migrations are additive, so no database rollback is needed; Phase 1 code ignores the
new tables and columns.

To undo a bad value, open `/admin/audit` and **Revert** the promotion: the previous value becomes
current again and the author's contribution counts as rejected (−5 reputation).

## Tests

- Unit and integration: `pnpm test` (the store runs against the real migrations on `node:sqlite`).
- E2E: `pnpm e2e e2e/phase-2` against local or preview. It relies on the preview-only email sink
  (`/api/v1/test/emails?to=`) and fixtures endpoint (`/api/v1/test/fixtures`, trust levels, roles,
  account age, place reset), both 404 in production.
