import type { Bbox } from "@/lib/geo/distance";

/**
 * Free geocoding through Photon (komoot's OpenStreetMap geocoder, no key). Replaces Google Places for
 * the "Where" search and for naming the city of an area we fill from OpenStreetMap. Results are cached
 * in KV so a popular query or area hits Photon once a month at most.
 */
const PHOTON = "https://photon.komoot.io";
const USER_AGENT = "mosques.world (https://mosques.world/attribution)";
const CACHE_TTL = 30 * 24 * 60 * 60;

export type GeoSuggestion = {
  label: string;
  placeId: string;
  lat: number | null;
  lng: number | null;
  bbox?: Bbox | null;
};

export type AreaName = { countryCode: string; city: string; region: string | null };

type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    type?: string;
    name?: string;
    city?: string;
    district?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    extent?: [number, number, number, number];
  };
};

type Cache = { get(key: string): Promise<string | null>; put(key: string, value: string, options?: { expirationTtl?: number }): Promise<unknown> } | undefined;

async function cached<T>(cache: Cache, key: string, load: () => Promise<T | null>): Promise<T | null> {
  try {
    const hit = cache ? await cache.get(key) : null;
    if (hit) return JSON.parse(hit) as T;
  } catch {
    // A cache miss or a broken entry falls through to Photon.
  }
  const value = await load();
  if (value !== null && cache) await cache.put(key, JSON.stringify(value), { expirationTtl: CACHE_TTL }).catch(() => undefined);
  return value;
}

async function photon(path: string, fetcher: typeof fetch): Promise<PhotonFeature[] | null> {
  try {
    const response = await fetcher(`${PHOTON}${path}`, { headers: { "user-agent": USER_AGENT, accept: "application/json" } });
    if (!response.ok) return null;
    const body = (await response.json()) as { features?: PhotonFeature[] };
    return body.features ?? [];
  } catch {
    return null;
  }
}

/** "Karachi, Sindh, Pakistan" without repeating parts (a city-state is its own state and country). */
export function suggestionLabel(feature: PhotonFeature): string {
  const p = feature.properties ?? {};
  const parts = [p.name, p.type === "city" ? null : p.city, p.state, p.country].filter((part): part is string => Boolean(part));
  return [...new Set(parts)].join(", ");
}

export function toSuggestion(feature: PhotonFeature): GeoSuggestion | null {
  const p = feature.properties ?? {};
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const label = suggestionLabel(feature);
  if (!label || lat === undefined || lng === undefined) return null;
  const extent = p.extent;
  const bbox = extent ? { west: Math.min(extent[0], extent[2]), east: Math.max(extent[0], extent[2]), south: Math.min(extent[1], extent[3]), north: Math.max(extent[1], extent[3]) } : null;
  return { label, placeId: `osm:${p.osm_type ?? "X"}${p.osm_id ?? ""}`, lat, lng, bbox };
}

/** Cities, districts, regions and countries matching what someone typed in "Where". */
export async function searchAreas(query: string, options: { cache?: Cache; fetcher?: typeof fetch; limit?: number } = {}): Promise<GeoSuggestion[]> {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);
  if (q.length < 2) return [];
  const limit = options.limit ?? 6;
  const layers = ["city", "district", "locality", "county", "state", "country"].map((layer) => `&layer=${layer}`).join("");
  const result = await cached(options.cache, `geo:q:${q}`, async () => {
    const features = await photon(`/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=en${layers}`, options.fetcher ?? fetch);
    if (!features) return null;
    const seen = new Set<string>();
    return features
      // Areas only: a power plant called "Karachi …" is not somewhere to search.
      .filter((feature) => !feature.properties?.osm_key || feature.properties.osm_key === "place" || feature.properties.osm_key === "boundary")
      .map(toSuggestion)
      .filter((item): item is GeoSuggestion => item !== null)
      .filter((item) => (seen.has(item.label) ? false : (seen.add(item.label), true)));
  });
  return result ?? [];
}

/** The best single match for a free-text "where" (a /search?where= link with no coordinates). */
export async function geocodeWhere(query: string, options: { cache?: Cache; fetcher?: typeof fetch } = {}): Promise<GeoSuggestion | null> {
  const [first] = await searchAreas(query, { ...options, limit: 6 });
  return first ?? null;
}

/** Country and city around a point, used to file places from an OpenStreetMap area fill. */
export async function nameArea(lat: number, lng: number, options: { cache?: Cache; fetcher?: typeof fetch; cell?: string } = {}): Promise<AreaName | null> {
  const key = `geo:r:${options.cell ?? `${lat.toFixed(2)},${lng.toFixed(2)}`}`;
  return cached(options.cache, key, async () => {
    const features = await photon(`/reverse?lat=${lat}&lon=${lng}&lang=en&limit=1&radius=10`, options.fetcher ?? fetch);
    return features ? areaFrom(features[0]) : null;
  });
}

export function areaFrom(feature: PhotonFeature | undefined): AreaName | null {
  const p = feature?.properties;
  if (!p?.countrycode) return null;
  const settlement = p.type === "city" || p.type === "town" || p.type === "village" ? p.name : undefined;
  const city = p.city ?? settlement ?? p.district ?? p.county ?? p.state ?? p.country;
  if (!city) return null;
  return { countryCode: p.countrycode.toUpperCase(), city, region: p.state ?? null };
}

export type PlaceHit = {
  placeId: string;
  label: string;
  secondary: string | null;
  details: { placeId: string; name: string; address: string | null; lat: number; lng: number; locality: string | null; region: string | null; country: string | null };
};

/** Buildings, streets and points of interest for the add form, nearest the map centre first. */
export async function searchPlaces(query: string, near: { lat: number; lng: number } | null, options: { cache?: Cache; fetcher?: typeof fetch } = {}): Promise<PlaceHit[]> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 100);
  if (q.length < 3) return [];
  // Strong location bias: someone adding a mosque is almost always adding one near the map.
  const bias = near ? `&lat=${near.lat.toFixed(2)}&lon=${near.lng.toFixed(2)}&zoom=12&location_bias_scale=0.1` : "";
  const result = await cached(options.cache, `geo:p:${q.toLowerCase()}${bias}`, async () => {
    const features = await photon(`/api/?q=${encodeURIComponent(q)}&limit=6&lang=en${bias}`, options.fetcher ?? fetch);
    if (!features) return null;
    return features.map(placeHit).filter((hit): hit is PlaceHit => hit !== null);
  });
  return result ?? [];
}

export function placeHit(feature: PhotonFeature & { properties?: { street?: string; housenumber?: string; postcode?: string } }): PlaceHit | null {
  const p = feature.properties ?? {};
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  if (!p.name || lat === undefined || lng === undefined) return null;
  const street = [p.housenumber, p.street].filter(Boolean).join(" ");
  const address = [street, p.postcode].filter(Boolean).join(", ") || null;
  const locality = p.city ?? p.district ?? p.county ?? null;
  const placeId = `osm:${p.osm_type ?? "X"}${p.osm_id ?? `${lat},${lng}`}`;
  return {
    placeId,
    label: p.name,
    secondary: [street || null, locality, p.country].filter(Boolean).join(", ") || null,
    details: { placeId, name: p.name, address, lat, lng, locality, region: p.state ?? null, country: p.countrycode?.toUpperCase() ?? null },
  };
}

export type MosqueHit = { label: string; name: string; lat: number; lng: number; osmType: "node" | "way" | "relation"; osmId: number };

/** Names that say "mosque" in the languages our visitors search in; Photon can't filter by religion. */
export const MOSQUE_WORDS =
  /\b(mosque|masjid|masjed|musall?a|mescit|mescidi?|cami|camii|jami|jamia|jame|jamea|islamic|muslim|madrasa|madrassa|surau|langgar|musholl?a|mushola|mosquée|moschee|mezquita|moskee|meczet|džamija|xhami)\b|مسجد|جامع|مصلى|মসজিদ/i;

const OSM_TYPES = { N: "node", W: "way", R: "relation" } as const;

/** Mosques from OpenStreetMap (through Photon) matching a typed name, nearest the map first. */
export async function searchMosques(
  query: string,
  near: { lat: number; lng: number } | null,
  options: { cache?: Cache; fetcher?: typeof fetch } = {},
): Promise<MosqueHit[]> {
  const q = query.trim().replace(/\s+/g, " ").slice(0, 80);
  if (q.length < 3) return [];
  const bias = near ? `&lat=${near.lat.toFixed(1)}&lon=${near.lng.toFixed(1)}&zoom=10&location_bias_scale=0.3` : "";
  const result = await cached(options.cache, `geo:m:${q.toLowerCase()}${bias}`, async () => {
    const features = await photon(`/api/?q=${encodeURIComponent(q)}&limit=12&lang=en&osm_tag=amenity:place_of_worship${bias}`, options.fetcher ?? fetch);
    if (!features) return null;
    return features.map(mosqueHit).filter((hit): hit is MosqueHit => hit !== null).slice(0, 5);
  });
  return result ?? [];
}

export function mosqueHit(feature: PhotonFeature & { properties?: { street?: string; locality?: string } }): MosqueHit | null {
  const p = feature.properties ?? {};
  const [lng, lat] = feature.geometry?.coordinates ?? [];
  const osmType = OSM_TYPES[(p.osm_type ?? "") as keyof typeof OSM_TYPES];
  if (!p.name || lat === undefined || lng === undefined || !osmType || !p.osm_id) return null;
  if (!MOSQUE_WORDS.test(p.name)) return null;
  const where = [p.locality ?? p.district, p.city, p.country].filter((part): part is string => Boolean(part) && part !== p.name);
  return { label: [p.name, ...new Set(where)].join(", "), name: p.name, lat, lng, osmType, osmId: p.osm_id };
}
