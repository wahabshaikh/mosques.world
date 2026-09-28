import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { createPlace, nameSimilarity, nearbyPlaces, newPlaceInput, PlaceError } from "./create";

let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];
const NOW = Date.UTC(2026, 8, 27, 12);

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  sqlite.exec(`INSERT INTO calc_default (country_code, calc_method, asr_madhab, high_lat_rule) VALUES ('GB', 'MoonsightingCommittee', 'hanafi', 'twilightangle') ON CONFLICT DO NOTHING`);
  sqlite.exec(`INSERT INTO user (id, name, email, created_at, updated_at) VALUES ('u', 'U', 'u@x', 0, 0)`);
  sqlite.exec(`INSERT INTO city (country_code, city_slug, name, lat, lng) VALUES ('GB', 'london', 'London', 51.5074, -0.1278)`);
  sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, locality, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
    VALUES ('elm', 'east-london-mosque-whitechapel', 'East London Mosque', 'mosque', 51.5173983, -0.0653616, 'gcpvjh', 'Whitechapel', 'GB', 'london', 'Europe/London', 'MoonsightingCommittee', 'hanafi', 0, 0)`);
});

function input(extra: Record<string, unknown> = {}) {
  return newPlaceInput.parse({ name: "East London Mosque Annex", kind: "mosque", lat: 51.5176, lng: -0.0655, locality: "Whitechapel", ...extra });
}

describe("duplicates", () => {
  it("scores names by trigram similarity", () => {
    expect(nameSimilarity("East London Mosque", "east london mosque")).toBe(1);
    expect(nameSimilarity("East London Mosque", "East London Masjid")).toBeGreaterThan(0.4);
    expect(nameSimilarity("East London Mosque", "Baitul Futuh")).toBeLessThan(0.1);
    expect(nameSimilarity("", "x")).toBe(0);
  });

  it("finds places within 150 m", async () => {
    const near = await nearbyPlaces(d1, { lat: 51.5176, lng: -0.0655, name: "East London Masjid" });
    expect(near).toHaveLength(1);
    expect(near[0]).toMatchObject({ slug: "east-london-mosque-whitechapel" });
    expect(near[0]?.distanceM).toBeLessThan(50);
    expect(await nearbyPlaces(d1, { lat: 51.53, lng: -0.0655, name: "x" })).toEqual([]);
  });
});

describe("createPlace", () => {
  it("creates an active place for trusted members with derived location data", async () => {
    const created = await createPlace(d1, input({ notDuplicateOf: ["elm"] }), { id: "u", trustLevel: 1 }, NOW);
    expect(created).toMatchObject({ slug: "east-london-mosque-annex-whitechapel", status: "active", timezone: "Europe/London" });
    const row = sqlite.prepare(`SELECT country_code, city_slug, calc_method, asr_madhab, geohash6 FROM place WHERE id = ?`).get(created.id);
    expect(row).toEqual({ country_code: "GB", city_slug: "london", calc_method: "MoonsightingCommittee", asr_madhab: "hanafi", geohash6: "gcpvnd" });
    const duplicate = sqlite.prepare(`SELECT b_id, status, distance_m FROM place_duplicate_candidate`).get() as { b_id: string; distance_m: number };
    expect(duplicate.b_id).toBe("elm");
    expect(duplicate.distance_m).toBeGreaterThan(0);
    const again = await createPlace(d1, input(), { id: "u", trustLevel: 1 }, NOW);
    expect(again.slug).toBe("east-london-mosque-annex-whitechapel-2");
  });

  it("starts new accounts' places as pending and handles unknown areas", async () => {
    const pending = await createPlace(d1, input({ name: "Airport Prayer Room", kind: "prayer_room", locality: null }), { id: "u", trustLevel: 0 }, NOW);
    expect(pending.status).toBe("pending");
    expect(pending.slug).toBe("airport-prayer-room-london");
    await expect(createPlace(d1, input({ lat: 10, lng: 10 }), { id: "u", trustLevel: 1 }, NOW)).rejects.toThrow(PlaceError);
    const abroad = await createPlace(d1, input({ lat: 41.0165, lng: 28.9744, country: "tr", locality: "Fatih" }), { id: "u", trustLevel: 1 }, NOW);
    const row = sqlite.prepare(`SELECT country_code, city_slug, calc_method FROM place WHERE id = ?`).get(abroad.id);
    expect(row).toEqual({ country_code: "TR", city_slug: "fatih", calc_method: "Turkey" });
    expect(sqlite.prepare(`SELECT name FROM city WHERE city_slug = 'fatih'`).get()).toEqual({ name: "Fatih" });
  });

  it("refuses a Google place that is already listed", async () => {
    await createPlace(d1, input({ googlePlaceId: "g1" }), { id: "u", trustLevel: 1 }, NOW);
    await expect(createPlace(d1, input({ googlePlaceId: "g1" }), { id: "u", trustLevel: 1 }, NOW)).rejects.toThrow("already listed");
  });

  it("validates the form", () => {
    expect(newPlaceInput.safeParse({ name: "x", kind: "mosque", lat: 0, lng: 0 }).success).toBe(false);
    expect(newPlaceInput.safeParse({ name: "Masjid", kind: "church", lat: 0, lng: 0 }).success).toBe(false);
    const parsed = newPlaceInput.parse({ name: "Masjid", kind: "musalla", lat: 1, lng: 2, iqamah: { asr: "16:30" }, amenities: { "amenity.parking": true } });
    expect(parsed.iqamah).toEqual({ asr: "16:30" });
    expect(parsed.amenities).toEqual({ "amenity.parking": true });
  });
});
