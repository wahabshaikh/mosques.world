import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { ulid } from "@/lib/id";
import { phase5EnabledFor } from "@/lib/phase";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const subscription = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});

/** Stores a Web Push subscription (asked only after a successful verify; notifications arrive in Phase 6). */
export async function POST(request: Request) {
  if (!(await phase5EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = subscription.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("That subscription was not valid.", 400);
  const database = appEnv().DB;
  const count = await database.prepare(`SELECT COUNT(*) AS n FROM push_subscription WHERE user_id = ?`).bind(guarded.user.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 10) await database.prepare(`DELETE FROM push_subscription WHERE id = (SELECT id FROM push_subscription WHERE user_id = ? ORDER BY created_at LIMIT 1)`).bind(guarded.user.id).run();
  await database
    .prepare(
      `INSERT INTO push_subscription (id, user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    )
    .bind(ulid(), guarded.user.id, parsed.data.endpoint, parsed.data.keys.p256dh, parsed.data.keys.auth, Date.now())
    .run();
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = z.object({ endpoint: z.string().max(1000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("That subscription was not valid.", 400);
  await appEnv().DB.prepare(`DELETE FROM push_subscription WHERE user_id = ? AND endpoint = ?`).bind(guarded.user.id, parsed.data.endpoint).run();
  return Response.json({ ok: true });
}
