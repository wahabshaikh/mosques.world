import { z } from "zod";
import { CHECKIN_VISIBILITIES } from "@/lib/checkins";
import { appEnv } from "@/lib/db/client";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const input = z.object({
  profilePublic: z.boolean(),
  checkinsVisibility: z.enum(CHECKIN_VISIBILITIES),
});

/**
 * Profile and check-in visibility (spec P4). Tightening visibility also removes your check-ins
 * from mosque activity feeds; loosening it does not re-publish old ones.
 */
export async function PATCH(request: Request) {
  const guarded = await apiUser(request, { mutate: true, needsUsername: false });
  if ("response" in guarded) return guarded.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Those settings were not valid.", 400);
  const database = appEnv().DB;
  const { user } = guarded;
  const now = Date.now();
  const statements = [
    database
      .prepare(`UPDATE user SET profile_public = ?, checkins_visibility = ?, updated_at = ? WHERE id = ?`)
      .bind(parsed.data.profilePublic ? 1 : 0, parsed.data.checkinsVisibility, now, user.id),
  ];
  if (!parsed.data.profilePublic || parsed.data.checkinsVisibility !== "public") {
    statements.push(database.prepare(`DELETE FROM activity WHERE actor_id = ? AND type = 'prayed'`).bind(user.id));
  }
  await database.batch(statements);
  return Response.json({ ok: true });
}
