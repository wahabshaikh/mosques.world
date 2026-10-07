import { appEnv } from "@/lib/db/client";
import { ulid } from "@/lib/id";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

/** A contributor (L1+) other than the creator confirms a pending place exists; it goes public. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const { id } = await params;
  const database = appEnv().DB;
  const place = await database.prepare(`SELECT status, created_by FROM place WHERE id = ?`).bind(id).first<{ status: string; created_by: string | null }>();
  if (!place) return jsonError("That place was not found.", 404);
  if (place.status !== "pending") return jsonError("That place is already public.", 409);
  if (user.trustLevel < 1 || place.created_by === user.id) return jsonError("Another contributor needs to confirm this place.", 403);
  const now = Date.now();
  await database.batch([
    database.prepare(`UPDATE place SET status = 'active', updated_at = ? WHERE id = ? AND status = 'pending'`).bind(now, id),
    database
      .prepare(`INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at) VALUES (?, ?, ?, 'place_confirmed', '{}', ?)`)
      .bind(ulid(now), user.id, id, now),
  ]);
  return Response.json({ ok: true });
}
