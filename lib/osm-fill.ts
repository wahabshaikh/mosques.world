import { encodeGeohash } from "@/lib/geo/geohash";
import type { Bbox } from "@/lib/geo/distance";
import { nameArea, type AreaName } from "@/lib/geocode";
import { likelyDuplicates } from "@/lib/places/duplicates";
import { osmPlaceRow, overpassQuery, stepFreeStatements, type OsmElement, type OsmPlaceRow } from "@/lib/osm";
import { slugify } from "@/lib/slug";

/**
 * On-demand directory fill from OpenStreetMap (free, no key). The directory used to grow city by city
 * from a manual import, so most of the world showed "0 mosques nearby". Now the first visit to an area
 * pulls its mosques from Overpass into D1, one geohash-4 cell (≈39×20 km) at a time, and every later
 * visit is served from D1. Cells re-sync monthly through the weekly cron.
 */

export const CELL_PRECISION = 4;
/** A viewport needing more cells than this is zoomed out too far to fill. */
export const MAX_CELLS = 6;
const LOCK_MS = 2 * 60 * 1000;
const RETRY_FAILED_MS = 30 * 60 * 1000;
export const RESYNC_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ELEMENTS = 4000;
/** OSM places a cell needs before we treat it as already seeded. */
const SEEDED_MIN = 10;
const BATCH = 50;

export const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/** The lat/lng box a geohash covers. */
export function geohashBounds(hash: string): Bbox {
  let even = true;
  const lat: [number, number] = [-90, 90];
  const lng: [number, number] = [-180, 180];
  for (const char of hash) {
    const value = BASE32.indexOf(char);
    if (value < 0) throw new Error(`Bad geohash ${hash}`);
    for (let bit = 4; bit >= 0; bit -= 1) {
      const range = even ? lng : lat;
      const mid = (range[0] + range[1]) / 2;
      if ((value >> bit) & 1) range[0] = mid;
      else range[1] = mid;
      even = !even;
    }
  }
  return { south: lat[0], north: lat[1], west: lng[0], east: lng[1] };
}

/** Cells covering a viewport, centre first; null when it would take more than `max` (zoomed out). */
export function cellsCovering(bbox: Bbox, max = MAX_CELLS, precision = CELL_PRECISION): string[] | null {
  const centre = encodeGeohash((bbox.south + bbox.north) / 2, (bbox.west + bbox.east) / 2, precision);
  const size = geohashBounds(centre);
  // Sample at half a cell so no cell the viewport touches is skipped, edges included.
  const latStep = (size.north - size.south) / 2;
  const lngStep = (size.east - size.west) / 2;
  if ((bbox.north - bbox.south) / latStep > max * 2 + 2 || (bbox.east - bbox.west) / lngStep > max * 2 + 2) return null;
  const axis = (from: number, to: number, step: number) => {
    const points: number[] = [];
    for (let value = from; value < to; value += step) points.push(value);
    points.push(to);
    return points;
  };
  const cells = new Set<string>([centre]);
  for (const lat of axis(bbox.south, bbox.north, latStep)) {
    for (const lng of axis(bbox.west, bbox.east, lngStep)) {
      const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
      cells.add(encodeGeohash(Math.max(-89.999, Math.min(89.999, lat)), wrapped, precision));
      if (cells.size > max) return null;
    }
  }
  return [...cells];
}

type CellRow = { geohash: string; status: "filling" | "done" | "failed"; started_at: number; synced_at: number | null };

/** Cells from `cells` that still need a fill (never synced, failed a while ago, or stale). */
export async function cellsNeedingFill(db: D1Database, cells: string[], now: number): Promise<string[]> {
  if (cells.length === 0) return [];
  const result = await db
    .prepare(`SELECT geohash, status, started_at, synced_at FROM osm_cell WHERE geohash IN (${cells.map(() => "?").join(",")})`)
    .bind(...cells)
    .all<CellRow>();
  const known = new Map((result.results ?? []).map((row) => [row.geohash, row]));
  // Cells already seeded from OpenStreetMap before area fill existed (London, Istanbul…) stay with the
  // weekly city sync. A handful of OSM places (a city seeded with one mosque) doesn't count as seeded.
  const unknown = cells.filter((cell) => !known.has(cell));
  const seeded = new Set<string>();
  if (unknown.length > 0) {
    // One grouped query (D1 caps compound SELECTs at a few terms, so no UNION per cell).
    const checks = await db
      .prepare(
        `SELECT substr(geohash6, 1, ${CELL_PRECISION}) AS cell FROM place
         WHERE osm_id IS NOT NULL AND (${unknown.map(() => "(geohash6 >= ? AND geohash6 < ?)").join(" OR ")})
         GROUP BY cell HAVING COUNT(*) >= ${SEEDED_MIN}`,
      )
      .bind(...unknown.flatMap((cell) => [cell, `${cell}~`]))
      .all<{ cell: string }>();
    for (const row of checks.results ?? []) seeded.add(row.cell);
  }
  return cells.filter((cell) => {
    const row = known.get(cell);
    if (!row) return !seeded.has(cell);
    if (row.status === "done") return now - (row.synced_at ?? 0) > RESYNC_MS;
    if (row.status === "filling") return now - row.started_at > LOCK_MS;
    return now - row.started_at > RETRY_FAILED_MS;
  });
}

/** Takes the cell's lock; false when another request is filling it or it is fresh. */
export async function claimCell(db: D1Database, cell: string, now: number): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO osm_cell (geohash, status, started_at) VALUES (?, 'filling', ?)
       ON CONFLICT (geohash) DO UPDATE SET status = 'filling', started_at = excluded.started_at, error = NULL
       WHERE (osm_cell.status = 'filling' AND osm_cell.started_at < ?)
          OR (osm_cell.status = 'failed' AND osm_cell.started_at < ?)
          OR (osm_cell.status = 'done' AND coalesce(osm_cell.synced_at, 0) < ?)`,
    )
    .bind(cell, now, now - LOCK_MS, now - RETRY_FAILED_MS, now - RESYNC_MS)
    .run();
  return Boolean(result.meta.changes);
}

/** Posts the query to Overpass, falling back to mirrors on rate limits and timeouts. */
export async function fetchOverpass(bbox: Bbox, fetcher: typeof fetch): Promise<OsmElement[]> {
  const body = new URLSearchParams({ data: overpassQuery(bbox).replace("[timeout:90]", "[timeout:25]") });
  let lastError = "Overpass unavailable";
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { "user-agent": "mosques.world area fill (https://mosques.world/attribution)", "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (response.ok) return ((await response.json()) as { elements?: OsmElement[] }).elements ?? [];
      lastError = `Overpass ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(lastError);
}

type FillEnv = { DB: D1Database; CACHE?: KVNamespace };

export type FillResult = { cell: string; inserted: number; skipped?: "busy" | "fresh"; error?: string };

/**
 * Fills one cell: Overpass → normalised rows → D1. Existing places are never touched (community edits
 * win); OSM elements we already have, or that moderators excluded, are skipped by the unique index and
 * the osm_exclusion trigger.
 */
export async function fillCell(env: FillEnv, cell: string, fetcher: typeof fetch, now: number): Promise<FillResult> {
  if (!(await claimCell(env.DB, cell, now))) return { cell, inserted: 0, skipped: "busy" };
  try {
    const bounds = geohashBounds(cell);
    const centre = { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 };
    const elements = await fetchOverpass(bounds, fetcher);
    // Only name the area (one Photon call) when there is something to file under it.
    const area = elements.length > 0 ? await nameArea(centre.lat, centre.lng, { cache: env.CACHE, fetcher, cell }) : null;
    const inserted = elements.length > 0 ? await insertElements(env.DB, cell, elements.slice(0, MAX_ELEMENTS), area, centre, now) : 0;
    await env.DB.prepare(`UPDATE osm_cell SET status = 'done', synced_at = ?, inserted = ?, error = NULL WHERE geohash = ?`).bind(now, inserted, cell).run();
    return { cell, inserted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await env.DB.prepare(`UPDATE osm_cell SET status = 'failed', error = ? WHERE geohash = ?`).bind(message.slice(0, 200), cell).run();
    return { cell, inserted: 0, error: message };
  }
}

/** The part of a viewport we fill: at most ~16 km around its centre, so zoomed-out views stay cheap. */
export function fillWindow(bbox: Bbox, radiusDeg = 0.15): Bbox {
  const lat = (bbox.south + bbox.north) / 2;
  const lng = (bbox.west + bbox.east) / 2;
  const lngRadius = radiusDeg / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  return {
    south: Math.max(bbox.south, lat - radiusDeg),
    north: Math.min(bbox.north, lat + radiusDeg),
    west: Math.max(bbox.west, lng - lngRadius),
    east: Math.min(bbox.east, lng + lngRadius),
  };
}

/** Cells of the fill window, nearest the centre first. */
export function fillCells(bbox: Bbox): string[] {
  const window = fillWindow(bbox);
  const lat = (window.south + window.north) / 2;
  const lng = (window.west + window.east) / 2;
  const cells = cellsCovering(window, 12) ?? [encodeGeohash(lat, lng, CELL_PRECISION)];
  const distance = (cell: string) => {
    const box = geohashBounds(cell);
    return ((box.south + box.north) / 2 - lat) ** 2 + ((box.west + box.east) / 2 - lng) ** 2;
  };
  return cells.sort((a, b) => distance(a) - distance(b));
}

/**
 * Fills up to `perRequest` due cells of a viewport, one after another (Overpass allows only a couple of
 * concurrent queries per IP). The client calls again while `remaining` is above zero, so the nearest
 * mosques appear first.
 */
export async function fillArea(
  env: FillEnv,
  bbox: Bbox,
  fetcher: typeof fetch,
  now: number,
  perRequest = 2,
): Promise<{ results: FillResult[]; remaining: number; busy: number }> {
  const cells = fillCells(bbox);
  const due = await cellsNeedingFill(env.DB, cells, now);
  const results: FillResult[] = [];
  for (const cell of due.slice(0, perRequest)) results.push(await fillCell(env, cell, fetcher, now));
  const busy = (await cellsFilling(env.DB, cells, now)).length + results.filter((result) => result.skipped === "busy").length;
  return { results, remaining: Math.max(0, due.length - results.length), busy };
}

/** Cells another request is filling right now (the client waits for them, then refreshes). */
export async function cellsFilling(db: D1Database, cells: string[], now: number): Promise<string[]> {
  if (cells.length === 0) return [];
  const result = await db
    .prepare(`SELECT geohash FROM osm_cell WHERE status = 'filling' AND started_at >= ? AND geohash IN (${cells.map(() => "?").join(",")})`)
    .bind(now - LOCK_MS, ...cells)
    .all<{ geohash: string }>();
  return (result.results ?? []).map((row) => row.geohash);
}

/** Whether any cell around the viewport's centre is unfilled or being filled (the explore page asks the client to fill). */
export async function areaNeedsFill(db: D1Database, bbox: Bbox, now: number): Promise<boolean> {
  const cells = fillCells(bbox);
  return (await cellsNeedingFill(db, cells, now)).length > 0 || (await cellsFilling(db, cells, now)).length > 0;
}

const INSERT_PLACE = `INSERT INTO place (id, slug, name, name_local, kind, status, lat, lng, geohash6, address, locality, region, country_code, city_slug, timezone,
    calc_method, asr_madhab, osm_type, osm_id, website, phone, wheelchair, wikidata_id, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`;

async function insertElements(
  db: D1Database,
  cell: string,
  elements: OsmElement[],
  area: AreaName | null,
  centre: { lat: number; lng: number },
  now: number,
): Promise<number> {
  if (!area) throw new Error("Could not name this area");
  const existing = await db
    .prepare(`SELECT osm_type, osm_id, slug FROM place WHERE geohash6 >= ? AND geohash6 < ?`)
    .bind(cell, `${cell}~`)
    .all<{ osm_type: string | null; osm_id: number | null; slug: string }>();
  const known = new Set((existing.results ?? []).map((row) => `${row.osm_type}/${row.osm_id}`));
  const taken = new Set((existing.results ?? []).map((row) => row.slug));
  const citySlug = slugify(area.city) || slugify(area.countryCode);
  const countries = new Set<string>([area.countryCode]);
  const rows: OsmPlaceRow[] = [];
  for (const element of elements) {
    if (known.has(`${element.type}/${element.id}`)) continue;
    const country = /^[A-Z]{2}$/i.test(element.tags?.["addr:country"] ?? "") ? element.tags!["addr:country"]!.toUpperCase() : area.countryCode;
    const row = osmPlaceRow(element, { country, citySlug, cityName: area.city, taken, now });
    if (!row) continue;
    row.region ??= area.region;
    countries.add(country);
    rows.push(row);
  }
  if (rows.length === 0) return 0;

  const defaults = new Map<string, { calc_method: string; asr_madhab: string }>();
  const list = [...countries];
  const found = await db
    .prepare(`SELECT country_code, calc_method, asr_madhab FROM calc_default WHERE country_code IN (${list.map(() => "?").join(",")})`)
    .bind(...list)
    .all<{ country_code: string; calc_method: string; asr_madhab: string }>();
  for (const row of found.results ?? []) defaults.set(row.country_code, row);

  await db
    .prepare(`INSERT INTO city (country_code, city_slug, name, lat, lng, place_count) SELECT ?, ?, ?, ?, ?, 0 WHERE NOT EXISTS (SELECT 1 FROM city WHERE country_code = ? AND city_slug = ?)`)
    .bind(area.countryCode, citySlug, area.city, centre.lat, centre.lng, area.countryCode, citySlug)
    .run();

  const statement = (row: OsmPlaceRow) => {
    const preset = defaults.get(row.countryCode);
    return db
      .prepare(INSERT_PLACE)
      .bind(
        row.id, row.slug, row.name, row.nameLocal, row.kind, row.lat, row.lng, row.geohash6, row.address, row.locality, row.region,
        row.countryCode, row.citySlug, row.timezone, preset?.calc_method ?? "MuslimWorldLeague", preset?.asr_madhab ?? "shafi",
        row.osmType, row.osmId, row.website, row.phone, row.wheelchair, row.wikidataId, now, now,
      );
  };

  let inserted = 0;
  const retry: OsmPlaceRow[] = [];
  const landed: OsmPlaceRow[] = [];
  for (let start = 0; start < rows.length; start += BATCH) {
    const chunk = rows.slice(start, start + BATCH);
    const results = await db.batch(chunk.map(statement));
    results.forEach((result, index) => {
      const row = chunk[index]!;
      if (result.meta.changes) landed.push(row);
      else retry.push(row);
    });
  }
  // A slug taken elsewhere in the world: retry once with the OSM id, which is unique. Rows that still
  // insert nothing were already known or excluded.
  for (let start = 0; start < retry.length; start += BATCH) {
    const chunk = retry.slice(start, start + BATCH).map((row) => ({ ...row, slug: `${row.slug}-${row.osmId.toString(36)}` }));
    const results = await db.batch(chunk.map(statement));
    results.forEach((result, index) => {
      if (result.meta.changes) landed.push(chunk[index]!);
    });
  }
  inserted = landed.length;
  // New rows that look like a place already here (or each other) go to the moderators' duplicate queue.
  const nearby = await db
    .prepare(`SELECT id, name, lat, lng, geohash6 FROM place WHERE status = 'active' AND geohash6 >= ? AND geohash6 < ?`)
    .bind(cell, `${cell}~`)
    .all<{ id: string; name: string; lat: number; lng: number; geohash6: string }>();
  const fresh = new Set(landed.map((row) => row.id));
  const duplicates = likelyDuplicates(nearby.results ?? []).filter((pair) => fresh.has(pair.aId) || fresh.has(pair.bId));
  const queue = duplicates.map((pair) =>
    db
      .prepare(`INSERT INTO place_duplicate_candidate (a_id, b_id, distance_m, name_similarity, status, created_at) VALUES (?, ?, ?, ?, 'open', ?) ON CONFLICT DO NOTHING`)
      .bind(pair.aId, pair.bId, pair.distanceM, pair.similarity, now),
  );
  for (let start = 0; start < queue.length; start += BATCH) await db.batch(queue.slice(start, start + BATCH));
  const stepFree = landed.flatMap((row) => stepFreeStatements(db, row.id, row.wheelchair, now));
  for (let start = 0; start < stepFree.length; start += BATCH * 2) await db.batch(stepFree.slice(start, start + BATCH * 2));
  return inserted;
}

/** Weekly cron: re-sync the stalest filled cells so new OSM mosques appear without a visit. */
export async function resyncStaleCells(env: FillEnv, fetcher: typeof fetch, now: number, limit = 4): Promise<FillResult[]> {
  const stale = await env.DB.prepare(`SELECT geohash FROM osm_cell WHERE status = 'done' AND synced_at < ? ORDER BY synced_at LIMIT ?`)
    .bind(now - RESYNC_MS, limit)
    .all<{ geohash: string }>();
  const results: FillResult[] = [];
  for (const row of stale.results ?? []) results.push(await fillCell(env, row.geohash, fetcher, now));
  return results;
}
