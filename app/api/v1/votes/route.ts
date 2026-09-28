import { afterContribution } from "@/lib/notify";
import { scheduleUserStats } from "@/lib/profile/stats";
import { isNonProductionHost } from "@/lib/places/present";
import { serverGoal } from "@/lib/analytics-server";
import { resultMessage, voteInput } from "@/lib/contribute";
import { appEnv } from "@/lib/db/client";
import { phase2EnabledFor, phase6EnabledFor } from "@/lib/phase";
import { dailyUsage, limitProblem, writeAllowed } from "@/lib/ratelimit";
import { actorOf, apiUser, jsonError } from "@/lib/session";
import { factLabel } from "@/lib/trust/facts";
import { castVote, TrustError } from "@/lib/trust/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await phase2EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = voteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("That vote was not valid.", 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const now = Date.now();
  const problem = limitProblem(user.trustLevel, await dailyUsage(env.DB, user.id, now), { votes: 1, values: 0 });
  if (problem) return jsonError(problem, 429);
  try {
    const result = await castVote(env.DB, { actor: actorOf(user), ...parsed.data, now });
    await scheduleUserStats(env, user.id, isNonProductionHost(new URL(request.url).hostname)).catch(() => undefined);
    if (result.outcome?.supersededId) await serverGoal(env, request, "dispute_resolved", { fact_key: result.key });
    const label = factLabel(result.key, result.qualifier);
    await afterContribution(env, request, await phase6EnabledFor(request));
    return Response.json({
      status: result.status,
      state: result.state,
      needed: result.needed,
      key: result.key,
      message: resultMessage(label, result),
    });
  } catch (error) {
    if (error instanceof TrustError) return jsonError(error.message, error.status);
    throw error;
  }
}
