import { appEnv } from "@/lib/db/client";
import { phase7EnabledFor } from "@/lib/phase";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";
import { addSpecialPrayer, specialInput } from "@/lib/special";

export const dynamic = "force-dynamic";

/** Adds Eid / Taraweeh / Tahajjud times (spec P7): contributors (level 1+) and the place's stewards. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await phase7EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = specialInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Please check the times.", 400);
  const env = appEnv();
  const { id } = await params;
  const place = await env.DB.prepare(`SELECT id FROM place WHERE id = ? AND status = 'active'`).bind(id).first();
  if (!place) return jsonError("That place was not found.", 404);
  const steward = await env.DB.prepare(`SELECT 1 AS found FROM steward WHERE place_id = ? AND user_id = ? AND status = 'approved'`).bind(id, user.id).first();
  if (user.trustLevel < 1 && !steward) return jsonError("Special prayers can be added by contributors and stewards. Confirm a few times first.", 403);
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const now = Date.now();
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM special_prayer WHERE created_by = ? AND created_at > ?`)
    .bind(user.id, now - 24 * 60 * 60 * 1000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 20) return jsonError("That's a lot for one day. Thank you — try again tomorrow.", 429);
  const created = await addSpecialPrayer(env.DB, { userId: user.id, placeId: id, prayer: parsed.data, now });
  return Response.json({ ok: true, id: created });
}
