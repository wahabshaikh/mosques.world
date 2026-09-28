import { osmPlaceRow, overpassQuery, type OsmElement } from "../lib/osm";

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
const query = overpassQuery({ south, west, north, east });

const response = await fetch("https://overpass-api.de/api/interpreter", {
  method: "POST",
  headers: { "user-agent": "mosques.world import" },
  body: query,
});
if (!response.ok) {
  console.error(`Overpass failed: ${response.status}`);
  process.exit(1);
}
const body = (await response.json()) as { elements: OsmElement[] };
const taken = new Set<string>();
const now = Date.now();

for (const element of body.elements) {
  const row = osmPlaceRow(element, { country, citySlug, cityName, taken, now });
  if (!row) continue;
  const sql = `INSERT INTO place (id, slug, name, name_local, kind, status, lat, lng, geohash6, address, locality, region, country_code, city_slug, timezone, calc_method, asr_madhab, osm_type, osm_id, website, phone, wheelchair, created_at, updated_at)
VALUES (${q(row.id)}, ${q(row.slug)}, ${q(row.name)}, ${q(row.nameLocal)}, ${q(row.kind)}, 'active', ${row.lat}, ${row.lng}, ${q(row.geohash6)}, ${q(row.address)}, ${q(row.locality)}, ${q(row.region)}, ${q(row.countryCode)}, ${q(row.citySlug)}, ${q(row.timezone)}, 'MuslimWorldLeague', 'shafi', ${q(row.osmType)}, ${row.osmId}, ${q(row.website)}, ${q(row.phone)}, ${q(row.wheelchair)}, ${now}, ${now})
ON CONFLICT(osm_type, osm_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng, address=excluded.address, website=excluded.website, phone=excluded.phone, wheelchair=excluded.wheelchair, updated_at=excluded.updated_at;`;
  process.stdout.write(`${sql}\n`);
}

function q(value: string | null): string {
  if (value === null) return "NULL";
  return `'${value.replaceAll("'", "''")}'`;
}
