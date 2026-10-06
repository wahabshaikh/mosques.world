import { serverGoal } from "@/lib/analytics-server";
import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { afterContribution } from "@/lib/notify";
import { apiModerator, jsonError } from "@/lib/session";
import { decideStewardship, StewardError } from "@/lib/stewards";

export const dynamic = "force-dynamic";

const input = z.object({ action: z.enum(["approve", "reject", "revoke"]) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiModerator(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Pick approve, reject or revoke.", 400);
  const { id } = await params;
  const env = appEnv();
  try {
    const result = await decideStewardship(env.DB, { id, moderatorId: guarded.user.id, action: parsed.data.action, now: Date.now() });
    if (result.status === "approved") await serverGoal(env, request, "steward_approved");
    await afterContribution(env, request);
    return Response.json({ ok: true, status: result.status });
  } catch (error) {
    if (error instanceof StewardError) return jsonError(error.message, error.status);
    throw error;
  }
}
