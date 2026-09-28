# Phase 6 runbook — Stewards & notifications

## What is live

- **Stewards**: "Are you involved with this mosque?" on the mosque page → `/m/:slug/steward` (role, how they're
  involved, optional way to check) → `/admin/stewards` (approve / reject / revoke, audit-logged) → "Looked after by N
  stewards" on the page, +2 vote weight at that place (and they can release held values), `/steward` and
  `/steward/:slug` with one-click confirms for open disputes, held changes and stale values.
- **Notifications**: the `notification` table is both the in-app inbox (`/notifications`, unread count in the account
  menu) and the outbox for email/push. Rows are written in the same D1 batch as the change that causes them:
  - `saved_changes`: a saved place's time is replaced (not the person whose confirm caused it);
  - `steward_alerts`: a time at a steward's place becomes disputed; also "you now look after …" on approval;
  - `digest`: weekly (Monday 03:30 UTC), recent contributors only: confirmations this week and up to three places they
    know that are stale or disputed. Email only.
- **Delivery**: after a contribution, production sends `{kind:"deliver"}` to `q-recompute` (only if something is
  pending); preview/localhost deliver inline. The nightly cron sweeps anything left (≤ 200). Emails go through
  `q-email` (sink on preview) with RFC 8058 one-click unsubscribe per topic; push uses VAPID
  (`@block65/webcrypto-web-push`) and drops subscriptions that return 404/410. Pending rows older than 72 h are marked
  `expired`, never sent late.
- **Settings**: `/settings/notifications` (email/push per topic, "turn on notifications in this browser").

## Flag

`phase6.stewards` in `FLAGS`, on only where Phases 2–5 are on. Crons and the queue check it against
`PUBLIC_BASE_URL`'s host. Rows can be written while the flag is off; they expire instead of being sent later.

## Before turning it on in production

1. Time Travel bookmark, then `pnpm exec wrangler d1 migrations apply DB --remote` (0008 is additive).
2. Secrets: `BETTER_AUTH_SECRET` (already set; also signs unsubscribe links), `VAPID_PUBLIC_KEY` (var),
   `VAPID_PRIVATE_KEY` (secret, the private key's `d`), optional `VAPID_SUBJECT` (default `mailto:hello@mosques.world`).
   Generate a key pair with `npx web-push generate-vapid-keys` or WebCrypto (P-256). Without VAPID keys, push is skipped.
3. The email sending domain needs List-Unsubscribe support (Cloudflare Email Service passes the headers through).

## Load limits

- Saved-change fan-out is one `INSERT … SELECT` per promotion; delivery sends ≤ 50 (inline) / 100 (queue) / 200
  (nightly) / 300 (digest) per run.
- Digest: ≤ 300 people per week, never twice in six days, one statement.
- Steward requests: ≤ 5 open per person; re-asking after a decision waits 30 days.

## Rollback

Flag `phase6.stewards` off (within 60 s): no delivery, no steward UI; steward vote weight stops only when stewards are
revoked (it is data, not a flag). Migration 0008 is additive.
