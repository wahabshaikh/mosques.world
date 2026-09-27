import { appEnv } from "@/lib/db/client";
import { deliver } from "@/lib/email/send";
import { timesLiveMail } from "@/lib/email/templates";
import { hashToken, newToken } from "@/lib/email/waitlist";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const BATCH = 50;

/**
 * One-off "times are live" email to confirmed P1 waitlist members, 50 per call so the queue and
 * Email Service are never flooded. Idempotent: rows are stamped with times_live_sent_at.
 * Driven by scripts/broadcast-times-live.ts. Admins only.
 */
export async function POST(request: Request) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  if (guarded.user.role !== "admin") return jsonError("Admins only.", 403);
  const env = appEnv();
  const database = env.DB;
  const now = Date.now();
  const rows = await database
    .prepare(
      `SELECT waitlist.id, waitlist.email, place.name, place.slug FROM waitlist JOIN place ON place.id = waitlist.place_id
       WHERE waitlist.status = 'confirmed' AND waitlist.times_live_sent_at IS NULL AND waitlist.unsubscribed_at IS NULL
       ORDER BY waitlist.created_at LIMIT ?`,
    )
    .bind(BATCH)
    .all<{ id: string; email: string; name: string; slug: string }>();
  const host = (request.headers.get("host") ?? "").split(":")[0] ?? "";
  let sent = 0;
  for (const row of rows.results ?? []) {
    const token = newToken();
    await database
      .prepare(`UPDATE waitlist SET token_hash = ?, times_live_sent_at = ? WHERE id = ? AND times_live_sent_at IS NULL`)
      .bind(await hashToken(token), now, row.id)
      .run();
    await deliver(
      env,
      host,
      timesLiveMail(row.email, {
        placeName: row.name,
        placeUrl: `${env.PUBLIC_BASE_URL}/m/${row.slug}`,
        unsubscribeUrl: `${env.PUBLIC_BASE_URL}/waitlist/unsubscribe?token=${token}`,
      }),
    );
    sent += 1;
  }
  const remaining = await database
    .prepare(`SELECT COUNT(*) AS n FROM waitlist WHERE status = 'confirmed' AND times_live_sent_at IS NULL AND unsubscribed_at IS NULL`)
    .first<{ n: number }>();
  return Response.json({ sent, remaining: remaining?.n ?? 0 });
}
