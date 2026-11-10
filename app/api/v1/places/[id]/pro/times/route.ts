import { afterContribution } from "@/lib/notify";
import { scheduleUserStats } from "@/lib/profile/stats";
import { isNonProductionHost } from "@/lib/environment";
import { serverGoal } from "@/lib/analytics-server";
import { resultMessage } from "@/lib/contribute";
import { appEnv } from "@/lib/db/client";
import { approvedSteward, entitled, normalizeProTimes, proTimesDecision, proTimesInput, readPro } from "@/lib/masjid-pro";
import { civilDate } from "@/lib/prayer/times";
import { dailyUsage, limitProblem, writeAllowed } from "@/lib/ratelimit";
import { actorOf, apiUser, jsonError } from "@/lib/session";
import { factLabel, validateFactValue } from "@/lib/trust/facts";
import { submitValue, TrustError, type VoteResult } from "@/lib/trust/store";

export const dynamic = "force-dynamic";

/**
 * An approved steward publishes iqamah and Jumu'ah onto the directory. Masjid Pro has to be in
 * force. The values go through the trust engine, so the mosque page and the lobby show the same times.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = proTimesInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Those times were not valid.", 400);
  const times = normalizeProTimes(parsed.data);
  if (!times.ok) return jsonError(times.error, 400);

  const changes = [];
  for (const change of times.changes) {
    const valid = validateFactValue(change.key, change.qualifier, change.value);
    if (!valid.ok) return jsonError(`${factLabel(change.key, change.qualifier)}: ${valid.error}`, 400);
    changes.push({ ...change, value: valid.value });
  }

  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const { id } = await params;
  const place = await env.DB.prepare(`SELECT id, timezone FROM place WHERE id = ? AND status IN ('active', 'closed')`)
    .bind(id)
    .first<{ id: string; timezone: string }>();
  if (!place) return jsonError("That place was not found.", 404);

  const now = Date.now();
  const [approved, pro] = await Promise.all([approvedSteward(env.DB, place.id, user.id), readPro(env.DB, place.id, now)]);
  const decision = proTimesDecision({ approved, entitled: Boolean(pro && entitled(pro.status, pro.periodEnd, now)) });
  if (!decision.ok) return jsonError(decision.error, decision.status);

  const problem = limitProblem(user.trustLevel, await dailyUsage(env.DB, user.id, now), { votes: changes.length, values: changes.length });
  if (problem) return jsonError(problem, 429);

  const today = civilDate(new Date(now), place.timezone);
  const effectiveFrom = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  const actor = actorOf(user);
  const results: VoteResult[] = [];
  try {
    for (const change of changes) {
      results.push(
        await submitValue(env.DB, {
          actor,
          placeId: place.id,
          key: change.key,
          qualifier: change.qualifier,
          value: change.value,
          effectiveFrom,
          source: "board",
          now,
        }),
      );
    }
  } catch (error) {
    if (error instanceof TrustError) return jsonError(error.message, error.status);
    throw error;
  }
  await scheduleUserStats(env, user.id, isNonProductionHost(new URL(request.url).hostname)).catch(() => undefined);
  if (results.some((result) => result.outcome?.supersededId)) await serverGoal(env, request, "dispute_resolved", { place_id: place.id });
  await afterContribution(env, request);
  return Response.json({
    results: results.map((result) => ({
      key: result.key,
      qualifier: result.qualifier,
      label: factLabel(result.key, result.qualifier),
      status: result.status,
      state: result.state,
      message: resultMessage(factLabel(result.key, result.qualifier), result),
    })),
  });
}
