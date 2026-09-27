/**
 * One-off Phase 2 launch email to confirmed waitlist members ("times are live"), sent in batches of
 * 50 with a pause between calls so the queue and Email Service are never flooded.
 *
 *   MW_BASE_URL=https://mosques.world MW_SESSION_COOKIE='__Secure-better-auth.session_token=…' \
 *     pnpm exec tsx scripts/broadcast-times-live.ts
 *
 * The cookie must belong to an account with role=admin (scripts/grant-role.ts). Safe to re-run:
 * members who already received it are skipped.
 */
const base = process.env.MW_BASE_URL ?? "http://127.0.0.1:5173";
const cookie = process.env.MW_SESSION_COOKIE;
if (!cookie) {
  console.error("Set MW_SESSION_COOKIE to an admin session cookie.");
  process.exit(1);
}

let total = 0;
for (;;) {
  const response = await fetch(`${base}/api/v1/admin/broadcast/times-live`, {
    method: "POST",
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: "{}",
  });
  const body = (await response.json()) as { sent?: number; remaining?: number; error?: string };
  if (!response.ok) {
    console.error(`Stopped: ${body.error ?? response.status}`);
    process.exit(1);
  }
  total += body.sent ?? 0;
  console.log(`sent ${body.sent} · remaining ${body.remaining}`);
  if (!body.sent || !body.remaining) break;
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}
console.log(`Done. ${total} emails queued.`);

export {};
