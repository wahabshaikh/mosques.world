import { afterContribution } from "@/lib/notify";
import { z } from "zod";
import { resultMessage } from "@/lib/contribute";
import { appEnv } from "@/lib/db/client";
import { recomputeUserStats } from "@/lib/profile/stats";
import { dailyUsage, limitProblem, writeAllowed } from "@/lib/ratelimit";
import { actorOf, apiUser, jsonError } from "@/lib/session";
import { factLabel } from "@/lib/trust/facts";
import { TrustError } from "@/lib/trust/store";
import { applyAnswer, locationInput, verifyAnswer } from "@/lib/verify";
import { presentAt } from "@/lib/verify-context";

export const dynamic = "force-dynamic";

const input = z.object({ placeId: z.string().min(1).max(64), location: locationInput, answer: verifyAnswer });

/** One quick-verify answer, re-checked against the place's location and stored as a geo-verified vote. */
export async function POST(request: Request) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("That answer was not valid.", 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const present = await presentAt(request, parsed.data.placeId, parsed.data.location);
  if ("error" in present) return jsonError(present.error, present.status);
  const now = present.now.getTime();
  const adding = parsed.data.answer.kind === "value" ? { votes: 0, values: 1 } : { votes: 1, values: 0 };
  const problem = limitProblem(user.trustLevel, await dailyUsage(env.DB, user.id, now), adding);
  if (problem) return jsonError(problem, 429);
  try {
    const result = await applyAnswer(env.DB, { actor: actorOf(user), placeId: present.place.id, answer: parsed.data.answer, today: present.day.date, now });
    const stats = await recomputeUserStats(env.DB, user.id, now);
    await afterContribution(env, request);
    return Response.json({
      status: result.status,
      state: result.state,
      needed: result.needed,
      key: result.key,
      message: resultMessage(factLabel(result.key, result.qualifier), result),
      verifications: stats.stat.verifications,
    });
  } catch (error) {
    if (error instanceof TrustError) return jsonError(error.message, error.status);
    throw error;
  }
}
