import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { submitValue, type Actor } from "@/lib/trust/store";
import { MergeError, mergePlaces } from "./merge";

const NOW = Date.UTC(2026, 8, 27, 12);
let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

function user(id: string): Actor {
  sqlite.prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 1, 0, 0)`).run(id, id, `${id}@x`);
  return { id, trustLevel: 1, createdAt: 0, role: "user" };
}

function place(id: string, slug: string) {
  sqlite
    .prepare(
      `INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
       VALUES (?, ?, ?, 'mosque', 0, 0, 's00000', 'GB', 'london', 'Europe/London', 'MuslimWorldLeague', 'shafi', 0, 0)`,
    )
    .run(id, slug, slug);
}

function vote(actor: Actor, placeId: string, key: string, value: unknown) {
  return submitValue(d1, { actor, placeId, key, qualifier: "", value, effectiveFrom: "2026-01-01", source: "board", now: NOW });
}

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  place("keep", "keep-mosque");
  place("dupe", "dupe-mosque");
  sqlite.exec(`INSERT INTO place_slug_history (old_slug, place_id, created_at) VALUES ('older-dupe', 'dupe', 0)`);
});

describe("mergePlaces", () => {
  it("carries votes over, combines identical values and redirects slugs", async () => {
    const [a, b, c, d] = [user("a"), user("b"), user("c"), user("d")];
    await vote(a, "keep", "iqamah.asr", { t: "16:30" });
    await vote(b, "dupe", "iqamah.asr", { t: "16:30" });
    await vote(c, "dupe", "iqamah.asr", { t: "16:30" });
    await vote(a, "dupe", "iqamah.asr", { t: "16:30" });
    await vote(d, "dupe", "iqamah.isha", { t: "20:45" });
    await vote(d, "dupe", "amenity.parking", { v: true });
    sqlite.exec(`INSERT INTO photo (id, place_id, purpose, category, status, uploaded_by, created_at) VALUES ('ph', 'dupe', 'place', 'exterior', 'approved', 'a', 0)`);

    const result = await mergePlaces(d1, { sourceId: "dupe", targetId: "keep", moderatorId: "a", now: NOW });
    expect(result).toEqual({ targetSlug: "keep-mosque", sourceSlug: "dupe-mosque" });

    const asr = sqlite
      .prepare(`SELECT fact.state, COUNT(DISTINCT vote.user_id) AS voters FROM fact JOIN fact_candidate ON fact_candidate.fact_id = fact.id JOIN vote ON vote.candidate_id = fact_candidate.id WHERE fact.place_id = 'keep' AND fact.key = 'iqamah.asr'`)
      .get();
    expect(asr).toEqual({ state: "verified", voters: 3 });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id WHERE fact.key = 'iqamah.asr'`).get()).toEqual({ n: 1 });
    expect(sqlite.prepare(`SELECT place_id FROM fact WHERE key = 'iqamah.isha'`).get()).toEqual({ place_id: "keep" });
    expect(sqlite.prepare(`SELECT amenity_bits FROM place WHERE id = 'keep'`).get()).toEqual({ amenity_bits: 16 });
    expect(sqlite.prepare(`SELECT place_id FROM photo WHERE id = 'ph'`).get()).toEqual({ place_id: "keep" });
    expect(sqlite.prepare(`SELECT status, merged_into_id FROM place WHERE id = 'dupe'`).get()).toEqual({ status: "merged", merged_into_id: "keep" });
    expect(sqlite.prepare(`SELECT old_slug, place_id FROM place_slug_history ORDER BY old_slug`).all()).toEqual([
      { old_slug: "dupe-mosque", place_id: "keep" },
      { old_slug: "older-dupe", place_id: "keep" },
    ]);
    expect(sqlite.prepare(`SELECT action FROM audit_log WHERE action = 'merge_place'`).get()).toEqual({ action: "merge_place" });
    await expect(mergePlaces(d1, { sourceId: "dupe", targetId: "keep", moderatorId: "a", now: NOW })).rejects.toThrow("already merged");
    await expect(mergePlaces(d1, { sourceId: "keep", targetId: "dupe", moderatorId: "a", now: NOW })).rejects.toThrow("merged into another place");
  });

  it("keeps one current value when both places had different ones", async () => {
    const [a, b] = [user("a"), user("b")];
    await vote(a, "keep", "iqamah.fajr", { t: "05:45" });
    await vote(b, "dupe", "iqamah.fajr", { t: "06:00" });
    await vote(b, "dupe", "iqamah.maghrib", { rule: "after_adhan", min: 5 });
    await mergePlaces(d1, { sourceId: "dupe", targetId: "keep", moderatorId: "a", now: NOW });
    const statuses = sqlite
      .prepare(`SELECT fact_candidate.status FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id WHERE fact.key = 'iqamah.fajr' ORDER BY fact_candidate.status`)
      .all();
    expect(statuses).toEqual([{ status: "candidate" }, { status: "current" }]);
  });

  it("refuses bad pairs", async () => {
    await expect(mergePlaces(d1, { sourceId: "keep", targetId: "keep", moderatorId: "a", now: NOW })).rejects.toThrow(MergeError);
    await expect(mergePlaces(d1, { sourceId: "nope", targetId: "keep", moderatorId: "a", now: NOW })).rejects.toThrow("not found");
  });
});
