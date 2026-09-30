import { appEnv } from "@/lib/db/client";
import { chunk, type RecomputeMessage } from "@/lib/jobs";
import { afterContribution } from "@/lib/notify";
import { isNonProductionHost } from "@/lib/environment";
import { phase6EnabledFor, phase7EnabledFor } from "@/lib/phase";
import { scheduleUserStats } from "@/lib/profile/stats";
import { writeAllowed } from "@/lib/ratelimit";
import { actorOf, apiUser, jsonError } from "@/lib/session";
import { importTimetable, timetableInput } from "@/lib/timetable";
import { recomputeFact } from "@/lib/trust/store";

export const dynamic = "force-dynamic";

/** Imports a reviewed month of iqamah times (spec P7): one dated value per day and prayer. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await phase7EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = timetableInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "That timetable was not valid.", 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const { id } = await params;
  const place = await env.DB.prepare(`SELECT id FROM place WHERE id = ? AND status = 'active'`).bind(id).first();
  if (!place) return jsonError("That place was not found.", 404);
  const now = Date.now();
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM timetable WHERE created_by = ? AND created_at > ?`)
    .bind(user.id, now - 24 * 60 * 60 * 1000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= 5) return jsonError("You can import 5 timetables a day. Thank you — try again tomorrow.", 429);
  let photo: { id: string; approved: boolean } | null = null;
  if (parsed.data.photoId) {
    const row = await env.DB.prepare(`SELECT id, status FROM photo WHERE id = ? AND place_id = ? AND uploaded_by = ? AND category = 'timetable'`)
      .bind(parsed.data.photoId, id, user.id)
      .first<{ id: string; status: string }>();
    if (!row || row.status === "rejected") return jsonError("That photo can't be used.", 400);
    photo = { id: row.id, approved: row.status === "approved" };
  }
  const steward = await env.DB.prepare(`SELECT 1 AS found FROM steward WHERE place_id = ? AND user_id = ? AND status = 'approved'`).bind(id, user.id).first();
  const result = await importTimetable(env.DB, { actor: actorOf(user), steward: Boolean(steward), placeId: id, month: parsed.data.month, rows: parsed.data.rows, photo, now });

  // Facts that already existed need a full recompute: inline on preview/localhost, on the queue in production.
  const host = new URL(request.url).hostname;
  if (env.Q_RECOMPUTE && !isNonProductionHost(host)) {
    for (const part of chunk(result.pending, 25)) await env.Q_RECOMPUTE.send({ kind: "facts", ids: part } satisfies RecomputeMessage);
  } else {
    for (const factId of result.pending) await recomputeFact(env.DB, factId, now, null, user.id);
  }
  await scheduleUserStats(env, user.id, isNonProductionHost(host)).catch(() => undefined);
  await afterContribution(env, request, await phase6EnabledFor(request));
  return Response.json({ ok: true, ...result, pending: result.pending.length });
}
