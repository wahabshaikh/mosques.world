import { appEnv } from "@/lib/db/client";
import { normalizeUsername, usernameProblem } from "@/lib/username";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const username = normalizeUsername(new URL(request.url).searchParams.get("u") ?? "");
  const problem = usernameProblem(username);
  if (problem) return Response.json({ available: false, problem });
  const taken = await appEnv()
    .DB.prepare(`SELECT 1 FROM user WHERE username = ? UNION ALL SELECT 1 FROM username_history WHERE old_username = ? LIMIT 1`)
    .bind(username, username)
    .first();
  return Response.json({ available: !taken, problem: taken ? "That username is taken." : undefined });
}
