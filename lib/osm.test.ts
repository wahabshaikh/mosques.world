import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { osmPlaceRow, overpassQuery, syncCity, weeklyOsmSync, type OsmElement } from "./osm";

let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

const elements: OsmElement[] = [
  { type: "node", id: 1, lat: 51.51, lon: -0.07, tags: { name: "Known Mosque" } },
  { type: "way", id: 2, center: { lat: 51.52, lon: -0.08 }, tags: { name: "Masjid Ar-Rahman", "name:en": "Rahman Mosque", wheelchair: "yes", "addr:suburb": "Bow" } },
  { type: "node", id: 3, lat: 51.53, lon: -0.09, tags: { name: "Station Prayer Room", wheelchair: "no" } },
  { type: "node", id: 4, lat: 51.53, lon: -0.09, tags: {} },
];

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  sqlite.exec(`INSERT INTO city (country_code, city_slug, name, lat, lng) VALUES ('GB', 'london', 'London', 51.5, -0.1), ('GB', 'leeds', 'Leeds', 53.8, -1.5)`);
  sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, osm_type, osm_id, created_at, updated_at)
    VALUES ('k', 'known-mosque-london', 'Known Mosque (community name)', 'mosque', 51.5, -0.1, 'gcpvj0', 'GB', 'london', 'Europe/London', 'MoonsightingCommittee', 'hanafi', 'node', 1, 0, 0)`);
});

describe("osm", () => {
  it("normalises elements", () => {
    const taken = new Set<string>(["rahman-mosque-bow"]);
    const row = osmPlaceRow(elements[1]!, { country: "GB", citySlug: "london", cityName: "London", taken, now: 1 });
    expect(row).toMatchObject({ name: "Rahman Mosque", nameLocal: "Masjid Ar-Rahman", slug: "rahman-mosque-bow-2", kind: "mosque", timezone: "Europe/London", wheelchair: "yes" });
    expect(osmPlaceRow(elements[2]!, { country: "GB", citySlug: "london", cityName: "London", taken, now: 1 })?.kind).toBe("prayer_room");
    expect(osmPlaceRow(elements[3]!, { country: "GB", citySlug: "london", cityName: "London", taken, now: 1 })).toBeNull();
    expect(osmPlaceRow({ type: "node", id: 9, tags: { name: "No location" } }, { country: "GB", citySlug: "l", cityName: "L", taken, now: 1 })).toBeNull();
    expect(overpassQuery({ south: 1, west: 2, north: 3, east: 4 })).toContain("(1,2,3,4)");
  });

  it("adds only new places, never overwriting community edits", async () => {
    const fetcher = vi.fn(async () => Response.json({ elements }));
    const inserted = await syncCity(d1, { country_code: "GB", city_slug: "london", name: "London", bbox_json: null }, fetcher as unknown as typeof fetch, 5);
    expect(inserted).toBe(2);
    expect(sqlite.prepare(`SELECT name FROM place WHERE id = 'k'`).get()).toEqual({ name: "Known Mosque (community name)" });
    expect(sqlite.prepare(`SELECT calc_method, amenity_bits FROM place WHERE osm_id = 2`).get()).toEqual({ calc_method: "MoonsightingCommittee", amenity_bits: 8 });
    expect(sqlite.prepare(`SELECT value_json FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id JOIN place ON place.id = fact.place_id WHERE place.osm_id = 3`).get()).toEqual({ value_json: '{"v":false}' });
    expect(await syncCity(d1, { country_code: "GB", city_slug: "london", name: "London", bbox_json: '{"south":1,"west":2,"north":3,"east":4}' }, fetcher as unknown as typeof fetch, 6)).toBe(0);
    expect(await syncCity(d1, { country_code: "GB", city_slug: "leeds", name: "Leeds", bbox_json: "not json" }, fetcher as unknown as typeof fetch, 6)).toBe(0);
  });

  it("rotates through cities and records failures", async () => {
    const fetcher = vi.fn(async () => new Response("busy", { status: 429 }));
    const results = await weeklyOsmSync(d1, fetcher as unknown as typeof fetch, 7, 5);
    expect(results.find((item) => item.city === "london")).toEqual({ city: "london", inserted: 0, error: "Overpass 429" });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM city WHERE osm_synced_at = 7`).get()).toEqual({ n: 2 });
  });
});
