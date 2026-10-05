import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import karachi from "@/lib/testing/overpass-karachi.json";
import { encodeGeohash } from "@/lib/geo/geohash";
import { areaNeedsFill, cellsCovering, claimCell, fetchOverpass, fillArea, fillCell, fillCells, fillWindow, geohashBounds, resyncStaleCells, RESYNC_MS } from "./osm-fill";
import { cellCentre, fixtureFetcher } from "./osm-fixture";

let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  sqlite.exec(`INSERT OR IGNORE INTO calc_default (country_code, calc_method, asr_madhab, high_lat_rule) VALUES ('PK', 'Karachi', 'hanafi', 'middle_of_night')`);
});

function karachiFetcher(): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("photon")) return Response.json({ features: [{ properties: { countrycode: "PK", city: "Karachi", state: "Sindh" } }] });
    return Response.json({ elements: karachi });
  }) as unknown as typeof fetch;
}

describe("geohash cells", () => {
  it("decodes a cell to the box it encodes", () => {
    const box = geohashBounds("tkrt");
    expect(box.south).toBeCloseTo(24.785, 3);
    expect(box.east).toBeCloseTo(67.148, 3);
    expect(encodeGeohash((box.south + box.north) / 2, (box.west + box.east) / 2, 4)).toBe("tkrt");
    expect(() => geohashBounds("tkra")).toThrow();
  });

  it("covers a viewport centre-first and refuses one that is zoomed far out", () => {
    const cells = cellsCovering({ south: 24.8, north: 24.95, west: 66.9, east: 67.1 });
    expect(cells?.[0]).toBe("tkrt");
    expect(cellsCovering({ south: 0, north: 40, west: 0, east: 60 })).toBeNull();
    const window = fillWindow({ south: 20, north: 30, west: 60, east: 70 });
    expect(window.north - window.south).toBeCloseTo(0.3, 5);
    const near = fillCells({ south: 24.68, north: 25.04, west: 66.81, east: 67.21 });
    expect(near[0]).toBe("tkrt");
    expect(near.length).toBeLessThanOrEqual(12);
  });
});

describe("area fill", () => {
  it("fills a cell from real Overpass data: names, slugs, defaults, step-free and a city row", async () => {
    const result = await fillCell({ DB: d1 }, "tkrt", karachiFetcher(), 1_000);
    // 10 elements: two have no name at all.
    expect(result).toEqual({ cell: "tkrt", inserted: 8 });
    const rows = sqlite.prepare(`SELECT slug, name, name_local, locality, country_code, city_slug, calc_method, asr_madhab, timezone FROM place ORDER BY slug`).all() as Array<Record<string, string>>;
    expect(rows.map((row) => row.slug)).toContain("bilal-masjid-karachi");
    expect(rows.find((row) => row.slug === "bilal-masjid-karachi")).toMatchObject({ name: "Bilal Masjid", name_local: "مسجد بلال", calc_method: "Karachi", asr_madhab: "hanafi", timezone: "Asia/Karachi", city_slug: "karachi" });
    // An Urdu-only name and locality still get a readable slug and an English locality.
    expect(rows.find((row) => row.name === "مسجد عثمان غنی")).toMatchObject({ slug: "mosque-karachi", locality: "Karachi" });
    expect(sqlite.prepare(`SELECT name FROM city WHERE country_code = 'PK' AND city_slug = 'karachi'`).get()).toEqual({ name: "Karachi" });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM fact WHERE key = 'amenity.step_free'`).get()).toEqual({ n: 1 });
    expect(sqlite.prepare(`SELECT status, inserted FROM osm_cell WHERE geohash = 'tkrt'`).get()).toEqual({ status: "done", inserted: 8 });
  });

  it("never duplicates or overwrites, and resolves slugs taken elsewhere", async () => {
    sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
      VALUES ('far', 'medina-karachi', 'Medina (somewhere else)', 'mosque', 1, 1, 's00000', 'PK', 'karachi', 'Asia/Karachi', 'Karachi', 'hanafi', 0, 0)`);
    sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, osm_type, osm_id, created_at, updated_at)
      VALUES ('mine', 'quba-community-name', 'Quba (community name)', 'mosque', 24.94, 67.07, 'tkrtzz', 'PK', 'karachi', 'Asia/Karachi', 'Karachi', 'hanafi', 'node', 290871380, 0, 0)`);
    expect((await fillCell({ DB: d1 }, "tkrt", karachiFetcher(), 1_000)).inserted).toBe(7);
    expect(sqlite.prepare(`SELECT name FROM place WHERE id = 'mine'`).get()).toEqual({ name: "Quba (community name)" });
    expect(sqlite.prepare(`SELECT slug FROM place WHERE osm_id = 290872135`).get()).toEqual({ slug: `medina-karachi-${(290872135).toString(36)}` });
    // A re-sync a month later finds nothing new.
    expect((await fillCell({ DB: d1 }, "tkrt", karachiFetcher(), 1_000 + RESYNC_MS + 1)).inserted).toBe(0);
  });

  it("locks a cell while it fills and records failures for a later retry", async () => {
    expect(await claimCell(d1, "tkrs", 1_000)).toBe(true);
    expect(await claimCell(d1, "tkrs", 2_000)).toBe(false);
    // While another request fills it, the area still counts as needing a fill and the fill reports busy.
    const tkrs = geohashBounds("tkrs");
    const inside = { south: tkrs.south + 0.01, north: tkrs.south + 0.02, west: tkrs.west + 0.01, east: tkrs.west + 0.02 };
    expect(await areaNeedsFill(d1, inside, 2_000)).toBe(true);
    expect((await fillArea({ DB: d1 }, inside, karachiFetcher(), 2_000)).busy).toBeGreaterThan(0);
    expect((await fillCell({ DB: d1 }, "tkrs", karachiFetcher(), 3_000)).skipped).toBe("busy");
    const down = vi.fn(async () => new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    const failed = await fillCell({ DB: d1 }, "tkrw", down, 1_000);
    expect(failed.error).toBe("Overpass 429");
    expect(down).toHaveBeenCalledTimes(3);
    expect(sqlite.prepare(`SELECT status, error FROM osm_cell WHERE geohash = 'tkrw'`).get()).toEqual({ status: "failed", error: "Overpass 429" });
    // An area we can't name is a failure too, not a pile of places with no country.
    const unnamed = vi.fn(async (input: RequestInfo | URL) => (String(input).includes("photon") ? Response.json({ features: [] }) : Response.json({ elements: karachi }))) as unknown as typeof fetch;
    expect((await fillCell({ DB: d1 }, "tkru", unnamed, 1_000)).error).toBe("Could not name this area");
  });

  it("fills a viewport two cells at a time, nearest first, until nothing remains", async () => {
    const bbox = { south: 24.75, north: 24.99, west: 66.86, east: 67.16 };
    expect(await areaNeedsFill(d1, bbox, 1_000)).toBe(true);
    const fetcher = fixtureFetcher();
    const first = await fillArea({ DB: d1 }, bbox, fetcher, 1_000);
    expect(first.results.map((result) => result.cell)[0]).toBe("tkrt");
    expect(first.results).toHaveLength(2);
    let remaining = first.remaining;
    while (remaining > 0) remaining = (await fillArea({ DB: d1 }, bbox, fetcher, 1_000)).remaining;
    expect(await areaNeedsFill(d1, bbox, 1_000)).toBe(false);
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM place WHERE name LIKE 'Masjid Al-Noor%'`).get()).toMatchObject({ n: expect.any(Number) });
    const centre = cellCentre("tkrt");
    expect(sqlite.prepare(`SELECT kind FROM place WHERE name LIKE 'Station Prayer Room%' AND abs(lat - ?) < 0.1 LIMIT 1`).get(centre.lat)).toEqual({ kind: "prayer_room" });
    // Stale cells re-sync from the weekly cron.
    const resynced = await resyncStaleCells({ DB: d1 }, fetcher, 1_000 + RESYNC_MS + 1, 2);
    expect(resynced).toHaveLength(2);
  });

  it("falls back to an Overpass mirror", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("timeout", { status: 504 }))
      .mockResolvedValueOnce(Response.json({ elements: karachi.slice(0, 2) }));
    expect(await fetchOverpass(geohashBounds("tkrt"), fetcher as unknown as typeof fetch)).toHaveLength(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("kumi");
  });
});

describe("seeded areas", () => {
  it("leaves densely seeded cells to the weekly sync, but fills sparse ones and ones with only community-added places", async () => {
    for (let i = 0; i < 10; i += 1) {
      sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, osm_type, osm_id, created_at, updated_at)
        VALUES ('seeded${i}', 'seeded-mosque-${i}', 'Seeded', 'mosque', 24.87, 66.97, 'tkrtaa', 'PK', 'karachi', 'Asia/Karachi', 'Karachi', 'hanafi', 'node', ${i + 1}, 0, 0)`);
    }
    // One seeded OSM mosque (like a city seeded with a single place) still gets filled.
    sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, osm_type, osm_id, created_at, updated_at)
      VALUES ('lonely', 'lonely-mosque', 'Lonely', 'mosque', 24.8, 67.0, 'tkrsaa', 'PK', 'karachi', 'Asia/Karachi', 'Karachi', 'hanafi', 'node', 99, 0, 0)`);
    sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
      VALUES ('added', 'added-mosque', 'Added by someone', 'mosque', 24.87, 67.2, 'tkrwaa', 'PK', 'karachi', 'Asia/Karachi', 'Karachi', 'hanafi', 0, 0)`);
    const { cellsNeedingFill } = await import("./osm-fill");
    expect(await cellsNeedingFill(d1, ["tkrt", "tkrw", "tkrs"], 1_000)).toEqual(["tkrw", "tkrs"]);
  });
});
