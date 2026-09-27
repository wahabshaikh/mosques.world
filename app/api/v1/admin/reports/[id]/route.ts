import { auditStatement, reportAction } from "@/lib/admin";
import { appEnv } from "@/lib/db/client";
import { apiModerator, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiModerator(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  const parsed = reportAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Unknown action.", 400);
  const database = appEnv().DB;
  const now = Date.now();
  const report = await database.prepare(`SELECT status FROM report WHERE id = ?`).bind(id).first<{ status: string }>();
  if (!report) return jsonError("That report was not found.", 404);
  await database.batch([
    database
      .prepare(`UPDATE report SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?`)
      .bind(parsed.data.status, guarded.user.id, now, id),
    auditStatement(database, {
      actorId: guarded.user.id,
      action: parsed.data.status === "resolved" ? "resolve_report" : "dismiss_report",
      targetType: "report",
      targetId: id,
      before: { status: report.status },
      after: { status: parsed.data.status },
      now,
    }),
  ]);
  return Response.json({ ok: true });
}
