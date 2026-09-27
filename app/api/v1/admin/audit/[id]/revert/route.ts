import { appEnv } from "@/lib/db/client";
import { apiModerator, jsonError } from "@/lib/session";
import { revertPromotion, TrustError } from "@/lib/trust/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiModerator(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  try {
    const outcome = await revertPromotion(appEnv().DB, { moderatorId: guarded.user.id, auditId: id, now: Date.now() });
    return Response.json({ ok: true, currentId: outcome.currentId });
  } catch (error) {
    if (error instanceof TrustError) return jsonError(error.message, error.status);
    throw error;
  }
}
