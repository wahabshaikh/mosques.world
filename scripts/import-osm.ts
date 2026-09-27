import tzLookup from "tz-lookup";
import { encodeGeohash } from "../lib/geo/geohash";
import { placeSlug, uniqueSlug } from "../lib/slug";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const args = new Map(
  process.argv.slice(2).flatMap((arg, index, all) => (arg.startsWith("--") ? [[arg.slice(2), all[index + 1] ?? ""]] : [])),
);

const bbox = args.get("bbox");
const country = (args.get("country") ?? "").toUpperCase();
const citySlug = args.get("city") ?? "";
const cityName = args.get("city-name") ?? citySlug;
if (!bbox || !country || !citySlug) {
  console.error("Usage: tsx scripts/import-osm.ts --bbox south,west,north,east --country GB --city london --city-name London");
  process.exit(1);
}

const [south, west, north, east] = bbox.split(",").map(Number);
const query = `[out:json][timeout:90];(
  node["amenity"="place_of_worship"]["religion"="muslim"](${south},${west},${north},${east});
  way["amenity"="place_of_worship"]["religion"="muslim"](${south},${west},${north},${east});
  relation["amenity"="place_of_worship"]["religion"="muslim"](${south},${west},${north},${east});
  node["building"="mosque"](${south},${west},${north},${east});
  way["building"="mosque"](${south},${west},${north},${east});
);out center tags;`;

const response = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "user-agent": "mosques.world import" },
  body: query,
});
if (!response.ok) {
  console.error(`Overpass failed: ${response.status}`);
  process.exit(1);
}
const body = (await response.json()) as { elements: OverpassElement[] };
const taken = new Set<string>();
const now = Date.now();

for (const element of body.elements) {
  const tags = element.tags ?? {};
  const name = tags.name ?? tags["name:en"];
  if (!name) continue;
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;
  if (lat === undefined || lng === undefined) continue;
  const locality = tags["addr:suburb"] ?? tags["addr:city"] ?? cityName;
  const base = placeSlug(tags["name:en"] ?? name, locality);
  const slug = uniqueSlug(base || "place", taken);
  taken.add(slug);
  const kind = /prayer room/i.test(name) ? "prayer_room" : "mosque";
  const address = [tags["addr:street"], tags["addr:postcode"]].filter(Boolean).join(", ") || null;
  const timezone = tzLookup(lat, lng);
  const sql = `INSERT INTO place (id, slug, name, name_local, kind, status, lat, lng, geohash6, address, locality, region, country_code, city_slug, timezone, calc_method, asr_madhab, osm_type, osm_id, website, phone, wheelchair, created_at, updated_at)
VALUES (${q(crypto.randomUUID())}, ${q(slug)}, ${q(tags["name:en"] ?? name)}, ${q(tags["name:en"] ? name : null)}, ${q(kind)}, 'active', ${lat}, ${lng}, ${q(encodeGeohash(lat, lng))}, ${q(address)}, ${q(locality)}, ${q(tags["addr:state"] ?? null)}, ${q(country)}, ${q(citySlug)}, ${q(timezone)}, 'MuslimWorldLeague', 'shafi', ${q(element.type)}, ${element.id}, ${q(tags.website ?? tags["contact:website"] ?? null)}, ${q(tags.phone ?? tags["contact:phone"] ?? null)}, ${q(tags.wheelchair ?? null)}, ${now}, ${now})
ON CONFLICT(osm_type, osm_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, address=excluded.address, website=excluded.website, phone=excluded.phone, wheelchair=excluded.wheelchair, updated_at=excluded.updated_at;`;
  process.stdout.write(`${sql}\n`);
}

function q(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replaceAll("'", "''")}'`;
}
