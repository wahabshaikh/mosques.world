import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { isNonProductionHost } from "@/lib/environment";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";
import { sourceFixtureFetcher } from "@/lib/sources/fixture";
import { linkSource, linksLeftToday } from "@/lib/sources/sync";
import { detectSource, PROVIDER_LABELS } from "@/lib/sources/timetable";

export const dynamic = "force-dynamic";

const input = z.object({ url: z.string().trim().min(8, "Paste the mosque's Mawaqit or Masjidal link.").max(500) });

/**
 * Links a mosque's own published timetable (its Mawaqit page or Masjidal widget link). The times are
 * fetched straight away and refreshed nightly; a page for a mosque more than 3 km away is refused.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Paste the mosque's Mawaqit or Masjidal link.", 400);
  const ref = detectSource(parsed.data.url);
  if (!ref) return jsonError("That isn't a Mawaqit mosque page or a Masjidal link with a masjid_id.", 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const { id } = await params;
  const place = await env.DB.prepare(`SELECT id, lat, lng, timezone FROM place WHERE id = ? AND status IN ('active', 'pending')`)
    .bind(id)
    .first<{ id: string; lat: number; lng: number; timezone: string }>();
  if (!place) return jsonError("That place was not found.", 404);
  const now = Date.now();
  if ((await linksLeftToday(env.DB, user.id, now)) <= 0) return jsonError("You've linked 10 timetables today. Thank you — try again tomorrow.", 429);
  const fixture = isNonProductionHost(new URL(request.url).hostname) && /(?:^|;\s*)mw_source_fixture=1(?:;|$)/.test(request.headers.get("cookie") ?? "");
  const result = await linkSource(env.DB, place, ref, { userId: user.id, fetcher: fixture ? sourceFixtureFetcher(place) : fetch, now });
  if (!result.ok) return jsonError(result.error, 422);
  return Response.json({ ok: true, provider: ref.provider, label: PROVIDER_LABELS[ref.provider], days: Object.keys(result.timetable.days).length });
}
