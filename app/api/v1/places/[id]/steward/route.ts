import { appEnv } from "@/lib/db/client";
import { phase6EnabledFor } from "@/lib/phase";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";
import { requestStewardship, StewardError, stewardInput } from "@/lib/stewards";

export const dynamic = "force-dynamic";

/** "Are you involved with this mosque?" — a steward request for moderators to review (spec P6). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await phase6EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = stewardInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Please check the form.", 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${guarded.user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const { id } = await params;
  const place = await env.DB.prepare(`SELECT id FROM place WHERE id = ? AND status IN ('active', 'closed')`).bind(id).first();
  if (!place) return jsonError("That place was not found.", 404);
  try {
    await requestStewardship(env.DB, { userId: guarded.user.id, placeId: id, request: parsed.data, now: Date.now() });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof StewardError) return jsonError(error.message, error.status);
    throw error;
  }
}
