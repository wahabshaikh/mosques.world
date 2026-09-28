import { countContinents } from "@/lib/geo/continents";

/**
 * Profile stats and badges (spec P4). `user_place_stat` and `user_stat` are rebuilt from a person's
 * own rows, which keeps every recompute small and idempotent; new badges are returned for toasts.
 */

export type UserStat = {
  places: number;
  countries: number;
  cities: number;
  continents: number;
  jumuahCountries: number;
  fajrPlaces: number;
  verifications: number;
  placesAdded: number;
  photos: number;
};

export type BadgeRule = { trustLevel?: number; stat?: keyof BadgeInputs; min?: number; joinedRank?: number };
export type BadgeRow = { key: string; name: string; description: string; icon: string; rule_json: string };
export type AwardedBadge = { key: string; name: string; description: string; icon: string };

export type BadgeInputs = {
  places: number;
  countries: number;
  continents: number;
  jumuah_countries: number;
  fajr_places: number;
  verifications: number;
  places_added: number;
  photos: number;
  timetables: number;
};

export const EMPTY_STAT: UserStat = {
  places: 0,
  countries: 0,
  cities: 0,
  continents: 0,
  jumuahCountries: 0,
  fajrPlaces: 0,
  verifications: 0,
  placesAdded: 0,
  photos: 0,
};

export function parseRule(json: string): BadgeRule {
  try {
    const rule = JSON.parse(json) as BadgeRule;
    return rule && typeof rule === "object" ? rule : {};
  } catch {
    return {};
  }
}

/** Whether a badge rule holds; `withinFirst` answers "joined within the first N accounts" lazily. */
export function ruleMet(rule: BadgeRule, facts: { inputs: BadgeInputs; trustLevel: number; withinFirst: (n: number) => boolean }): boolean {
  if (rule.trustLevel !== undefined) return facts.trustLevel >= rule.trustLevel;
  if (rule.joinedRank !== undefined) return facts.withinFirst(rule.joinedRank);
  if (rule.stat && rule.min !== undefined) return (facts.inputs[rule.stat] ?? 0) >= rule.min;
  return false;
}

/** Progress text for a locked badge on your own profile ("3 of 5 countries"). */
export function badgeProgress(rule: BadgeRule, inputs: BadgeInputs): string | null {
  if (!rule.stat || rule.min === undefined) return null;
  const nouns: Partial<Record<keyof BadgeInputs, string>> = {
    countries: "countries",
    jumuah_countries: "Jumu'ah countries",
    fajr_places: "Fajr mosques",
    timetables: "timetable photos",
  };
  return `${Math.min(inputs[rule.stat] ?? 0, rule.min)} of ${rule.min} ${nouns[rule.stat] ?? ""}`.trim();
}

type Aggregate = {
  places: number;
  countries: number;
  cities: number;
  jumuah_countries: number;
  fajr_places: number;
  country_list: string | null;
};

type Counts = { verifications: number; places_added: number; photos: number; timetables: number; trust_level: number; created_at: number };

export async function recomputeUserStats(db: D1Database, userId: string, now = Date.now()) {
  const [previousRows, aggregateRows, countRows, badgeRows, earnedRows] = await db.batch([
    db.prepare(`SELECT places, countries, cities, continents FROM user_stat WHERE user_id = ?`).bind(userId),
    db
      .prepare(
        `SELECT COUNT(DISTINCT checkin.place_id) AS places, COUNT(DISTINCT place.country_code) AS countries,
           COUNT(DISTINCT place.country_code || '/' || place.city_slug) AS cities,
           COUNT(DISTINCT CASE WHEN checkin.prayer = 'jumuah' THEN place.country_code END) AS jumuah_countries,
           COUNT(DISTINCT CASE WHEN checkin.prayer = 'fajr' THEN checkin.place_id END) AS fajr_places,
           group_concat(DISTINCT place.country_code) AS country_list
         FROM checkin JOIN place ON place.id = checkin.place_id WHERE checkin.user_id = ?`,
      )
      .bind(userId),
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM activity WHERE actor_id = ?1 AND type = 'confirmed') AS verifications,
           (SELECT COUNT(*) FROM place WHERE created_by = ?1 AND status IN ('active', 'pending', 'closed')) AS places_added,
           (SELECT COUNT(*) FROM photo WHERE uploaded_by = ?1 AND status = 'approved' AND purpose != 'avatar') AS photos,
           (SELECT COUNT(*) FROM photo WHERE uploaded_by = ?1 AND status = 'approved' AND purpose = 'evidence') AS timetables,
           trust_level, created_at
         FROM user WHERE id = ?1`,
      )
      .bind(userId),
    db.prepare(`SELECT key, name, description, icon, rule_json FROM badge`),
    db.prepare(`SELECT badge_key FROM user_badge WHERE user_id = ?`).bind(userId),
  ]);
  const previous = (previousRows?.results?.[0] as { places: number; countries: number; cities: number; continents: number } | undefined) ?? null;
  const aggregate = (aggregateRows?.results?.[0] as Aggregate | undefined) ?? {
    places: 0,
    countries: 0,
    cities: 0,
    jumuah_countries: 0,
    fajr_places: 0,
    country_list: null,
  };
  const counts = countRows?.results?.[0] as Counts | undefined;
  if (!counts) throw new Error(`user ${userId} not found`);
  const countries = (aggregate.country_list ?? "").split(",").filter(Boolean);
  const stat: UserStat = {
    places: aggregate.places,
    countries: aggregate.countries,
    cities: aggregate.cities,
    continents: countContinents(countries),
    jumuahCountries: aggregate.jumuah_countries,
    fajrPlaces: aggregate.fajr_places,
    verifications: counts.verifications,
    placesAdded: counts.places_added,
    photos: counts.photos,
  };
  const inputs: BadgeInputs = {
    places: stat.places,
    countries: stat.countries,
    continents: stat.continents,
    jumuah_countries: stat.jumuahCountries,
    fajr_places: stat.fajrPlaces,
    verifications: stat.verifications,
    places_added: stat.placesAdded,
    photos: stat.photos,
    timetables: counts.timetables,
  };

  const earned = new Set(((earnedRows?.results ?? []) as Array<{ badge_key: string }>).map((row) => row.badge_key));
  const badges = (badgeRows?.results ?? []) as BadgeRow[];
  let joined: boolean | null = null;
  const pending: Array<{ badge: BadgeRow; rule: BadgeRule }> = badges
    .filter((badge) => !earned.has(badge.key))
    .map((badge) => ({ badge, rule: parseRule(badge.rule_json) }));
  // The founding badge needs one indexed lookup; only run it when that badge is still to earn.
  const rankRule = pending.find((item) => item.rule.joinedRank !== undefined);
  if (rankRule?.rule.joinedRank) {
    const beyond = await db
      .prepare(`SELECT 1 AS found FROM user WHERE created_at < ? AND id != 'system' LIMIT 1 OFFSET ?`)
      .bind(counts.created_at, rankRule.rule.joinedRank - 1)
      .first<{ found: number }>();
    joined = !beyond;
  }
  const awarded = pending
    .filter(({ rule }) => ruleMet(rule, { inputs, trustLevel: counts.trust_level, withinFirst: () => joined === true }))
    .map(({ badge }) => ({ key: badge.key, name: badge.name, description: badge.description, icon: badge.icon }));

  await db.batch([
    db.prepare(`DELETE FROM user_place_stat WHERE user_id = ?`).bind(userId),
    db
      .prepare(
        `INSERT INTO user_place_stat (user_id, place_id, first_at, last_at, count)
         SELECT user_id, place_id, MIN(created_at), MAX(created_at), COUNT(*) FROM checkin WHERE user_id = ? GROUP BY place_id`,
      )
      .bind(userId),
    db
      .prepare(
        `INSERT INTO user_stat (user_id, places, countries, cities, continents, jumuah_countries, fajr_places, verifications, places_added, photos, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id) DO UPDATE SET places = excluded.places, countries = excluded.countries, cities = excluded.cities,
           continents = excluded.continents, jumuah_countries = excluded.jumuah_countries, fajr_places = excluded.fajr_places,
           verifications = excluded.verifications, places_added = excluded.places_added, photos = excluded.photos, updated_at = excluded.updated_at`,
      )
      .bind(
        userId,
        stat.places,
        stat.countries,
        stat.cities,
        stat.continents,
        stat.jumuahCountries,
        stat.fajrPlaces,
        stat.verifications,
        stat.placesAdded,
        stat.photos,
        now,
      ),
    ...awarded.map((badge) =>
      db.prepare(`INSERT INTO user_badge (user_id, badge_key, awarded_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`).bind(userId, badge.key, now),
    ),
  ]);

  return {
    stat,
    inputs,
    awarded,
    newCountry: previous !== null ? stat.countries > previous.countries : stat.countries > 0,
    newCity: previous !== null ? stat.cities > previous.cities : stat.cities > 0,
  };
}

export type UserStatsMessage = { kind: "user"; id: string };

export function isUserStatsMessage(body: unknown): body is UserStatsMessage {
  return Boolean(body && typeof body === "object" && (body as UserStatsMessage).kind === "user" && typeof (body as UserStatsMessage).id === "string");
}

/**
 * Stats that change through other flows (votes, photos, places) are refreshed on `q-recompute`.
 * Preview shares queue names with production, so non-production hosts recompute inline.
 */
export async function scheduleUserStats(env: { DB: D1Database; Q_RECOMPUTE?: Queue }, userId: string, inline: boolean) {
  if (env.Q_RECOMPUTE && !inline) {
    await env.Q_RECOMPUTE.send({ kind: "user", id: userId } satisfies UserStatsMessage);
    return;
  }
  await recomputeUserStats(env.DB, userId);
}
