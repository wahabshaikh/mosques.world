import { canChangeUsername, firstIssue, profileInput, USERNAME_CHANGE_DAYS } from "@/lib/account";
import { appEnv } from "@/lib/db/client";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = profileInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const input = parsed.data;
  const database = appEnv().DB;
  const now = Date.now();
  const statements: D1PreparedStatement[] = [];
  if (input.username !== user.username) {
    if (!canChangeUsername(user.usernameChangedAt, now)) {
      return jsonError(`You can change your username once every ${USERNAME_CHANGE_DAYS} days.`, 429);
    }
    const clash = await database
      .prepare(`SELECT 1 FROM user WHERE username = ? UNION ALL SELECT 1 FROM username_history WHERE old_username = ? AND user_id != ? LIMIT 1`)
      .bind(input.username, input.username, user.id)
      .first();
    if (clash) return jsonError("That username is taken.", 409);
    statements.push(
      database.prepare(`DELETE FROM username_history WHERE old_username = ?`).bind(input.username),
      database
        .prepare(`INSERT INTO username_history (old_username, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT (old_username) DO NOTHING`)
        .bind(user.username, user.id, now),
      database.prepare(`UPDATE user SET username = ?, display_username = ?, username_changed_at = ? WHERE id = ?`).bind(input.username, input.username, now, user.id),
    );
  }
  statements.push(
    database
      .prepare(`UPDATE user SET name = ?, bio = ?, home_city_label = ?, home_country = ?, updated_at = ? WHERE id = ?`)
      .bind(input.name, input.bio, input.homeCityLabel, input.homeCountry, now, user.id),
  );
  await database.batch(statements);
  return Response.json({ ok: true });
}
