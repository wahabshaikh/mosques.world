import { heldAction } from "@/lib/admin";
import { appEnv } from "@/lib/db/client";
import { apiModerator, jsonError } from "@/lib/session";
import { approveHeld, rejectHeld, TrustError } from "@/lib/trust/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiModerator(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  const parsed = heldAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Unknown action.", 400);
  const input = { moderatorId: guarded.user.id, candidateId: id, now: Date.now() };
  try {
    const outcome = parsed.data.action === "approve" ? await approveHeld(appEnv().DB, input) : await rejectHeld(appEnv().DB, input);
    return Response.json({ ok: true, state: outcome.state });
  } catch (error) {
    if (error instanceof TrustError) return jsonError(error.message, error.status);
    throw error;
  }
}
