import { CHECKIN_PRAYER_LABELS, type CheckinPrayer, type CheckinVisibility } from "@/lib/checkins";
import { countryName } from "@/lib/utils";
import { badgeProgress, EMPTY_STAT, parseRule, type BadgeInputs, type UserStat } from "@/lib/profile/stats";

/** Read side of `/@username` (spec P4). Everything here is bounded by per-user indexes. */

export type ProfileUser = {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  homeCityLabel: string | null;
  trustLevel: number;
  profilePublic: boolean;
  checkinsVisibility: CheckinVisibility;
  avatarKey: string | null;
  createdAt: number;
  emailVerified: boolean;
};

type UserRow = {
  id: string;
  username: string;
  name: string;
  bio: string | null;
  home_city_label: string | null;
  trust_level: number;
  profile_public: number;
  checkins_visibility: string;
  avatar_key: string | null;
  created_at: number;
  email_verified: number;
};

function asVisibility(value: string): CheckinVisibility {
  return value === "countries" || value === "private" ? value : "public";
}

/** The profile for a username, or the current username when it was renamed (for a 308). */
export async function findProfile(db: D1Database, username: string): Promise<{ user: ProfileUser } | { redirect: string } | null> {
  const handle = username.toLowerCase();
  const row = await db
    .prepare(
      `SELECT id, username, name, bio, home_city_label, trust_level, profile_public, checkins_visibility, avatar_key, created_at, email_verified
       FROM user WHERE username = ? AND deleted_at IS NULL AND banned IS NOT 1 AND id != 'system'`,
    )
    .bind(handle)
    .first<UserRow>();
  if (row) {
    return {
      user: {
        id: row.id,
        username: row.username,
        name: row.name,
        bio: row.bio,
        homeCityLabel: row.home_city_label,
        trustLevel: row.trust_level,
        profilePublic: row.profile_public !== 0,
        checkinsVisibility: asVisibility(row.checkins_visibility),
        avatarKey: row.avatar_key,
        createdAt: row.created_at,
        emailVerified: row.email_verified !== 0,
      },
    };
  }
  const renamed = await db
    .prepare(
      `SELECT user.username FROM username_history JOIN user ON user.id = username_history.user_id
       WHERE username_history.old_username = ? AND user.deleted_at IS NULL AND user.username IS NOT NULL`,
    )
    .bind(handle)
    .first<{ username: string }>();
  return renamed ? { redirect: renamed.username } : null;
}

export type MapFilter = "all" | "year" | "jumuah";

export function asMapFilter(value: string | undefined): MapFilter {
  return value === "year" || value === "jumuah" ? value : "all";
}

export type ProfilePin = { id: string; slug: string; name: string; lat: number; lng: number; country: string; count: number };

export async function profilePins(db: D1Database, userId: string, filter: MapFilter, year: string): Promise<ProfilePin[]> {
  const where = filter === "year" ? `AND substr(checkin.local_date, 1, 4) = ?2` : filter === "jumuah" ? `AND checkin.prayer = 'jumuah'` : "";
  const statement = db.prepare(
    `SELECT place.id, place.slug, place.name, place.lat, place.lng, place.country_code AS country, COUNT(*) AS count
     FROM checkin JOIN place ON place.id = checkin.place_id
     WHERE checkin.user_id = ?1 ${where}
     GROUP BY place.id ORDER BY count DESC, place.name LIMIT 2000`,
  );
  const rows = await (filter === "year" ? statement.bind(userId, year) : statement.bind(userId)).all<ProfilePin>();
  return rows.results ?? [];
}

export function pinTotals(pins: ProfilePin[]) {
  return { places: pins.length, countries: new Set(pins.map((pin) => pin.country)).size };
}

export type RecentVisit = { slug: string; name: string; locality: string | null; country: string; prayer: string; localDate: string };

export async function recentVisits(db: D1Database, userId: string, limit = 6): Promise<RecentVisit[]> {
  const rows = await db
    .prepare(
      `SELECT place.slug, place.name, place.locality, place.country_code AS country, checkin.prayer, MAX(checkin.local_date) AS local_date
       FROM checkin JOIN place ON place.id = checkin.place_id
       WHERE checkin.user_id = ? GROUP BY checkin.place_id ORDER BY local_date DESC, MAX(checkin.created_at) DESC LIMIT ?`,
    )
    .bind(userId, limit)
    .all<{ slug: string; name: string; locality: string | null; country: string; prayer: string; local_date: string }>();
  return (rows.results ?? []).map((row) => ({
    slug: row.slug,
    name: row.name,
    locality: row.locality,
    country: row.country,
    prayer: row.prayer,
    localDate: row.local_date,
  }));
}

export async function visitedCountries(db: D1Database, userId: string): Promise<string[]> {
  const rows = await db
    .prepare(`SELECT DISTINCT place.country_code AS country FROM checkin JOIN place ON place.id = checkin.place_id WHERE checkin.user_id = ? ORDER BY country`)
    .bind(userId)
    .all<{ country: string }>();
  return (rows.results ?? []).map((row) => row.country);
}

export async function userStat(db: D1Database, userId: string): Promise<UserStat> {
  const row = await db
    .prepare(
      `SELECT places, countries, cities, continents, jumuah_countries, fajr_places, verifications, places_added, photos FROM user_stat WHERE user_id = ?`,
    )
    .bind(userId)
    .first<{
      places: number;
      countries: number;
      cities: number;
      continents: number;
      jumuah_countries: number;
      fajr_places: number;
      verifications: number;
      places_added: number;
      photos: number;
    }>();
  if (!row) return EMPTY_STAT;
  return {
    places: row.places,
    countries: row.countries,
    cities: row.cities,
    continents: row.continents,
    jumuahCountries: row.jumuah_countries,
    fajrPlaces: row.fajr_places,
    verifications: row.verifications,
    placesAdded: row.places_added,
    photos: row.photos,
  };
}

/** The city a person prays in most (by check-ins), for the About section. */
export async function mostPrayedIn(db: D1Database, userId: string): Promise<string | null> {
  const row = await db
    .prepare(
      `SELECT city.name AS city, place.country_code AS country, COUNT(*) AS n FROM checkin
       JOIN place ON place.id = checkin.place_id
       LEFT JOIN city ON city.country_code = place.country_code AND city.city_slug = place.city_slug
       WHERE checkin.user_id = ? GROUP BY place.country_code, place.city_slug ORDER BY n DESC LIMIT 1`,
    )
    .bind(userId)
    .first<{ city: string | null; country: string }>();
  if (!row) return null;
  return row.city ?? countryName(row.country);
}

export type BadgeView = { key: string; name: string; description: string; icon: string; earned: boolean; progress: string | null };

export async function profileBadges(db: D1Database, userId: string, stat: UserStat, includeLocked: boolean): Promise<BadgeView[]> {
  const rows = await db
    .prepare(
      `SELECT badge.key, badge.name, badge.description, badge.icon, badge.rule_json, user_badge.awarded_at
       FROM badge LEFT JOIN user_badge ON user_badge.badge_key = badge.key AND user_badge.user_id = ?
       ORDER BY user_badge.awarded_at IS NULL, user_badge.awarded_at, badge.rowid`,
    )
    .bind(userId)
    .all<{ key: string; name: string; description: string; icon: string; rule_json: string; awarded_at: number | null }>();
  const inputs: BadgeInputs = {
    places: stat.places,
    countries: stat.countries,
    continents: stat.continents,
    jumuah_countries: stat.jumuahCountries,
    fajr_places: stat.fajrPlaces,
    verifications: stat.verifications,
    places_added: stat.placesAdded,
    photos: stat.photos,
    timetables: 0,
  };
  const views = (rows.results ?? []).map((row) => ({
    key: row.key,
    name: row.name,
    description: row.description,
    icon: row.icon,
    earned: row.awarded_at !== null,
    progress: row.awarded_at === null ? badgeProgress(parseRule(row.rule_json), inputs) : null,
  }));
  // Only the next Globetrotter tier is shown while locked, so the grid stays short.
  const lockedTiers = new Set<string>();
  return views.filter((badge) => {
    if (badge.earned) return true;
    if (!includeLocked) return false;
    if (badge.key.startsWith("globetrotter")) {
      if (lockedTiers.has("globetrotter")) return false;
      lockedTiers.add("globetrotter");
    }
    return true;
  });
}

export const CONTRIBUTION_FILTERS = {
  all: { label: "All", types: ["confirmed", "proposed", "promoted", "reverted", "place_added", "place_confirmed", "photo_added"] },
  verifications: { label: "Verifications", types: ["confirmed"] },
  timings: { label: "Timing updates", types: ["proposed", "promoted", "reverted"] },
  places: { label: "Places", types: ["place_added", "place_confirmed"] },
  photos: { label: "Photos", types: ["photo_added"] },
} as const;

export type ContributionFilter = keyof typeof CONTRIBUTION_FILTERS;

export function asContributionFilter(value: string | undefined): ContributionFilter {
  return value && value in CONTRIBUTION_FILTERS ? (value as ContributionFilter) : "all";
}

export type ContributionRow = {
  id: string;
  type: string;
  payload: { key?: string; qualifier?: string; value?: unknown; held?: boolean; replaced?: boolean };
  placeSlug: string | null;
  placeName: string | null;
  createdAt: number;
};

export async function contributionCounts(db: D1Database, userId: string): Promise<Record<ContributionFilter, number>> {
  const rows = await db
    .prepare(`SELECT type, COUNT(*) AS n FROM activity WHERE actor_id = ? AND type != 'prayed' GROUP BY type`)
    .bind(userId)
    .all<{ type: string; n: number }>();
  const byType = new Map((rows.results ?? []).map((row) => [row.type, row.n]));
  const counts = {} as Record<ContributionFilter, number>;
  for (const [key, filter] of Object.entries(CONTRIBUTION_FILTERS) as Array<[ContributionFilter, (typeof CONTRIBUTION_FILTERS)[ContributionFilter]]>) {
    counts[key] = filter.types.reduce((total, type) => total + (byType.get(type) ?? 0), 0);
  }
  return counts;
}

export async function contributions(db: D1Database, userId: string, filter: ContributionFilter, limit: number): Promise<ContributionRow[]> {
  const types = CONTRIBUTION_FILTERS[filter].types;
  const rows = await db
    .prepare(
      `SELECT activity.id, activity.type, activity.payload_json, activity.created_at, place.slug, place.name
       FROM activity LEFT JOIN place ON place.id = activity.place_id
       WHERE activity.actor_id = ? AND activity.type IN (${types.map(() => "?").join(", ")})
       ORDER BY activity.created_at DESC LIMIT ?`,
    )
    .bind(userId, ...types, limit)
    .all<{ id: string; type: string; payload_json: string; created_at: number; slug: string | null; name: string | null }>();
  return (rows.results ?? []).map((row) => {
    let payload: ContributionRow["payload"] = {};
    try {
      payload = JSON.parse(row.payload_json) as ContributionRow["payload"];
    } catch {
      payload = {};
    }
    return { id: row.id, type: row.type, payload, placeSlug: row.slug, placeName: row.name, createdAt: row.created_at };
  });
}

export function prayerLabel(prayer: string): string {
  return CHECKIN_PRAYER_LABELS[prayer as CheckinPrayer] ?? "Prayed";
}

/** "37 mosques. 16 countries." */
export function mapHeadline(places: number, countries: number): string {
  return `${places} ${places === 1 ? "mosque" : "mosques"}. ${countries} ${countries === 1 ? "country" : "countries"}.`;
}

/** "1.5 · Years on mosques.world", or months during the first year. */
export function tenure(createdAt: number, now: number): { value: string; label: string } {
  const years = (now - createdAt) / (365.25 * 24 * 60 * 60 * 1000);
  if (years < 1) {
    const months = Math.max(1, Math.floor(years * 12));
    return { value: String(months), label: months === 1 ? "Month on mosques.world" : "Months on mosques.world" };
  }
  const value = years < 10 ? (Math.floor(years * 10) / 10).toString() : Math.floor(years).toString();
  return { value, label: value === "1" ? "Year on mosques.world" : "Years on mosques.world" };
}
