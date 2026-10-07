import { checkinInput, CheckinError, createCheckin } from "@/lib/checkins";
import { appEnv } from "@/lib/db/client";
import { isNonProductionHost } from "@/lib/environment";
import { readNow } from "@/lib/places/present";
import { civilDate } from "@/lib/prayer/times";
import { recomputeUserStats } from "@/lib/profile/stats";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

function isoDate(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * "I prayed here" (spec P4, flow F5). A shared location is only used to compute the distance to the
 * place; it is never stored. Stats are rebuilt inline so the reply can celebrate a new country or badge.
 */
export async function POST(request: Request) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = checkinInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "That check-in was not valid.", 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const place = await env.DB.prepare(`SELECT id, lat, lng, timezone FROM place WHERE id = ? AND status IN ('active', 'closed')`)
    .bind(parsed.data.placeId)
    .first<{ id: string; lat: number; lng: number; timezone: string }>();
  if (!place) return jsonError("That place was not found.", 404);
  const host = new URL(request.url).hostname;
  const now = readNow(request.headers.get("x-mw-now"), isNonProductionHost(host));
  const since = now.getTime() - 24 * 60 * 60 * 1000;
  const today = await env.DB.prepare(`SELECT COUNT(*) AS n FROM checkin WHERE user_id = ? AND created_at > ?`).bind(user.id, since).first<{ n: number }>();
  if ((today?.n ?? 0) >= 50) return jsonError("That's a lot of check-ins for one day. Try again tomorrow.", 429);
  try {
    const created = await createCheckin(env.DB, {
      userId: user.id,
      place,
      checkin: parsed.data,
      today: isoDate(civilDate(now, place.timezone)),
      publicActivity: user.profilePublic && user.checkinsVisibility === "public",
      now: now.getTime(),
    });
    const stats = await recomputeUserStats(env.DB, user.id, now.getTime());
    return Response.json({
      ok: true,
      checkin: created,
      stats: { places: stats.stat.places, countries: stats.stat.countries },
      newCountry: stats.newCountry,
      newCity: stats.newCity,
      badges: stats.awarded.map((badge) => ({ key: badge.key, name: badge.name })),
    });
  } catch (error) {
    if (error instanceof CheckinError) return jsonError(error.message, error.status);
    throw error;
  }
}
