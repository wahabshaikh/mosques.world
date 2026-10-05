import tzLookup from "tz-lookup";
import { encodeGeohash } from "@/lib/geo/geohash";
import { ulid } from "@/lib/id";
import { placeSlug, slugify, uniqueSlug } from "@/lib/slug";

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

export type OsmBbox = { south: number; west: number; north: number; east: number };

export function overpassQuery(bbox: OsmBbox): string {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  return `[out:json][timeout:90];(
  node["amenity"="place_of_worship"]["religion"="muslim"](${box});
  way["amenity"="place_of_worship"]["religion"="muslim"](${box});
  relation["amenity"="place_of_worship"]["religion"="muslim"](${box});
  node["building"="mosque"](${box});
  way["building"="mosque"](${box});
);out center tags;`;
}

export type OsmPlaceRow = {
  id: string;
  slug: string;
  name: string;
  nameLocal: string | null;
  kind: "mosque" | "prayer_room";
  lat: number;
  lng: number;
  geohash6: string;
  address: string | null;
  locality: string;
  region: string | null;
  countryCode: string;
  citySlug: string;
  timezone: string;
  osmType: string;
  osmId: number;
  website: string | null;
  phone: string | null;
  wheelchair: string | null;
  /** The Wikidata item OSM mappers linked (about 5,000 mosques worldwide), for an exact enrichment match. */
  wikidataId: string | null;
};

/** Normalises one Overpass element into a place row (shared by the import script and the weekly sync). */
export function osmPlaceRow(
  element: OsmElement,
  context: { country: string; citySlug: string; cityName: string; taken: Set<string>; now: number },
): OsmPlaceRow | null {
  const tags = element.tags ?? {};
  const name = tags["name:en"] ?? tags.name;
  if (!name) return null;
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (lat === undefined || lng === undefined) return null;
  // The most local name mappers gave, so a city of thousands of mosques doesn't list them all as "Karachi".
  const tagged = tags["addr:suburb"] ?? tags["addr:neighbourhood"] ?? tags["addr:quarter"] ?? tags["addr:district"] ?? tags["addr:city"];
  // Keep the page readable in the site's language: a locality in another script falls back to the city.
  const locality = tagged && (slugify(tagged) || !slugify(context.cityName)) ? tagged : context.cityName;
  const kind = /prayer room|musalla/i.test(name) ? "prayer_room" : "mosque";
  // Names in non-Latin scripts slug to nothing, so fall back to "mosque-<locality>" rather than the bare locality.
  const label = slugify(name) ? name : (tags["int_name"] ?? tags["name:latin"] ?? (kind === "mosque" ? "Mosque" : "Prayer room"));
  const slug = uniqueSlug(placeSlug(label, locality) || "place", context.taken);
  context.taken.add(slug);
  return {
    id: ulid(context.now),
    slug,
    name,
    nameLocal: tags["name:en"] && tags.name !== tags["name:en"] ? (tags.name ?? null) : localName(tags, name),
    kind,
    lat,
    lng,
    geohash6: encodeGeohash(lat, lng),
    address: [tags["addr:street"], tags["addr:postcode"]].filter(Boolean).join(", ") || null,
    locality,
    region: tags["addr:state"] ?? null,
    countryCode: context.country,
    citySlug: context.citySlug,
    timezone: tzLookup(lat, lng),
    osmType: element.type,
    osmId: element.id,
    website: tags.website ?? tags["contact:website"] ?? null,
    phone: tags.phone ?? tags["contact:phone"] ?? null,
    wheelchair: tags.wheelchair ?? null,
    wikidataId: /^Q\d+$/.test(tags.wikidata ?? "") ? tags.wikidata! : null,
  };
}

/** The name in Arabic script (Arabic, Urdu, Persian) when OSM has one and the main name is in another script. */
function localName(tags: Record<string, string>, name: string): string | null {
  for (const key of ["name:ar", "name:ur", "name:fa"]) {
    const value = tags[key];
    if (value && value !== name && !/[\u0600-\u06FF]/.test(name)) return value;
  }
  return null;
}

/** Initial step-free value from the OSM wheelchair tag, authored by the system account (as in 0004). */
export function stepFreeStatements(db: D1Database, placeId: string, wheelchair: string | null, now: number): D1PreparedStatement[] {
  if (wheelchair !== "yes" && wheelchair !== "limited" && wheelchair !== "no") return [];
  const value = wheelchair === "no" ? '{"v":false}' : wheelchair === "limited" ? '{"note":"Limited","v":true}' : '{"v":true}';
  const hash =
    wheelchair === "no"
      ? "eeb0deb9cb259a55fdff2c5ed5d0a08dba3ff585aafa0821cc51889f7660739e"
      : wheelchair === "limited"
        ? "e135e79a2bee0f9414746fc172f13658c421cb7268585ff1d7b69cbebed28026"
        : "9175b89688753d7371f5ad803366cc394dbda9d202494fba0216c6326fa67004";
  return [
    db
      .prepare(
        `INSERT INTO fact (id, place_id, key, qualifier, current_candidate_id, state, confidence, last_confirmed_at, updated_at)
         VALUES (?, ?, 'amenity.step_free', '', ?, 'unverified', 0.3, ?, ?) ON CONFLICT DO NOTHING`,
      )
      .bind(`osm-sf-${placeId}`, placeId, `osm-sfc-${placeId}`, now, now),
    db
      .prepare(
        `INSERT INTO fact_candidate (id, fact_id, value_json, value_hash, effective_from, status, score, created_by, created_at)
         VALUES (?, ?, ?, ?, '2000-01-01', 'current', 1, 'system', ?) ON CONFLICT DO NOTHING`,
      )
      .bind(`osm-sfc-${placeId}`, `osm-sf-${placeId}`, value, hash, now),
    db
      .prepare(`INSERT INTO vote (id, candidate_id, user_id, polarity, source, weight, created_at) VALUES (?, ?, 'system', 1, 'other', 1, ?) ON CONFLICT DO NOTHING`)
      .bind(`osm-sfv-${placeId}`, `osm-sfc-${placeId}`, now),
    db.prepare(`UPDATE place SET amenity_bits = amenity_bits | ? WHERE id = ?`).bind(wheelchair === "no" ? 0 : 8, placeId),
  ];
}

type CityRow = { country_code: string; city_slug: string; name: string; bbox_json: string | null };

async function cityBbox(db: D1Database, city: CityRow): Promise<OsmBbox | null> {
  if (city.bbox_json) {
    try {
      const box = JSON.parse(city.bbox_json) as OsmBbox;
      if ([box.south, box.west, box.north, box.east].every(Number.isFinite)) return box;
    } catch {
      // Fall back to the extent of known places.
    }
  }
  const extent = await db
    .prepare(`SELECT MIN(lat) AS south, MIN(lng) AS west, MAX(lat) AS north, MAX(lng) AS east FROM place WHERE country_code = ? AND city_slug = ?`)
    .bind(city.country_code, city.city_slug)
    .first<{ south: number | null; west: number | null; north: number | null; east: number | null }>();
  if (extent?.south == null || extent.west == null || extent.north == null || extent.east == null) return null;
  const pad = 0.02;
  return { south: extent.south - pad, west: extent.west - pad, north: extent.north + pad, east: extent.east + pad };
}

/**
 * Adds OSM places we don't have yet for one city. Existing rows are never touched (community edits
 * win), and slug clashes are skipped rather than overwritten.
 */
export async function syncCity(db: D1Database, city: CityRow, fetcher: typeof fetch, now: number): Promise<number> {
  const bbox = await cityBbox(db, city);
  if (!bbox) return 0;
  const response = await fetcher("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "user-agent": "mosques.world weekly sync (https://mosques.world/attribution)" },
    body: overpassQuery(bbox),
  });
  if (!response.ok) throw new Error(`Overpass ${response.status}`);
  const body = (await response.json()) as { elements?: OsmElement[] };
  const known = await db
    .prepare(`SELECT osm_type, osm_id FROM place WHERE osm_id IS NOT NULL AND country_code = ? AND city_slug = ?`)
    .bind(city.country_code, city.city_slug)
    .all<{ osm_type: string; osm_id: number }>();
  const seen = new Set((known.results ?? []).map((row) => `${row.osm_type}/${row.osm_id}`));
  const fresh = (body.elements ?? []).filter((element) => !seen.has(`${element.type}/${element.id}`)).slice(0, 500);
  if (fresh.length === 0) return 0;
  const slugs = await db.prepare(`SELECT slug FROM place WHERE country_code = ? AND city_slug = ?`).bind(city.country_code, city.city_slug).all<{ slug: string }>();
  const taken = new Set((slugs.results ?? []).map((row) => row.slug));
  const defaults = await db
    .prepare(`SELECT calc_method, asr_madhab FROM calc_default WHERE country_code = ?`)
    .bind(city.country_code)
    .first<{ calc_method: string; asr_madhab: string }>();
  let inserted = 0;
  for (const element of fresh) {
    const row = osmPlaceRow(element, { country: city.country_code, citySlug: city.city_slug, cityName: city.name, taken, now });
    if (!row) continue;
    const result = await db
      .prepare(
        `INSERT INTO place (id, slug, name, name_local, kind, status, lat, lng, geohash6, address, locality, region, country_code, city_slug, timezone,
           calc_method, asr_madhab, osm_type, osm_id, website, phone, wheelchair, wikidata_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`,
      )
      .bind(
        row.id,
        row.slug,
        row.name,
        row.nameLocal,
        row.kind,
        row.lat,
        row.lng,
        row.geohash6,
        row.address,
        row.locality,
        row.region,
        row.countryCode,
        row.citySlug,
        row.timezone,
        defaults?.calc_method ?? "MuslimWorldLeague",
        defaults?.asr_madhab ?? "shafi",
        row.osmType,
        row.osmId,
        row.website,
        row.phone,
        row.wheelchair,
        row.wikidataId,
        now,
        now,
      )
      .run();
    if (!result.meta.changes) continue;
    inserted += 1;
    const statements = stepFreeStatements(db, row.id, row.wheelchair, now);
    if (statements.length) await db.batch(statements);
  }
  return inserted;
}

/** Weekly cron: the least recently synced cities, a couple per run so Overpass is never hammered. */
export async function weeklyOsmSync(db: D1Database, fetcher: typeof fetch, now: number, limit = 2) {
  const cities = await db
    .prepare(`SELECT country_code, city_slug, name, bbox_json FROM city ORDER BY coalesce(osm_synced_at, 0), place_count DESC LIMIT ?`)
    .bind(limit)
    .all<CityRow>();
  const results: Array<{ city: string; inserted: number; error?: string }> = [];
  for (const city of cities.results ?? []) {
    try {
      results.push({ city: city.city_slug, inserted: await syncCity(db, city, fetcher, now) });
    } catch (error) {
      results.push({ city: city.city_slug, inserted: 0, error: error instanceof Error ? error.message : String(error) });
    }
    await db.prepare(`UPDATE city SET osm_synced_at = ? WHERE country_code = ? AND city_slug = ?`).bind(now, city.country_code, city.city_slug).run();
  }
  return results;
}
