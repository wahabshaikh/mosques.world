import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { countContinents, continentOf } from "@/lib/geo/continents";
import { badgeProgress, isUserStatsMessage, parseRule, recomputeUserStats, ruleMet, scheduleUserStats } from "./stats";

const NOW = Date.UTC(2026, 8, 25, 12);
let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

function addUser(id: string, createdAt = 1, trust = 0) {
  sqlite
    .prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, trust_level) VALUES (?, ?, ?, 1, ?, 0, ?)`)
    .run(id, id, `${id}@x`, createdAt, trust);
}

function addPlace(id: string, country: string, city: string) {
  sqlite
    .prepare(
      `INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
       VALUES (?, ?, ?, 'mosque', 10, 10, 's00000', ?, ?, 'UTC', 'MuslimWorldLeague', 'shafi', 0, 0)`,
    )
    .run(id, id, id, country, city);
}

let seq = 0;
function checkin(user: string, place: string, prayer: string, date = "2026-09-25") {
  seq += 1;
  sqlite
    .prepare(`INSERT INTO checkin (id, user_id, place_id, prayer, local_date, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(`c${seq}`, user, place, prayer, date, NOW + seq);
}

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  addUser("u1");
  addPlace("gb1", "GB", "london");
  addPlace("gb2", "GB", "london");
  addPlace("tr1", "TR", "istanbul");
  addPlace("sa1", "SA", "makkah");
  addPlace("id1", "ID", "jakarta");
  addPlace("ca1", "CA", "toronto");
});

describe("recomputeUserStats", () => {
  it("counts places, countries, cities, continents and Jumu'ah/Fajr", async () => {
    checkin("u1", "gb1", "fajr");
    checkin("u1", "gb1", "asr");
    checkin("u1", "gb2", "jumuah");
    checkin("u1", "tr1", "jumuah");
    const result = await recomputeUserStats(d1, "u1", NOW);
    expect(result.stat).toMatchObject({ places: 3, countries: 2, cities: 2, continents: 2, jumuahCountries: 2, fajrPlaces: 1 });
    expect(result.newCountry).toBe(true);
    expect(sqlite.prepare(`SELECT place_id, count FROM user_place_stat ORDER BY place_id`).all()).toEqual([
      { place_id: "gb1", count: 2 },
      { place_id: "gb2", count: 1 },
      { place_id: "tr1", count: 1 },
    ]);

    checkin("u1", "gb2", "asr");
    const again = await recomputeUserStats(d1, "u1", NOW);
    expect(again.newCountry).toBe(false);
    expect(again.newCity).toBe(false);
    checkin("u1", "sa1", "isha");
    expect((await recomputeUserStats(d1, "u1", NOW)).newCountry).toBe(true);
  });

  it("awards badges once, including Globetrotter and Jumu'ah traveller", async () => {
    for (const place of ["gb1", "tr1", "sa1", "id1", "ca1"]) checkin("u1", place, "jumuah");
    const first = await recomputeUserStats(d1, "u1", NOW);
    expect(first.awarded.map((badge) => badge.key).sort()).toEqual(["founding_contributor", "globetrotter_5", "jumuah_traveller"]);
    const second = await recomputeUserStats(d1, "u1", NOW);
    expect(second.awarded).toEqual([]);
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM user_badge WHERE user_id = 'u1'`).get()).toEqual({ n: 3 });
  });

  it("counts contributions and awards trust and timetable badges", async () => {
    addUser("t1", 5, 2);
    sqlite.exec(`INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at) VALUES ('a1', 't1', 'gb1', 'confirmed', '{}', 0), ('a2', 't1', 'gb1', 'confirmed', '{}', 0)`);
    sqlite.exec(`UPDATE place SET created_by = 't1' WHERE id IN ('gb1', 'tr1')`);
    for (const id of ["e1", "e2", "e3"]) {
      sqlite.exec(`INSERT INTO photo (id, place_id, purpose, category, status, uploaded_by, created_at) VALUES ('${id}', 'gb1', 'evidence', 'timetable', 'approved', 't1', 0)`);
    }
    sqlite.exec(`INSERT INTO photo (id, place_id, purpose, category, status, uploaded_by, created_at) VALUES ('av', NULL, 'avatar', 'other', 'approved', 't1', 0)`);
    const result = await recomputeUserStats(d1, "t1", NOW);
    expect(result.stat).toMatchObject({ verifications: 2, placesAdded: 2, photos: 3, places: 0 });
    expect(result.awarded.map((badge) => badge.key).sort()).toEqual(["founding_contributor", "timetable_keeper", "trusted_verifier"]);
  });

  it("only gives the founding badge to the first 1,000 accounts", async () => {
    const insert = sqlite.prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, 'x', ?, 0, ?, 0)`);
    for (let index = 0; index < 1000; index += 1) insert.run(`early${index}`, `early${index}@x`, 10 + index);
    addUser("late", 5000);
    // u1 plus early0…early998 make early998 the 1,000th account and early999 the 1,001st.
    expect((await recomputeUserStats(d1, "early999", NOW)).awarded.map((badge) => badge.key)).not.toContain("founding_contributor");
    expect((await recomputeUserStats(d1, "late", NOW)).awarded.map((badge) => badge.key)).not.toContain("founding_contributor");
    expect((await recomputeUserStats(d1, "early998", NOW)).awarded.map((badge) => badge.key)).toContain("founding_contributor");
  });

  it("fails for a missing user so the queue retries", async () => {
    await expect(recomputeUserStats(d1, "ghost", NOW)).rejects.toThrow("not found");
  });
});

describe("badge rules", () => {
  const inputs = { places: 3, countries: 3, continents: 2, jumuah_countries: 1, fajr_places: 2, verifications: 0, places_added: 0, photos: 0, timetables: 0 };
  it("parses rules defensively", () => {
    expect(parseRule("{bad")).toEqual({});
    expect(parseRule('{"stat":"countries","min":5}')).toEqual({ stat: "countries", min: 5 });
  });
  it("evaluates each rule kind and reports progress", () => {
    expect(ruleMet({ stat: "countries", min: 3 }, { inputs, trustLevel: 0, withinFirst: () => false })).toBe(true);
    expect(ruleMet({ trustLevel: 2 }, { inputs, trustLevel: 1, withinFirst: () => true })).toBe(false);
    expect(ruleMet({ joinedRank: 10 }, { inputs, trustLevel: 0, withinFirst: () => true })).toBe(true);
    expect(ruleMet({}, { inputs, trustLevel: 3, withinFirst: () => true })).toBe(false);
    expect(badgeProgress({ stat: "countries", min: 5 }, inputs)).toBe("3 of 5 countries");
    expect(badgeProgress({ stat: "places", min: 5 }, inputs)).toBe("3 of 5");
    expect(badgeProgress({ trustLevel: 2 }, inputs)).toBeNull();
  });
});

describe("scheduleUserStats", () => {
  it("queues in production and recomputes inline elsewhere", async () => {
    const send = vi.fn(async () => undefined);
    await scheduleUserStats({ DB: d1, Q_RECOMPUTE: { send } as unknown as Queue }, "u1", false);
    expect(send).toHaveBeenCalledWith({ kind: "user", id: "u1" });
    expect(isUserStatsMessage({ kind: "user", id: "u1" })).toBe(true);
    expect(isUserStatsMessage({ kind: "facts", ids: [] })).toBe(false);
    checkin("u1", "gb1", "asr");
    await scheduleUserStats({ DB: d1, Q_RECOMPUTE: { send } as unknown as Queue }, "u1", true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(sqlite.prepare(`SELECT places FROM user_stat WHERE user_id = 'u1'`).get()).toEqual({ places: 1 });
  });
});

describe("continents", () => {
  it("maps countries to continents", () => {
    expect(continentOf("gb")).toBe("europe");
    expect(continentOf("ZZ")).toBeNull();
    expect(countContinents(["GB", "FR", "TR", "SA", "ZZ", "BR"])).toBe(3);
  });
});
