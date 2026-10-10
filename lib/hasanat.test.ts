import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { asPeriod, hasanatCase, leaderboard, levelFor, LEVELS, periodStart, placeHelpers, REWARD, userHasanat } from "./hasanat";

const NOW = Date.UTC(2026, 9, 10, 12);
const DAY = 24 * 60 * 60 * 1000;
let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

function addUser(id: string, options: { username?: string | null; isPublic?: boolean; deleted?: boolean } = {}) {
  sqlite
    .prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, username, profile_public, deleted_at) VALUES (?, ?, ?, 1, 0, 0, ?, ?, ?)`)
    .run(id, `Name ${id}`, `${id}@x`, options.username === undefined ? id : options.username, options.isPublic === false ? 0 : 1, options.deleted ? 1 : null);
}

let seq = 0;
function act(actor: string, type: string, at = NOW - 1000, place = "p1") {
  seq += 1;
  sqlite.prepare(`INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, '{}', ?)`).run(`a${seq}`, actor, place, type, at);
}

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  for (const id of ["p1", "p2"]) {
    sqlite
      .prepare(
        `INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
         VALUES (?, ?, ?, 'mosque', 10, 10, 's00000', 'GB', 'london', 'UTC', 'MuslimWorldLeague', 'shafi', 0, 0)`,
      )
      .run(id, id, id);
  }
});

describe("levelFor", () => {
  it("starts everyone as a seeker", () => {
    expect(levelFor(0).level.meaning).toBe("Seeker");
    expect(levelFor(-5).level.rank).toBe(1);
  });

  it("reports progress to the next level", () => {
    const progress = levelFor(125);
    expect(progress.level.name).toBe("Mu'in");
    expect(progress.next?.name).toBe("Dalil");
    expect(progress.toNext).toBe(75);
    expect(progress.percent).toBe(50);
  });

  it("caps at the top level", () => {
    const top = LEVELS[LEVELS.length - 1]!;
    expect(levelFor(top.min + 999)).toEqual({ level: top, next: null, toNext: 0, percent: 100 });
  });
});

describe("periods", () => {
  it("defaults to this week", () => {
    expect(asPeriod(undefined)).toBe("week");
    expect(asPeriod("all")).toBe("all");
    expect(asPeriod("month")).toBe("month");
    expect(periodStart("all", NOW)).toBe(0);
    expect(periodStart("week", NOW)).toBe(NOW - 7 * DAY);
    expect(periodStart("month", NOW)).toBe(NOW - 30 * DAY);
  });
});

describe("hasanatCase", () => {
  it("scores only known activity types", () => {
    expect(hasanatCase()).toContain("WHEN 'proposed' THEN 25");
    expect(hasanatCase("activity.type")).toMatch(/^CASE activity\.type /);
    expect(REWARD.addTimes).toBeGreaterThan(REWARD.confirm);
  });
});

describe("leaderboard and tallies", () => {
  beforeEach(() => {
    addUser("amina");
    addUser("bilal");
    addUser("hidden", { isPublic: false });
    addUser("nouser", { username: null });
    addUser("gone", { deleted: true });
    act("amina", "proposed");
    act("amina", "confirmed");
    act("bilal", "confirmed");
    act("bilal", "place_added", NOW - 20 * DAY);
    act("hidden", "proposed");
    act("nouser", "proposed");
    act("gone", "proposed");
    act("amina", "promoted");
  });

  it("ranks public profiles by hasanat in the window", async () => {
    const week = await leaderboard(d1, { since: periodStart("week", NOW) });
    expect(week.map((row) => [row.username, row.hasanat])).toEqual([
      ["amina", 35],
      ["bilal", 10],
    ]);
    const all = await leaderboard(d1, { since: 0 });
    expect(all[0]).toMatchObject({ username: "bilal", hasanat: 60, actions: 2 });
  });

  it("counts a private person's help towards their own tally", async () => {
    expect(await userHasanat(d1, "hidden", NOW)).toEqual({ total: 25, week: 25 });
    expect(await userHasanat(d1, "bilal", NOW)).toEqual({ total: 60, week: 10 });
    expect(await userHasanat(d1, "nobody", NOW)).toEqual({ total: 0, week: 0 });
  });

  it("counts distinct helpers at a place", async () => {
    act("amina", "prayed", NOW, "p2");
    expect(await placeHelpers(d1, "p1")).toBe(5);
    expect(await placeHelpers(d1, "p2")).toBe(0);
  });
});
