import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { phase4EnabledFor } from "@/lib/phase";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_SAVED = 200;
const input = z.object({ placeId: z.string().min(1).max(64) });

/** Save a place to `/saved` (spec P4). */
export async function POST(request: Request) {
  if (!(await phase4EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Pick a place to save.", 400);
  const env = appEnv();
  const { user } = guarded;
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const place = await env.DB.prepare(`SELECT id FROM place WHERE id = ? AND status IN ('active', 'pending', 'closed')`).bind(parsed.data.placeId).first();
  if (!place) return jsonError("That place was not found.", 404);
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM saved_place WHERE user_id = ?`).bind(user.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_SAVED) return jsonError(`You can save up to ${MAX_SAVED} places. Remove one to save another.`, 409);
  await env.DB.prepare(`INSERT INTO saved_place (user_id, place_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`)
    .bind(user.id, parsed.data.placeId, Date.now())
    .run();
  return Response.json({ ok: true, saved: true });
}

export async function DELETE(request: Request) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Pick a place to remove.", 400);
  await appEnv().DB.prepare(`DELETE FROM saved_place WHERE user_id = ? AND place_id = ?`).bind(guarded.user.id, parsed.data.placeId).run();
  return Response.json({ ok: true, saved: false });
}
