import { firstIssue, onboardingInput } from "@/lib/account";
import { appEnv } from "@/lib/db/client";
import { deliver } from "@/lib/email/send";
import { welcomeMail } from "@/lib/email/templates";
import { linkBase } from "@/lib/environment";
import { phase2EnabledFor } from "@/lib/phase";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await phase2EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true, needsUsername: false });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = onboardingInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const input = parsed.data;
  const env = appEnv();
  const now = Date.now();
  if (user.username && user.username !== input.username) {
    return jsonError("Change your username in profile settings.", 409);
  }
  const clash = await env.DB.prepare(
    `SELECT 1 FROM user WHERE username = ? AND id != ? UNION ALL SELECT 1 FROM username_history WHERE old_username = ? AND user_id != ? LIMIT 1`,
  )
    .bind(input.username, user.id, input.username, user.id)
    .first();
  if (clash) return jsonError("That username is taken.", 409);
  const first = !user.username;
  try {
    await env.DB.prepare(
      `UPDATE user SET username = ?, display_username = ?, name = ?, home_city_label = ?, home_country = ?,
         guidelines_accepted_at = coalesce(guidelines_accepted_at, ?), updated_at = ? WHERE id = ?`,
    )
      .bind(input.username, input.username, input.name, input.homeCityLabel, input.homeCountry, now, now, user.id)
      .run();
  } catch {
    return jsonError("That username is taken.", 409);
  }
  if (first) {
    const host = (request.headers.get("host") ?? "").split(":")[0] ?? "";
    await deliver(env, host, welcomeMail(user.email, { username: input.username, baseUrl: linkBase(request.url, env.PUBLIC_BASE_URL) }));
  }
  return Response.json({ ok: true, first });
}
