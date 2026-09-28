import { z } from "zod";
import { CHECKIN_PRAYER_LABELS, CheckinError, createCheckin, defaultPrayer } from "@/lib/checkins";
import { appEnv } from "@/lib/db/client";
import { phase5EnabledFor } from "@/lib/phase";
import { recomputeUserStats } from "@/lib/profile/stats";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";
import { myVotes, placeFacts } from "@/lib/trust/read";
import { chooseQuestions, locationInput } from "@/lib/verify";
import { presentAt } from "@/lib/verify-context";

export const dynamic = "force-dynamic";

const input = z.object({ placeId: z.string().min(1).max(64), location: locationInput });

/**
 * Starts quick verify: a location-verified check-in for the current prayer (combined, spec P5) and
 * up to three questions for this person.
 */
export async function POST(request: Request) {
  if (!(await phase5EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("We couldn't read your location.", 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const present = await presentAt(request, parsed.data.placeId, parsed.data.location);
  if ("error" in present) return jsonError(present.error, present.status);
  const { place, day, now } = present;
  const prayer = defaultPrayer(day, now);
  let created = true;
  try {
    await createCheckin(env.DB, {
      userId: user.id,
      place,
      checkin: { placeId: place.id, prayer, location: parsed.data.location },
      today: day.date,
      publicActivity: user.profilePublic && user.checkinsVisibility === "public",
      now: now.getTime(),
    });
  } catch (error) {
    if (!(error instanceof CheckinError && error.status === 409)) throw error;
    created = false;
  }
  const [stats, facts, votes, timetable] = await Promise.all([
    recomputeUserStats(env.DB, user.id, now.getTime()),
    placeFacts(env.DB, place.id, day.date),
    myVotes(env.DB, place.id, user.id),
    env.DB.prepare(`SELECT 1 AS found FROM photo WHERE place_id = ? AND category = 'timetable' AND status IN ('approved', 'pending') AND created_at > ? LIMIT 1`)
      .bind(place.id, now.getTime() - 30 * 24 * 60 * 60 * 1000)
      .first<{ found: number }>(),
  ]);
  const questions = chooseQuestions({ facts, day, myVotes: votes, hasRecentTimetablePhoto: Boolean(timetable) });
  return Response.json(
    {
      place: { id: place.id, slug: place.slug, name: place.name },
      checkin: { prayer, label: CHECKIN_PRAYER_LABELS[prayer], created },
      newCountry: stats.newCountry,
      badges: stats.awarded.map((badge) => ({ key: badge.key, name: badge.name })),
      questions,
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}
