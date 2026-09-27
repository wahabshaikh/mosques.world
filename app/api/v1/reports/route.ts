import { reportInput } from "@/lib/contribute";
import { firstIssue } from "@/lib/account";
import { appEnv } from "@/lib/db/client";
import { ulid } from "@/lib/id";
import { phase2EnabledFor } from "@/lib/phase";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";
import { isFactKey } from "@/lib/trust/facts";

export const dynamic = "force-dynamic";

const REPORTS_PER_DAY = 10;

export async function POST(request: Request) {
  if (!(await phase2EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = reportInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const input = parsed.data;
  const env = appEnv();
  const database = env.DB;
  const now = Date.now();
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const recent = await database
    .prepare(`SELECT COUNT(*) AS n FROM report WHERE reporter_id = ? AND created_at > ?`)
    .bind(user.id, now - 24 * 60 * 60 * 1000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= REPORTS_PER_DAY) return jsonError("You've sent a lot of reports today. Thank you — try again tomorrow.", 429);
  const exists = await database.prepare(`SELECT id FROM place WHERE id = ?`).bind(input.placeId).first();
  if (!exists) return jsonError("That place was not found.", 404);

  let targetType = "place";
  let targetId = input.placeId;
  if (input.factKey && isFactKey(input.factKey)) {
    const current = await database
      .prepare(
        `SELECT fact_candidate.id FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id
         WHERE fact.place_id = ? AND fact.key = ? AND fact_candidate.status = 'current' LIMIT 1`,
      )
      .bind(input.placeId, input.factKey)
      .first<{ id: string }>();
    if (current) {
      targetType = "candidate";
      targetId = current.id;
    }
  }
  const note = input.factKey ? `[${input.factKey}] ${input.note}` : input.note;
  await database
    .prepare(
      `INSERT INTO report (id, target_type, target_id, place_id, reason, note, reporter_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
    )
    .bind(ulid(now), targetType, targetId, input.placeId, input.reason, note, user.id, now)
    .run();
  return Response.json({ ok: true });
}
