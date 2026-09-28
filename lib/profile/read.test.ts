import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { landSvgPath, pinSize, project, viewBoxFor, WORLD_VIEW } from "./map";
import {
  asContributionFilter,
  asMapFilter,
  contributionCounts,
  contributions,
  findProfile,
  mapHeadline,
  mostPrayedIn,
  pinTotals,
  profileBadges,
  profilePins,
  recentVisits,
  tenure,
  userStat,
  visitedCountries,
} from "./read";
import { recomputeUserStats } from "./stats";

const NOW = Date.UTC(2026, 8, 25, 12);
let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

function addPlace(id: string, country: string, city: string, lat: number, lng: number) {
  sqlite
    .prepare(
      `INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, locality, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
       VALUES (?, ?, ?, 'mosque', ?, ?, 's00000', ?, ?, ?, 'UTC', 'MuslimWorldLeague', 'shafi', 0, 0)`,
    )
    .run(id, `${id}-slug`, `Mosque ${id}`, lat, lng, city, country, city);
}

let seq = 0;
function checkin(place: string, prayer: string, date: string) {
  seq += 1;
  sqlite
    .prepare(`INSERT INTO checkin (id, user_id, place_id, prayer, local_date, created_at) VALUES (?, 'u1', ?, ?, ?, ?)`)
    .run(`c${seq}`, place, prayer, date, NOW + seq);
}

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  sqlite
    .prepare(
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, username, bio, checkins_visibility) VALUES ('u1', 'Amina Khan', 'a@x', 1, ?, 0, 'amina', 'Hello', 'countries')`,
    )
    .run(NOW - 400 * 24 * 60 * 60 * 1000);
  sqlite.exec(`INSERT INTO city (country_code, city_slug, name, lat, lng, place_count) VALUES ('GB', 'london', 'London', 51.5, -0.1, 2)`);
  addPlace("gb1", "GB", "london", 51.5, -0.1);
  addPlace("gb2", "GB", "london", 51.52, -0.07);
  addPlace("tr1", "TR", "istanbul", 41, 29);
  checkin("gb1", "fajr", "2026-09-20");
  checkin("gb1", "asr", "2026-09-21");
  checkin("gb2", "jumuah", "2025-05-02");
  checkin("tr1", "jumuah", "2026-01");
});

describe("findProfile", () => {
  it("finds users case-insensitively and follows renamed usernames", async () => {
    const found = await findProfile(d1, "Amina");
    expect(found && "user" in found ? found.user : null).toMatchObject({ username: "amina", checkinsVisibility: "countries", profilePublic: true });
    sqlite.exec(`INSERT INTO username_history (old_username, user_id, created_at) VALUES ('amina_old', 'u1', 0)`);
    expect(await findProfile(d1, "amina_old")).toEqual({ redirect: "amina" });
    expect(await findProfile(d1, "nobody")).toBeNull();
    expect(await findProfile(d1, "mosques.world")).toBeNull();
  });
});

describe("profile reads", () => {
  it("returns pins with visit counts and filters by year and Jumu'ah", async () => {
    const all = await profilePins(d1, "u1", "all", "2026");
    expect(all.map((pin) => [pin.id, pin.count])).toEqual([
      ["gb1", 2],
      ["gb2", 1],
      ["tr1", 1],
    ]);
    expect(pinTotals(all)).toEqual({ places: 3, countries: 2 });
    expect((await profilePins(d1, "u1", "year", "2026")).map((pin) => pin.id).sort()).toEqual(["gb1", "tr1"]);
    expect((await profilePins(d1, "u1", "jumuah", "2026")).map((pin) => pin.id).sort()).toEqual(["gb2", "tr1"]);
  });

  it("lists recent places, countries and the most-prayed city", async () => {
    expect((await recentVisits(d1, "u1")).map((visit) => [visit.slug, visit.localDate, visit.prayer])).toEqual([
      ["gb1-slug", "2026-09-21", "asr"],
      ["tr1-slug", "2026-01", "jumuah"],
      ["gb2-slug", "2025-05-02", "jumuah"],
    ]);
    expect(await visitedCountries(d1, "u1")).toEqual(["GB", "TR"]);
    expect(await mostPrayedIn(d1, "u1")).toBe("London");
    sqlite.exec(`DELETE FROM checkin WHERE place_id != 'tr1'`);
    expect(await mostPrayedIn(d1, "u1")).toMatch(/^(Turkey|Türkiye)$/);
    sqlite.exec(`DELETE FROM checkin`);
    expect(await mostPrayedIn(d1, "u1")).toBeNull();
  });

  it("reads stats and badges, with locked progress only when asked", async () => {
    expect(await userStat(d1, "u1")).toMatchObject({ places: 0 });
    const { stat } = await recomputeUserStats(d1, "u1", NOW);
    expect(await userStat(d1, "u1")).toEqual(stat);
    const earned = await profileBadges(d1, "u1", stat, false);
    expect(earned.map((badge) => badge.key)).toEqual(["founding_contributor"]);
    const withLocked = await profileBadges(d1, "u1", stat, true);
    expect(withLocked.filter((badge) => badge.key.startsWith("globetrotter")).map((badge) => badge.key)).toEqual(["globetrotter_5"]);
    expect(withLocked.find((badge) => badge.key === "globetrotter_5")?.progress).toBe("2 of 5 countries");
  });

  it("counts and lists contributions by filter", async () => {
    sqlite.exec(`INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at) VALUES
      ('a1', 'u1', 'gb1', 'confirmed', '{"key":"iqamah.asr","value":{"t":"16:30"}}', 3),
      ('a2', 'u1', 'gb1', 'photo_added', '{}', 2),
      ('a3', 'u1', 'gb1', 'prayed', '{"prayer":"asr"}', 4),
      ('a4', 'u1', NULL, 'place_added', 'not json', 1)`);
    const counts = await contributionCounts(d1, "u1");
    expect(counts).toEqual({ all: 3, verifications: 1, timings: 0, places: 1, photos: 1 });
    const rows = await contributions(d1, "u1", "all", 10);
    expect(rows.map((row) => row.type)).toEqual(["confirmed", "photo_added", "place_added"]);
    expect(rows[0]).toMatchObject({ placeSlug: "gb1-slug", payload: { key: "iqamah.asr" } });
    expect(rows[2]?.payload).toEqual({});
    expect((await contributions(d1, "u1", "photos", 10)).map((row) => row.id)).toEqual(["a2"]);
  });
});

describe("formatting", () => {
  it("formats headlines, tenure and filters", () => {
    expect(mapHeadline(3, 2)).toBe("3 mosques. 2 countries.");
    expect(mapHeadline(1, 1)).toBe("1 mosque. 1 country.");
    expect(tenure(NOW - 400 * 24 * 60 * 60 * 1000, NOW)).toEqual({ value: "1", label: "Year on mosques.world" });
    expect(tenure(NOW - 548 * 24 * 60 * 60 * 1000, NOW)).toEqual({ value: "1.5", label: "Years on mosques.world" });
    expect(tenure(NOW - 12 * 365.25 * 24 * 60 * 60 * 1000, NOW).value).toBe("12");
    expect(tenure(NOW - 1000, NOW)).toEqual({ value: "1", label: "Month on mosques.world" });
    expect(tenure(NOW - 70 * 24 * 60 * 60 * 1000, NOW)).toEqual({ value: "2", label: "Months on mosques.world" });
    expect(asMapFilter("jumuah")).toBe("jumuah");
    expect(asMapFilter("nope")).toBe("all");
    expect(asContributionFilter("photos")).toBe("photos");
    expect(asContributionFilter(undefined)).toBe("all");
  });
});

describe("map geometry", () => {
  it("projects equirectangularly and frames pins inside the world", () => {
    expect(project(0, 0)).toEqual({ x: 500, y: 250 });
    expect(project(90, -180)).toEqual({ x: 0, y: 0 });
    expect(viewBoxFor([])).toBe(WORLD_VIEW);
    const box = viewBoxFor([
      { lat: 51.5, lng: -0.1 },
      { lat: 41, lng: 29 },
    ]);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.width / box.height).toBeCloseTo(2.2, 1);
    expect(box.x + box.width).toBeLessThanOrEqual(1000);
    const world = viewBoxFor([
      { lat: 70, lng: -170 },
      { lat: -50, lng: 170 },
    ]);
    expect(world.width).toBe(1000);
    expect(pinSize(1).dot).toBeLessThan(pinSize(50).dot);
    expect(pinSize(50)).toEqual(pinSize(12));
    expect(landSvgPath().startsWith("M")).toBe(true);
    expect(landSvgPath()).toBe(landSvgPath());
  });
});
