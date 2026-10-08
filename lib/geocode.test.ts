import { describe, expect, it, vi } from "vitest";
import { areaFrom, geocodeWhere, mosqueHit, nameArea, searchAreas, searchMosques, suggestionLabel, toSuggestion } from "./geocode";

const karachi = {
  geometry: { coordinates: [67.0207, 24.8547] as [number, number] },
  properties: { osm_type: "R", osm_id: 6080948, type: "city", name: "Karachi", state: "Sindh", country: "Pakistan", countrycode: "PK", extent: [66.28, 25.67, 67.58, 24.42] as [number, number, number, number] },
};

function memoryKv() {
  const store = new Map<string, string>();
  return { store, get: vi.fn(async (key: string) => store.get(key) ?? null), put: vi.fn(async (key: string, value: string) => void store.set(key, value)) };
}

describe("geocode", () => {
  it("labels and normalises Photon features, including the extent", () => {
    expect(suggestionLabel(karachi)).toBe("Karachi, Sindh, Pakistan");
    expect(suggestionLabel({ properties: { name: "Singapore", type: "city", state: "Singapore", country: "Singapore" } })).toBe("Singapore");
    expect(toSuggestion(karachi)).toEqual({
      label: "Karachi, Sindh, Pakistan",
      placeId: "osm:R6080948",
      lat: 24.8547,
      lng: 67.0207,
      bbox: { west: 66.28, east: 67.58, south: 24.42, north: 25.67 },
    });
    expect(toSuggestion({ properties: { name: "Nowhere" } })).toBeNull();
  });

  it("searches once per query and serves repeats from the cache", async () => {
    const fetcher = vi.fn(async () => Response.json({ features: [karachi, karachi] }));
    const cache = memoryKv();
    const first = await searchAreas("  Karachi ", { cache, fetcher: fetcher as unknown as typeof fetch });
    expect(first).toHaveLength(1);
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain("q=karachi");
    await searchAreas("karachi", { cache, fetcher: fetcher as unknown as typeof fetch });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(await searchAreas("k", { fetcher: fetcher as unknown as typeof fetch })).toEqual([]);
  });

  it("returns nothing (and caches nothing) when Photon is down", async () => {
    const cache = memoryKv();
    const down = vi.fn(async () => new Response("busy", { status: 503 }));
    expect(await searchAreas("karachi", { cache, fetcher: down as unknown as typeof fetch })).toEqual([]);
    const broken = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(await geocodeWhere("karachi", { cache, fetcher: broken as unknown as typeof fetch })).toBeNull();
    expect(cache.put).not.toHaveBeenCalled();
  });

  it("names an area by city, falling back to district, county or state", async () => {
    expect(areaFrom({ properties: { countrycode: "pk", city: "Karachi", state: "Sindh" } })).toEqual({ countryCode: "PK", city: "Karachi", region: "Sindh" });
    expect(areaFrom({ properties: { countrycode: "GB", type: "town", name: "Luton" } })?.city).toBe("Luton");
    expect(areaFrom({ properties: { countrycode: "US", county: "Charleston County", state: "South Carolina" } })?.city).toBe("Charleston County");
    expect(areaFrom({ properties: { city: "No country" } })).toBeNull();
    expect(areaFrom(undefined)).toBeNull();
    const fetcher = vi.fn(async () => Response.json({ features: [{ properties: { countrycode: "PK", city: "Karachi" } }] }));
    const cache = memoryKv();
    expect(await nameArea(24.86, 67.01, { cache, fetcher: fetcher as unknown as typeof fetch, cell: "tkrt" })).toMatchObject({ city: "Karachi" });
    expect(cache.store.has("geo:r:tkrt")).toBe(true);
  });
});

describe("add-a-place search", () => {
  it("returns buildings with prefilled details, biased to the map", async () => {
    const { searchPlaces, placeHit } = await import("./geocode");
    const feature = {
      geometry: { coordinates: [-79.94, 32.79] as [number, number] },
      properties: { osm_type: "W", osm_id: 42, name: "Central Mosque", housenumber: "1", street: "King Street", postcode: "29401", city: "Charleston", state: "South Carolina", country: "United States", countrycode: "us" },
    };
    const fetcher = vi.fn(async () => Response.json({ features: [feature, { properties: { name: "No point" } }] }));
    const hits = await searchPlaces("central mosque", { lat: 32.78, lng: -79.93 }, { fetcher: fetcher as unknown as typeof fetch });
    expect(String((fetcher.mock.calls[0] as unknown[])[0])).toContain("location_bias_scale");
    expect(hits).toEqual([
      {
        placeId: "osm:W42",
        label: "Central Mosque",
        secondary: "1 King Street, Charleston, United States",
        details: { placeId: "osm:W42", name: "Central Mosque", address: "1 King Street, 29401", lat: 32.79, lng: -79.94, locality: "Charleston", region: "South Carolina", country: "US" },
      },
    ]);
    expect(await searchPlaces("ab", null, { fetcher: fetcher as unknown as typeof fetch })).toEqual([]);
    expect(placeHit({ geometry: { coordinates: [1, 2] }, properties: { name: "Bare" } })?.details).toMatchObject({ address: null, locality: null, country: null });
  });
});

describe("mosque search", () => {
  const feature = (name: string, extra: Record<string, unknown> = {}) => ({
    geometry: { coordinates: [-0.0653, 51.5174] as [number, number] },
    properties: { osm_type: "W", osm_id: 241107520, osm_key: "amenity", name, district: "Whitechapel", city: "London", country: "United Kingdom", ...extra },
  });

  it("keeps mosques and drops other places of worship", () => {
    expect(mosqueHit(feature("East London Mosque"))).toEqual({
      label: "East London Mosque, Whitechapel, London, United Kingdom",
      name: "East London Mosque",
      lat: 51.5174,
      lng: -0.0653,
      osmType: "way",
      osmId: 241107520,
    });
    expect(mosqueHit(feature("Masjid-e-Umer"))?.osmType).toBe("way");
    expect(mosqueHit(feature("مسجد النور"))).not.toBeNull();
    expect(mosqueHit(feature("St Mary's Church"))).toBeNull();
    expect(mosqueHit(feature("Some Mosque", { osm_type: "X" }))).toBeNull();
  });

  it("asks Photon for places of worship near the map and caches the answer", async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ features: [feature("East London Mosque"), feature("Christ Church")] }));
    }) as unknown as typeof fetch;
    const store = new Map<string, string>();
    const cache = { get: async (key: string) => store.get(key) ?? null, put: async (key: string, value: string) => void store.set(key, value) };
    const hits = await searchMosques("east london", { lat: 51.51, lng: -0.06 }, { fetcher, cache });
    expect(hits.map((hit) => hit.name)).toEqual(["East London Mosque"]);
    expect(urls[0]).toContain("osm_tag=amenity:place_of_worship");
    expect(urls[0]).toContain("lat=51.5&lon=-0.1");
    await searchMosques("east london", { lat: 51.51, lng: -0.06 }, { fetcher, cache });
    expect(urls).toHaveLength(1);
    expect(await searchMosques("ea", null, { fetcher })).toEqual([]);
  });
});
