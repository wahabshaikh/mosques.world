import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { MergeError, mergePlaces } from "@/lib/places/merge";
import { apiModerator, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const input = z.object({ source: z.string().trim().min(1).max(200), target: z.string().trim().min(1).max(200) });

function slugOf(value: string): string {
  return value.replace(/^.*\/m\//, "").replace(/[/?#].*$/, "");
}

/** Merges a duplicate (`source`) into the place that stays (`target`); accepts slugs or /m/ URLs. */
export async function POST(request: Request) {
  const guarded = await apiModerator(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Enter both places.", 400);
  const database = appEnv().DB;
  const find = (slug: string) => database.prepare(`SELECT id FROM place WHERE slug = ?`).bind(slugOf(slug)).first<{ id: string }>();
  const [source, target] = await Promise.all([find(parsed.data.source), find(parsed.data.target)]);
  if (!source || !target) return jsonError("One of those places was not found.", 404);
  try {
    const result = await mergePlaces(database, { sourceId: source.id, targetId: target.id, moderatorId: guarded.user.id, now: Date.now() });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof MergeError) return jsonError(error.message, 409);
    throw error;
  }
}
