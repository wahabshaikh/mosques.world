/**
 * Hasanat: a symbolic tally of the help someone gave the next worshipper (adding or confirming times,
 * photos, new mosques). It is read straight from the `activity` log, so it needs no table of its own
 * and can never drift from what people actually did. The true reward is with Allah; the copy says so.
 */

/** Hasanat per activity type. Append-only like goal names: changing a weight rewrites every tally. */
export const HASANAT: Record<string, number> = {
  proposed: 25,
  confirmed: 10,
  disputed: 10,
  place_added: 50,
  photo_added: 15,
  special_added: 15,
  prayed: 5,
};

/** What each action is worth, for the "+25 hasanat" hints next to buttons. */
export const REWARD = {
  addTimes: HASANAT.proposed ?? 25,
  confirm: HASANAT.confirmed ?? 10,
  report: HASANAT.disputed ?? 10,
  addPlace: HASANAT.place_added ?? 50,
  photo: HASANAT.photo_added ?? 15,
} as const;

/** SQL expression scoring one `activity` row (`type` column); built from the constant table, never from input. */
export function hasanatCase(column = "type"): string {
  const arms = Object.entries(HASANAT)
    .map(([type, points]) => `WHEN '${type.replace(/[^a-z_]/g, "")}' THEN ${Math.trunc(points)}`)
    .join(" ");
  return `CASE ${column} ${arms} ELSE 0 END`;
}

export type Level = { rank: number; name: string; meaning: string; min: number };

/** Levels named the way the community talks about service to the masjid. */
export const LEVELS: Level[] = [
  { rank: 1, name: "Talib", meaning: "Seeker", min: 0 },
  { rank: 2, name: "Mu'in", meaning: "Helper", min: 50 },
  { rank: 3, name: "Dalil", meaning: "Guide", min: 200 },
  { rank: 4, name: "Khadim", meaning: "Servant of the masjid", min: 500 },
  { rank: 5, name: "Amin", meaning: "Trusted keeper", min: 1500 },
];

export type LevelProgress = { level: Level; next: Level | null; toNext: number; percent: number };

/** Someone's level and how far they are from the next one. */
export function levelFor(points: number): LevelProgress {
  const safe = Math.max(0, Math.floor(points));
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) if (safe >= (LEVELS[i]?.min ?? Infinity)) index = i;
  const level = LEVELS[index] ?? LEVELS[0]!;
  const next = LEVELS[index + 1] ?? null;
  if (!next) return { level, next: null, toNext: 0, percent: 100 };
  const span = next.min - level.min;
  return { level, next, toNext: next.min - safe, percent: Math.round(((safe - level.min) / span) * 100) };
}

export type LeaderRow = { userId: string; username: string; name: string; hasanat: number; actions: number };
export type Period = "week" | "month" | "all";

export function asPeriod(value: string | undefined): Period {
  return value === "month" || value === "all" ? value : "week";
}

/** Start of the leaderboard window (unix ms), or 0 for all time. */
export function periodStart(period: Period, now: number): number {
  if (period === "all") return 0;
  return now - (period === "week" ? 7 : 30) * 24 * 60 * 60 * 1000;
}

/**
 * Top contributors in a window. Only public profiles with a username appear: a private person's help
 * still counts towards their own tally, it just isn't ranked in public.
 */
export async function leaderboard(db: D1Database, options: { since: number; limit?: number }): Promise<LeaderRow[]> {
  const result = await db
    .prepare(
      `SELECT activity.actor_id AS userId, user.username AS username, user.name AS name,
         SUM(${hasanatCase("activity.type")}) AS hasanat, COUNT(*) AS actions
       FROM activity JOIN user ON user.id = activity.actor_id
       WHERE activity.created_at >= ? AND user.username IS NOT NULL AND user.profile_public = 1
         AND user.deleted_at IS NULL AND COALESCE(user.banned, 0) = 0
       GROUP BY activity.actor_id
       HAVING hasanat > 0
       ORDER BY hasanat DESC, MIN(activity.created_at) ASC
       LIMIT ?`,
    )
    .bind(options.since, options.limit ?? 50)
    .all<LeaderRow>();
  return result.results ?? [];
}

/** One person's tally, all time and over the last week. */
export async function userHasanat(db: D1Database, userId: string, now = Date.now()): Promise<{ total: number; week: number }> {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(${hasanatCase()}), 0) AS total,
         COALESCE(SUM(CASE WHEN created_at >= ? THEN ${hasanatCase()} ELSE 0 END), 0) AS week
       FROM activity WHERE actor_id = ?`,
    )
    .bind(periodStart("week", now), userId)
    .first<{ total: number; week: number }>();
  return { total: row?.total ?? 0, week: row?.week ?? 0 };
}

/** How many people have helped at this place, for "You'd be the 4th person to help here". */
export async function placeHelpers(db: D1Database, placeId: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(DISTINCT actor_id) AS n FROM activity WHERE place_id = ? AND actor_id IS NOT NULL AND type != 'prayed'`)
    .bind(placeId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}
