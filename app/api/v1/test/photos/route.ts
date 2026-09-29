import { appEnv } from "@/lib/db/client";
import { testFixtureAllowed } from "@/lib/test-fixtures";

export const dynamic = "force-dynamic";

/** Preview/local only: the newest photos of a place, any status (E2E uses it to find an upload). */
export async function GET(request: Request) {
  const env = appEnv();
  const url = new URL(request.url);
  if (!testFixtureAllowed(env, request)) return Response.json({ error: "Not found" }, { status: 404 });
  const rows = await env.DB.prepare(`SELECT id, status, category FROM photo WHERE place_id = ? ORDER BY created_at DESC LIMIT 10`)
    .bind(url.searchParams.get("placeId") ?? "")
    .all();
  return Response.json({ photos: rows.results ?? [] });
}
