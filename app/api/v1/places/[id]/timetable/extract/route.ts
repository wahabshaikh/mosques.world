import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { usesEmailSink } from "@/lib/email/send";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";
import { extractTimetable } from "@/lib/timetable";

export const dynamic = "force-dynamic";

const input = z.object({ photoId: z.string().min(1).max(64), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });

/** Reads a timetable photo into rows for the review grid (spec P7). Nothing is saved here. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Pick a month and a photo.", 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${guarded.user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const { id } = await params;
  const photo = await env.DB.prepare(`SELECT id, status FROM photo WHERE id = ? AND place_id = ? AND uploaded_by = ? AND category = 'timetable'`)
    .bind(parsed.data.photoId, id, guarded.user.id)
    .first<{ id: string; status: string }>();
  if (!photo || photo.status === "rejected") return jsonError("That photo can't be used.", 400);
  const host = new URL(request.url).hostname;
  const rows = await extractTimetable(env, { photoId: photo.id, month: parsed.data.month, mocks: usesEmailSink(env, host) });
  if (rows === "processing") return jsonError("The photo is still being processed. Try again in a moment.", 409);
  if (rows === "unavailable") return Response.json({ rows: [], manual: true });
  return Response.json({ rows, manual: rows.length === 0 });
}
