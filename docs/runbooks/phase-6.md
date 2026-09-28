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
2. Secrets. **Correction (28 Sep 2026): `BETTER_AUTH_SECRET` was *not* set in production before this date**; an
   earlier version of this runbook said "already set". All three below are now set on `mosques-world`, on the preview
   Worker (`--env preview`) and in both Workers' Preview base config (Previews do not inherit production secrets and
   hold separate values). Required before the flag goes on:
   - `BETTER_AUTH_SECRET`: 32 random bytes. Signs sessions (better-auth) and the one-click unsubscribe / calendar
     links. Without it, production sign-in and delivery throw `BETTER_AUTH_SECRET is not set` (non-production hosts
     fall back to a built-in dev secret). Rotating it signs everyone out and invalidates every emailed link.
   - `VAPID_PUBLIC_KEY`: base64url of the uncompressed P-256 public key (65 bytes). The server reads it at request time
     (`appEnv()` in `/verify` and `/settings/notifications`) and passes it to the browser as a prop, so it is stored as
     a Worker secret: no `vars` entry, no build-time env, nothing committed. (If it ever moves to `vars`, delete the
     secret first; a var and a secret cannot share a name.)
   - `VAPID_PRIVATE_KEY`: the private key's `d` (base64url, 32 bytes). Must be the pair of `VAPID_PUBLIC_KEY`, so set
     both together. Rotating the pair breaks existing push subscriptions; people re-subscribe from
     `/settings/notifications`.
   - Optional `VAPID_SUBJECT` (default `mailto:hello@mosques.world`). Without VAPID keys, push is skipped and the
     "turn on notifications" prompts are hidden.

   Generate and set the values without them touching the terminal, shell history or disk by piping straight into
   Wrangler. Use fresh values per target and never reuse production values in previews:

   ```sh
   openssl rand -base64 32 | tr -d '\n' | pnpm exec wrangler secret put BETTER_AUTH_SECRET
   npx web-push generate-vapid-keys --json \
     | node -e 'let s="";process.stdin.on("data",(d)=>(s+=d)).on("end",()=>{const k=JSON.parse(s);process.stdout.write(JSON.stringify({VAPID_PUBLIC_KEY:k.publicKey,VAPID_PRIVATE_KEY:k.privateKey}))})' \
     | pnpm exec wrangler secret bulk
   pnpm exec wrangler secret list   # names only
   ```

   For the preview Worker add `--env preview`. For new Previews use `wrangler preview base-config secret put|bulk
   --worker-name <mosques-world|mosques-world-preview>`; an existing Preview picks them up on its next build (or use
   `wrangler preview secret put --name <preview>`). Each production `secret put`/`bulk` creates and deploys a new
   Worker version, and rolling back to a version from before the change also drops the secrets.
3. The email sending domain needs List-Unsubscribe support (Cloudflare Email Service passes the headers through).

## Load limits

- Saved-change fan-out is one `INSERT … SELECT` per promotion; delivery sends ≤ 50 (inline) / 100 (queue) / 200
  (nightly) / 300 (digest) per run.
- Digest: ≤ 300 people per week, never twice in six days, one statement.
- Steward requests: ≤ 5 open per person; re-asking after a decision waits 30 days.

## Rollback

Flag `phase6.stewards` off (within 60 s): no delivery, no steward UI; steward vote weight stops only when stewards are
revoked (it is data, not a flag). Migration 0008 is additive.
