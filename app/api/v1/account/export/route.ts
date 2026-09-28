import { exportableUser } from "@/lib/account";
import { appEnv } from "@/lib/db/client";
import { apiUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GDPR export: everything we hold about the signed-in person (spec 2.7). */
export async function GET(request: Request) {
  const guarded = await apiUser(request, { needsUsername: false });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const database = appEnv().DB;
  const [profile, accounts, candidates, votes, activity, reports, waitlist, checkins, saved, badges, stewards, prefs, notifications] = await database.batch([
    database.prepare(`SELECT * FROM user WHERE id = ?`).bind(user.id),
    database.prepare(`SELECT provider_id, account_id, created_at FROM account WHERE user_id = ?`).bind(user.id),
    database
      .prepare(
        `SELECT fact_candidate.id, fact.place_id, fact.key, fact.qualifier, fact_candidate.value_json, fact_candidate.effective_from,
           fact_candidate.status, fact_candidate.created_at
         FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id WHERE fact_candidate.created_by = ?`,
      )
      .bind(user.id),
    database.prepare(`SELECT candidate_id, polarity, source, weight, created_at FROM vote WHERE user_id = ?`).bind(user.id),
    database.prepare(`SELECT place_id, type, payload_json, created_at FROM activity WHERE actor_id = ?`).bind(user.id),
    database.prepare(`SELECT target_type, target_id, reason, note, status, created_at FROM report WHERE reporter_id = ?`).bind(user.id),
    database.prepare(`SELECT place_id, status, created_at, confirmed_at FROM waitlist WHERE email = ?`).bind(user.email),
    database.prepare(`SELECT place_id, prayer, local_date, geo_verified, distance_m, created_at FROM checkin WHERE user_id = ?`).bind(user.id),
    database.prepare(`SELECT place_id, created_at FROM saved_place WHERE user_id = ?`).bind(user.id),
    database.prepare(`SELECT badge_key, awarded_at FROM user_badge WHERE user_id = ?`).bind(user.id),
    database.prepare(`SELECT place_id, status, evidence, contact, created_at, decided_at FROM steward WHERE user_id = ?`).bind(user.id),
    database.prepare(`SELECT channel, topic, enabled FROM notification_pref WHERE user_id = ?`).bind(user.id),
    database.prepare(`SELECT topic, title, body, created_at, read_at FROM notification WHERE user_id = ? ORDER BY created_at DESC LIMIT 500`).bind(user.id),
  ]);
  const body = {
    exportedAt: new Date().toISOString(),
    user: exportableUser((profile?.results?.[0] as Record<string, unknown>) ?? {}),
    accounts: accounts?.results ?? [],
    proposedValues: candidates?.results ?? [],
    votes: votes?.results ?? [],
    activity: activity?.results ?? [],
    reports: reports?.results ?? [],
    waitlist: waitlist?.results ?? [],
    checkins: checkins?.results ?? [],
    savedPlaces: saved?.results ?? [],
    badges: badges?.results ?? [],
    stewardRequests: stewards?.results ?? [],
    notificationSettings: prefs?.results ?? [],
    notifications: notifications?.results ?? [],
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="mosques-world-${user.username ?? user.id}.json"`,
      "cache-control": "no-store",
    },
  });
}
