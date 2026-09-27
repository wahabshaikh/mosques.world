import { auditStatement, userAction } from "@/lib/admin";
import { appEnv } from "@/lib/db/client";
import { apiModerator, jsonError } from "@/lib/session";
import { refreshActorTrust } from "@/lib/trust/store";

export const dynamic = "force-dynamic";

/** Trust override and bans (spec 4.3 Admin · Users). Roles are granted only by scripts/grant-role.ts. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiModerator(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  const parsed = userAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Check the form and try again.", 400);
  if (id === guarded.user.id) return jsonError("You can't change your own account here.", 400);
  const database = appEnv().DB;
  const now = Date.now();
  const target = await database
    .prepare(`SELECT id, role, trust_override, banned, ban_reason FROM user WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<{ id: string; role: string; trust_override: number | null; banned: number | null; ban_reason: string | null }>();
  if (!target) return jsonError("That member was not found.", 404);
  if (target.role === "admin" && guarded.user.role !== "admin") return jsonError("Only admins can change an admin.", 403);
  const statements: D1PreparedStatement[] = [];
  const { trustOverride, ban } = parsed.data;
  if (trustOverride !== undefined) {
    statements.push(
      database.prepare(`UPDATE user SET trust_override = ? WHERE id = ?`).bind(trustOverride, id),
      auditStatement(database, { actorId: guarded.user.id, action: "trust_override", targetType: "user", targetId: id, before: { trustOverride: target.trust_override }, after: { trustOverride }, now }),
    );
  }
  if (ban !== undefined) {
    statements.push(
      database.prepare(`UPDATE user SET banned = ?, ban_reason = ? WHERE id = ?`).bind(ban ? 1 : 0, ban ? ban.reason : null, id),
      auditStatement(database, {
        actorId: guarded.user.id,
        action: ban ? "ban" : "unban",
        targetType: "user",
        targetId: id,
        before: { banned: Boolean(target.banned), reason: target.ban_reason },
        after: { banned: Boolean(ban), reason: ban ? ban.reason : null },
        now,
      }),
    );
    if (ban) statements.push(database.prepare(`DELETE FROM session WHERE user_id = ?`).bind(id));
  }
  if (statements.length === 0) return jsonError("Nothing to change.", 400);
  await database.batch(statements);
  const trustLevel = await refreshActorTrust(database, id, now);
  return Response.json({ ok: true, trustLevel });
}
