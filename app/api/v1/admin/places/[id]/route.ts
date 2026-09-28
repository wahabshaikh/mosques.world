import { z } from "zod";
import { auditStatement } from "@/lib/admin";
import { appEnv } from "@/lib/db/client";
import { actorOf, apiModerator, jsonError } from "@/lib/session";
import { submitValue } from "@/lib/trust/store";

export const dynamic = "force-dynamic";

const input = z.object({
  action: z.enum(["close", "restore", "keep_separate"]),
  reason: z.string().trim().max(200).optional(),
  otherId: z.string().max(40).optional(),
});

/** Close or restore a place (recorded as a `status.closed` value), or dismiss a duplicate pair. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiModerator(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Unknown action.", 400);
  const database = appEnv().DB;
  const now = Date.now();
  const place = await database.prepare(`SELECT status, timezone FROM place WHERE id = ?`).bind(id).first<{ status: string; timezone: string }>();
  if (!place) return jsonError("That place was not found.", 404);
  if (parsed.data.action === "keep_separate") {
    await database
      .prepare(`UPDATE place_duplicate_candidate SET status = 'dismissed' WHERE (a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?)`)
      .bind(id, parsed.data.otherId ?? "", parsed.data.otherId ?? "", id)
      .run();
    return Response.json({ ok: true });
  }
  const closing = parsed.data.action === "close";
  if (closing ? place.status === "closed" : place.status !== "closed") return jsonError(closing ? "Already closed." : "That place is not closed.", 409);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: place.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  await submitValue(database, {
    actor: { ...actorOf(guarded.user), trustLevel: 3 },
    placeId: id,
    key: "status.closed",
    qualifier: "",
    value: closing ? { v: true, ...(parsed.data.reason ? { reason: parsed.data.reason } : {}) } : { v: false },
    effectiveFrom: today,
    source: "other",
    now,
  });
  await database.batch([
    database.prepare(`UPDATE place SET status = ?, updated_at = ? WHERE id = ?`).bind(closing ? "closed" : "active", now, id),
    auditStatement(database, {
      actorId: guarded.user.id,
      action: closing ? "close_place" : "restore_place",
      targetType: "place",
      targetId: id,
      before: { status: place.status },
      after: { status: closing ? "closed" : "active", reason: parsed.data.reason ?? null },
      now,
    }),
  ]);
  return Response.json({ ok: true });
}
