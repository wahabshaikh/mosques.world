import { describe, expect, it, vi } from "vitest";
import { autocompletePlaces, liveFields, parseDetails, placeDetails, takeLookup, USER_DAILY_LOOKUPS, type PlacesContext } from "./google";

function kv(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => void store.set(key, value)),
  } as unknown as KVNamespace & { store: Map<string, string> };
}

const detailsBody = {
  id: "g1",
  displayName: { text: "East London Mosque" },
  formattedAddress: "82-92 Whitechapel Rd, London E1 1JQ, UK",
  location: { latitude: 51.5174, longitude: -0.0654 },
  addressComponents: [
    { longText: "London", types: ["postal_town"] },
    { longText: "England", types: ["administrative_area_level_1"] },
    { longText: "United Kingdom", shortText: "GB", types: ["country"] },
  ],
};

describe("google places", () => {
  it("parses place details", () => {
    expect(parseDetails(detailsBody)).toEqual({
      placeId: "g1",
      name: "East London Mosque",
      address: "82-92 Whitechapel Rd, London E1 1JQ, UK",
      lat: 51.5174,
      lng: -0.0654,
      locality: "London",
      region: "England",
      country: "GB",
    });
    expect(parseDetails({ id: "x" })).toBeNull();
  });

  it("uses KV mocks on preview", async () => {
    const context: PlacesContext = {
      cache: kv({
        "test:places:autocomplete": JSON.stringify([{ placeId: "m1", label: "Test Masjid", secondary: "London" }]),
        "test:places:details:m1": JSON.stringify({ placeId: "m1", name: "Test Masjid", address: null, lat: 1, lng: 2, locality: null, region: null, country: "GB" }),
      }),
      mocks: true,
    };
    expect(await autocompletePlaces(context, "test", "s")).toHaveLength(1);
    expect(await autocompletePlaces(context, "zzz", "s")).toHaveLength(0);
    expect((await placeDetails(context, "m1", "s"))?.name).toBe("Test Masjid");
    expect(await placeDetails({ cache: kv(), mocks: true }, "m1", null)).toBeNull();
  });

  it("calls Google with field masks and falls back to any type", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("places:autocomplete")) {
        const typed = String(init?.body).includes("includedPrimaryTypes");
        const suggestions = typed
          ? [{ placePrediction: { placeId: "a", structuredFormat: { mainText: { text: "Masjid A" }, secondaryText: { text: "London" } } } }]
          : [{ placePrediction: { placeId: "a", text: { text: "Masjid A" } } }, { placePrediction: { placeId: "b", text: { text: "Hall B" } } }];
        return Response.json({ suggestions });
      }
      if (new Headers(init?.headers).get("X-Goog-FieldMask")?.startsWith("nationalPhone")) {
        return Response.json({ nationalPhoneNumber: "020 7650 3000", regularOpeningHours: { weekdayDescriptions: ["Monday: Open 24 hours"] } });
      }
      return Response.json(detailsBody);
    });
    const context: PlacesContext = { apiKey: "k", cache: kv(), mocks: false, fetcher: fetcher as unknown as typeof fetch };
    expect((await autocompletePlaces(context, "masjid", "s")).map((item) => item.placeId)).toEqual(["a", "b"]);
    expect((await placeDetails(context, "g1", "s"))?.country).toBe("GB");
    const live = await liveFields(context, "g1");
    expect(live).toEqual({ phone: "020 7650 3000", website: null, hours: ["Monday: Open 24 hours"] });
    expect(await liveFields(context, "g1")).toEqual(live);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/places/g1"))).toHaveLength(1);
    expect(await autocompletePlaces({ cache: kv(), mocks: false }, "x", "s")).toEqual([]);
    expect(await placeDetails({ cache: kv(), mocks: false }, "x", null)).toBeNull();
    expect(await liveFields({ cache: kv(), mocks: false }, "x")).toBeNull();
    const failing = { apiKey: "k", cache: kv(), mocks: false, fetcher: (async () => new Response("no", { status: 500 })) as unknown as typeof fetch };
    expect(await autocompletePlaces(failing, "x", "s")).toEqual([]);
    expect(await placeDetails(failing, "x", null)).toBeNull();
    expect(await liveFields(failing, "x")).toBeNull();
  });

  it("caps lookups per user and globally", async () => {
    const cache = kv();
    expect(await takeLookup(cache, "u", 2, 0)).toBe(true);
    expect(await takeLookup(cache, "v", 2, 0)).toBe(true);
    expect(await takeLookup(cache, "w", 2, 0)).toBe(false);
    const busy = kv({ "places:calls:1970-01-01:u": String(USER_DAILY_LOOKUPS) });
    expect(await takeLookup(busy, "u", 1000, 0)).toBe(false);
  });
});

describe("30-day location refresh", () => {
  it("re-fetches Google coordinates older than 30 days", async () => {
    const { createTestD1 } = await import("@/lib/testing/d1");
    const { refreshGoogleLocations } = await import("./google");
    const { d1, sqlite } = createTestD1();
    const now = 100 * 24 * 60 * 60 * 1000;
    sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, google_place_id, google_latlng_fetched_at, created_at, updated_at)
      VALUES ('a', 'a', 'A', 'mosque', 0, 0, 's00000', 'GB', 'l', 'Europe/London', 'M', 'shafi', 'g-old', 0, 0, 0),
             ('b', 'b', 'B', 'mosque', 0, 0, 's00000', 'GB', 'l', 'Europe/London', 'M', 'shafi', 'g-new', ${now - 1000}, 0, 0),
             ('c', 'c', 'C', 'mosque', 0, 0, 's00000', 'GB', 'l', 'Europe/London', 'M', 'shafi', 'g-bad', 0, 0, 0)`);
    const fetcher = vi.fn(async (url: string) => (url.includes("g-bad") ? new Response("no", { status: 404 }) : Response.json({ location: { latitude: 51.5, longitude: -0.1 } })));
    const context = { apiKey: "k", cache: kv(), mocks: false, fetcher: fetcher as unknown as typeof fetch };
    expect(await refreshGoogleLocations(d1, context, now)).toBe(1);
    expect(sqlite.prepare(`SELECT lat, google_latlng_fetched_at FROM place WHERE id = 'a'`).get()).toEqual({ lat: 51.5, google_latlng_fetched_at: now });
    expect(await refreshGoogleLocations(d1, { ...context, apiKey: undefined }, now)).toBe(0);
  });
});
