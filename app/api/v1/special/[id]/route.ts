import { appEnv } from "@/lib/db/client";
import { apiUser, isModerator, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Removes a special prayer entry: its author or a moderator. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  const database = appEnv().DB;
  const row = await database.prepare(`SELECT created_by FROM special_prayer WHERE id = ? AND status = 'active'`).bind(id).first<{ created_by: string }>();
  if (!row) return jsonError("That entry was not found.", 404);
  if (row.created_by !== guarded.user.id && !isModerator(guarded.user)) return jsonError("Only its author or a moderator can remove it.", 403);
  await database.prepare(`UPDATE special_prayer SET status = 'removed' WHERE id = ?`).bind(id).run();
  return Response.json({ ok: true });
}
