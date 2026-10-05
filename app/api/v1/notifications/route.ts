import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { phase6EnabledFor } from "@/lib/phase";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The in-app inbox: unread count (for the header) and the latest 50. */
export async function GET(request: Request) {
  if (!(await phase6EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { needsUsername: false });
  if ("response" in guarded) return guarded.response;
  const database = appEnv().DB;
  const countOnly = new URL(request.url).searchParams.get("count") === "1";
  const unread = await database.prepare(`SELECT COUNT(*) AS n FROM notification WHERE user_id = ? AND read_at IS NULL`).bind(guarded.user.id).first<{ n: number }>();
  const headers = { "cache-control": "private, no-store" };
  if (countOnly) {
    // The header menu shows "Steward" only to people who look after a mosque (or have asked to).
    const stewarding = await database.prepare(`SELECT 1 AS yes FROM steward WHERE user_id = ? AND status IN ('requested', 'approved') LIMIT 1`).bind(guarded.user.id).first<{ yes: number }>();
    return Response.json({ unread: unread?.n ?? 0, stewarding: Boolean(stewarding) }, { headers });
  }
  const rows = await database
    .prepare(`SELECT id, topic, title, body, url, read_at, created_at FROM notification WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
    .bind(guarded.user.id)
    .all();
  return Response.json({ unread: unread?.n ?? 0, items: rows.results ?? [] }, { headers });
}

const markInput = z.object({ all: z.literal(true) }).or(z.object({ ids: z.array(z.string().max(64)).min(1).max(50) }));

/** Marks notifications read (all, or some). */
export async function POST(request: Request) {
  const guarded = await apiUser(request, { mutate: true, needsUsername: false });
  if ("response" in guarded) return guarded.response;
  const parsed = markInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Nothing to mark.", 400);
  const database = appEnv().DB;
  const now = Date.now();
  if ("all" in parsed.data) {
    await database.prepare(`UPDATE notification SET read_at = ? WHERE user_id = ? AND read_at IS NULL`).bind(now, guarded.user.id).run();
  } else {
    await database
      .prepare(`UPDATE notification SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${parsed.data.ids.map(() => "?").join(", ")})`)
      .bind(now, guarded.user.id, ...parsed.data.ids)
      .run();
  }
  return Response.json({ ok: true });
}
