import { eq } from "drizzle-orm";
import { serverGoal } from "@/lib/analytics-server";
import { contributionInput, effectiveFromProblem, resultMessage } from "@/lib/contribute";
import { appEnv, db } from "@/lib/db/client";
import { place } from "@/lib/db/schema";
import { phase2EnabledFor } from "@/lib/phase";
import { civilDate } from "@/lib/prayer/times";
import { dailyUsage, limitProblem, writeAllowed } from "@/lib/ratelimit";
import { actorOf, apiUser, jsonError } from "@/lib/session";
import { factLabel, validateFactValue } from "@/lib/trust/facts";
import { castVote, submitValue, TrustError, type VoteResult } from "@/lib/trust/store";

export const dynamic = "force-dynamic";

/** Update timings (flow F3): one candidate or vote per changed fact plus a confirm per unchanged fact. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await phase2EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const { id } = await params;
  const parsed = contributionInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Those times were not valid.", 400);
  const input = parsed.data;
  if (input.changes.length + input.confirms.length === 0) return jsonError("Nothing to submit.", 400);

  const rows = await db().select().from(place).where(eq(place.id, id)).limit(1);
  const found = rows[0];
  if (!found || found.status !== "active") return jsonError("That place was not found.", 404);
  const today = civilDate(new Date(), found.timezone);
  const todayIso = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  const dateProblem = effectiveFromProblem(input.effectiveFrom, todayIso);
  if (dateProblem) return jsonError(dateProblem, 400);

  const changes = [];
  for (const change of input.changes) {
    const valid = validateFactValue(change.key, change.qualifier, change.value);
    if (!valid.ok) return jsonError(`${factLabel(change.key, change.qualifier)}: ${valid.error}`, 400);
    changes.push({ ...change, value: valid.value });
  }

  const env = appEnv();
  if (input.confirms.length > 0) {
    const owners = await env.DB.prepare(
      `SELECT fact_candidate.id, fact.place_id FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id
       WHERE fact_candidate.id IN (${input.confirms.map(() => "?").join(", ")})`,
    )
      .bind(...input.confirms)
      .all<{ id: string; place_id: string }>();
    const rows = owners.results ?? [];
    if (rows.length !== new Set(input.confirms).size || rows.some((row) => row.place_id !== found.id)) {
      return jsonError("Some of those times belong to another place.", 400);
    }
  }
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const now = Date.now();
  const problem = limitProblem(user.trustLevel, await dailyUsage(env.DB, user.id, now), {
    votes: changes.length + input.confirms.length,
    values: changes.length,
  });
  if (problem) return jsonError(problem, 429);

  let evidence: { photoId: string; approved: boolean } | undefined;
  if (input.evidencePhotoId) {
    const photo = await env.DB.prepare(`SELECT id, status FROM photo WHERE id = ? AND uploaded_by = ? AND place_id = ? AND category = 'timetable'`)
      .bind(input.evidencePhotoId, user.id, found.id)
      .first<{ id: string; status: string }>();
    if (!photo || photo.status === "rejected") return jsonError("That timetable photo can't be used.", 400);
    evidence = { photoId: photo.id, approved: photo.status === "approved" };
  }
  const actor = actorOf(user);
  const results: VoteResult[] = [];
  try {
    for (const change of changes) {
      results.push(
        await submitValue(env.DB, {
          actor,
          placeId: found.id,
          key: change.key,
          qualifier: change.qualifier,
          value: change.value,
          effectiveFrom: input.effectiveFrom,
          source: input.source,
          now,
          evidence,
        }),
      );
    }
    for (const candidateId of input.confirms) {
      results.push(await castVote(env.DB, { actor, candidateId, polarity: 1, source: input.source, now, evidence }));
    }
  } catch (error) {
    if (error instanceof TrustError) return jsonError(error.message, error.status);
    throw error;
  }
  if (results.some((result) => result.outcome?.supersededId)) await serverGoal(env, request, "dispute_resolved", { place_id: found.id });
  return Response.json({
    results: results.map((result) => ({
      key: result.key,
      qualifier: result.qualifier,
      label: factLabel(result.key, result.qualifier),
      status: result.status,
      state: result.state,
      needed: result.needed,
      message: resultMessage(factLabel(result.key, result.qualifier), result),
    })),
  });
}
