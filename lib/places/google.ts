import { encodeGeohash } from "@/lib/geo/geohash";

/**
 * Google Places API (New) for adding a place (spec 2.6). Only `place_id` is stored for good;
 * names and addresses are user-confirmed in our form. Live display fields are cached ≤ 24h in KV.
 *
 * On preview/local with the email sink on, responses come from KV mocks written by the E2E
 * fixtures endpoint (`test:places:autocomplete`, `test:places:details:<id>`).
 */

/**
 * Google Places stays integrated but supplies no data for now: names, locations, search and live
 * fields all come from free sources (OpenStreetMap, Photon, Wikidata, Mawaqit). Setting this to true
 * turns the existing call sites back on (the add-form lookup, geocode details, the mosque page's
 * phone/website/hours and the nightly location refresh); the API key alone no longer does.
 */
export const GOOGLE_PLACES_IN_USE = false;

export type PlaceSuggestion = { placeId: string; label: string; secondary: string | null };

export type PlaceDetails = {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  locality: string | null;
  region: string | null;
  country: string | null;
};

export type LiveFields = { phone: string | null; website: string | null; hours: string[] };

export type PlacesContext = {
  apiKey?: string;
  cache: KVNamespace;
  mocks: boolean;
  fetcher?: typeof fetch;
};

const BASE = "https://places.googleapis.com/v1";
/** Essentials-tier fields only, so Place Details stays in the cheapest SKU. */
export const DETAILS_FIELDS = "id,displayName,formattedAddress,location,addressComponents,types";
const LIVE_FIELDS = "nationalPhoneNumber,websiteUri,regularOpeningHours.weekdayDescriptions";

type Component = { longText?: string; shortText?: string; types?: string[] };

export function parseDetails(body: {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: Component[];
}): PlaceDetails | null {
  const lat = body.location?.latitude;
  const lng = body.location?.longitude;
  if (!body.id || !body.displayName?.text || lat === undefined || lng === undefined) return null;
  const find = (type: string) => body.addressComponents?.find((component) => component.types?.includes(type));
  const locality = find("postal_town") ?? find("locality") ?? find("sublocality") ?? find("administrative_area_level_2");
  return {
    placeId: body.id,
    name: body.displayName.text,
    address: body.formattedAddress ?? null,
    lat,
    lng,
    locality: locality?.longText ?? null,
    region: find("administrative_area_level_1")?.longText ?? null,
    country: find("country")?.shortText?.toUpperCase() ?? null,
  };
}

async function mocked<T>(context: PlacesContext, key: string): Promise<T | null> {
  if (!context.mocks) return null;
  const value = await context.cache.get(key);
  return value ? (JSON.parse(value) as T) : null;
}

export async function autocompletePlaces(context: PlacesContext, input: string, session: string): Promise<PlaceSuggestion[]> {
  const mock = await mocked<PlaceSuggestion[]>(context, "test:places:autocomplete");
  if (mock) return mock.filter((item) => item.label.toLowerCase().includes(input.toLowerCase().slice(0, 3)));
  if (!context.apiKey) return [];
  const call = async (types: string[] | null) => {
    const response = await (context.fetcher ?? fetch)(`${BASE}/places:autocomplete`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Goog-Api-Key": context.apiKey ?? "" },
      body: JSON.stringify({ input, sessionToken: session, ...(types ? { includedPrimaryTypes: types } : {}) }),
    });
    if (!response.ok) return [];
    const body = (await response.json()) as {
      suggestions?: Array<{ placePrediction?: { placeId?: string; structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } }; text?: { text?: string } } }>;
    };
    return (body.suggestions ?? [])
      .map((item) => ({
        placeId: item.placePrediction?.placeId ?? "",
        label: item.placePrediction?.structuredFormat?.mainText?.text ?? item.placePrediction?.text?.text ?? "",
        secondary: item.placePrediction?.structuredFormat?.secondaryText?.text ?? null,
      }))
      .filter((item) => item.placeId && item.label);
  };
  // Mosques and places of worship first, then anything (spec 4.3 Add a place).
  const worship = await call(["mosque", "place_of_worship"]);
  if (worship.length >= 3) return worship;
  const rest = await call(null);
  return [...worship, ...rest.filter((item) => !worship.some((known) => known.placeId === item.placeId))].slice(0, 8);
}

export async function placeDetails(context: PlacesContext, placeId: string, session: string | null): Promise<PlaceDetails | null> {
  const mock = await mocked<PlaceDetails>(context, `test:places:details:${placeId}`);
  if (mock) return mock;
  if (!context.apiKey) return null;
  const query = session ? `?sessionToken=${encodeURIComponent(session)}` : "";
  const response = await (context.fetcher ?? fetch)(`${BASE}/places/${encodeURIComponent(placeId)}${query}`, {
    headers: { "X-Goog-Api-Key": context.apiKey, "X-Goog-FieldMask": DETAILS_FIELDS },
  });
  if (!response.ok) return null;
  return parseDetails((await response.json()) as Parameters<typeof parseDetails>[0]);
}

/** Phone, website and opening hours shown live with Google attribution, cached for 24 hours. */
export async function liveFields(context: PlacesContext, placeId: string): Promise<LiveFields | null> {
  const key = `places:live:${placeId}`;
  const cached = await context.cache.get(key);
  if (cached) return JSON.parse(cached) as LiveFields;
  if (!context.apiKey) return null;
  const response = await (context.fetcher ?? fetch)(`${BASE}/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": context.apiKey, "X-Goog-FieldMask": LIVE_FIELDS },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { nationalPhoneNumber?: string; websiteUri?: string; regularOpeningHours?: { weekdayDescriptions?: string[] } };
  const fields: LiveFields = {
    phone: body.nationalPhoneNumber ?? null,
    website: body.websiteUri ?? null,
    hours: body.regularOpeningHours?.weekdayDescriptions ?? [],
  };
  await context.cache.put(key, JSON.stringify(fields), { expirationTtl: 24 * 60 * 60 });
  return fields;
}

export const USER_DAILY_LOOKUPS = 60;

/**
 * Per-user and global daily caps on billable Places calls (spec 2.13). Counters live in KV keyed
 * by UTC day; the global cap comes from GOOGLE_PLACES_DAILY_CAP (default 2,000).
 */
export async function takeLookup(cache: KVNamespace, userId: string, globalCap: number, now = Date.now()): Promise<boolean> {
  const day = new Date(now).toISOString().slice(0, 10);
  const userKey = `places:calls:${day}:${userId}`;
  const globalKey = `places:calls:${day}`;
  const [user, total] = await Promise.all([cache.get(userKey), cache.get(globalKey)]);
  const userCount = Number(user ?? "0");
  const totalCount = Number(total ?? "0");
  if (userCount >= USER_DAILY_LOOKUPS || totalCount >= globalCap) return false;
  await Promise.all([
    cache.put(userKey, String(userCount + 1), { expirationTtl: 2 * 24 * 60 * 60 }),
    cache.put(globalKey, String(totalCount + 1), { expirationTtl: 2 * 24 * 60 * 60 }),
  ]);
  return true;
}

/**
 * Google allows caching lat/lng for 30 days: re-fetch location (Essentials field) for places whose
 * coordinates came from Google more than 30 days ago.
 */
export async function refreshGoogleLocations(db: D1Database, context: PlacesContext, now: number, limit = 50): Promise<number> {
  if (!context.apiKey) return 0;
  const due = await db
    .prepare(`SELECT id, google_place_id FROM place WHERE google_place_id IS NOT NULL AND google_latlng_fetched_at < ? ORDER BY google_latlng_fetched_at LIMIT ?`)
    .bind(now - 30 * 24 * 60 * 60 * 1000, limit)
    .all<{ id: string; google_place_id: string }>();
  let refreshed = 0;
  for (const row of due.results ?? []) {
    const response = await (context.fetcher ?? fetch)(`${BASE}/places/${encodeURIComponent(row.google_place_id)}`, {
      headers: { "X-Goog-Api-Key": context.apiKey, "X-Goog-FieldMask": "location" },
    });
    if (!response.ok) continue;
    const body = (await response.json()) as { location?: { latitude?: number; longitude?: number } };
    const lat = body.location?.latitude;
    const lng = body.location?.longitude;
    if (lat === undefined || lng === undefined) continue;
    await db
      .prepare(`UPDATE place SET lat = ?, lng = ?, geohash6 = ?, google_latlng_fetched_at = ?, updated_at = ? WHERE id = ?`)
      .bind(lat, lng, encodeGeohash(lat, lng), now, now, row.id)
      .run();
    refreshed += 1;
  }
  return refreshed;
}
