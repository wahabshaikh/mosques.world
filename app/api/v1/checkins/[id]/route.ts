import { deleteCheckin } from "@/lib/checkins";
import { appEnv } from "@/lib/db/client";
import { recomputeUserStats } from "@/lib/profile/stats";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Deletes one of your own check-ins (spec P4 privacy settings). */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  const env = appEnv();
  if (!(await deleteCheckin(env.DB, guarded.user.id, id))) return jsonError("That check-in was not found.", 404);
  await recomputeUserStats(env.DB, guarded.user.id);
  return Response.json({ ok: true });
}
