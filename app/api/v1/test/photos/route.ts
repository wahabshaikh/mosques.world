import { appEnv } from "@/lib/db/client";
import { usesEmailSink } from "@/lib/email/send";

export const dynamic = "force-dynamic";

/** Preview/local only: the newest photos of a place, any status (E2E uses it to find an upload). */
export async function GET(request: Request) {
  const env = appEnv();
  const url = new URL(request.url);
  if (!usesEmailSink(env, url.hostname)) return Response.json({ error: "Not found" }, { status: 404 });
  const rows = await env.DB.prepare(`SELECT id, status, category FROM photo WHERE place_id = ? ORDER BY created_at DESC LIMIT 10`)
    .bind(url.searchParams.get("placeId") ?? "")
    .all();
  return Response.json({ photos: rows.results ?? [] });
}
