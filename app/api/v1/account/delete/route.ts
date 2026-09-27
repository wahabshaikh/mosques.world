import { appEnv } from "@/lib/db/client";
import { deliver } from "@/lib/email/send";
import { deletionMail } from "@/lib/email/templates";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Hard-deletes personal data and anonymises the account to "former member", keeping votes and
 * values so every fact's history stays consistent (spec 2.7, P2 acceptance 7).
 */
export async function POST(request: Request) {
  const guarded = await apiUser(request, { mutate: true, needsUsername: false });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const body = (await request.json().catch(() => null)) as { confirm?: string } | null;
  if (body?.confirm !== "delete") return jsonError('Type "delete" to confirm.', 400);
  const env = appEnv();
  const database = env.DB;
  const now = Date.now();
  const email = user.email;
  await database.batch([
    database.prepare(`DELETE FROM session WHERE user_id = ?`).bind(user.id),
    database.prepare(`DELETE FROM account WHERE user_id = ?`).bind(user.id),
    database.prepare(`DELETE FROM verification WHERE identifier LIKE ?`).bind(`%${email}%`),
    database.prepare(`DELETE FROM waitlist WHERE email = ?`).bind(email),
    database.prepare(`DELETE FROM username_history WHERE user_id = ?`).bind(user.id),
    database.prepare(`UPDATE report SET note = NULL WHERE reporter_id = ?`).bind(user.id),
    database
      .prepare(
        `UPDATE user SET name = 'Former member', email = ?, email_verified = 0, image = NULL, username = NULL,
           display_username = NULL, bio = NULL, home_city_label = NULL, home_country = NULL, avatar_key = NULL,
           deleted_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(`deleted-${user.id}@deleted.invalid`, now, now, user.id),
  ]);
  const host = (request.headers.get("host") ?? "").split(":")[0] ?? "";
  await deliver(env, host, deletionMail(email));
  const expired = "Max-Age=0; Path=/; HttpOnly; SameSite=Lax";
  const response = Response.json({ ok: true });
  for (const name of ["better-auth.session_token", "better-auth.session_data", "__Secure-better-auth.session_token", "__Secure-better-auth.session_data"]) {
    response.headers.append("set-cookie", `${name}=; ${expired}${name.startsWith("__Secure") ? "; Secure" : ""}`);
  }
  return response;
}
