import { ulid } from "@/lib/id";
import { AMENITIES } from "@/lib/trust/facts";

/**
 * Monthly open-data export (spec P8): every active or closed place with its current community
 * facts and how many people back them, as GeoJSON and CSV under the ODbL. No user data: no
 * authors, voters, check-ins or accounts, and no free-text notes people wrote.
 *
 * Reads D1 in pages of 1,000 places (keyset on id) and streams both files to R2 as multipart
 * uploads, so memory stays flat however large the directory grows.
 */

export const EXPORT_PREFIX = "open-data/";
const PAGE = 1_000;
/** R2 multipart parts must be at least 5 MiB, except the last. */
const PART_BYTES = 5 * 1024 * 1024;
const STALE_RUN_MS = 2 * 60 * 60 * 1000;

export const CSV_COLUMNS = [
  "id",
  "slug",
  "name",
  "name_local",
  "kind",
  "status",
  "lat",
  "lng",
  "address",
  "locality",
  "region",
  "country",
  "timezone",
  "osm_type",
  "osm_id",
  "website",
  "calc_method",
  "asr_madhab",
  "verification",
  "last_verified_at",
  "fajr_iqamah",
  "dhuhr_iqamah",
  "asr_iqamah",
  "maghrib_iqamah",
  "isha_iqamah",
  "jumuah",
  "amenities",
  "verified_facts",
  "confirmations",
  "url",
] as const;

type PlaceRow = {
  id: string;
  slug: string;
  name: string;
  name_local: string | null;
  kind: string;
  status: string;
  lat: number;
  lng: number;
  address: string | null;
  locality: string | null;
  region: string | null;
  country_code: string;
  timezone: string;
  osm_type: string | null;
  osm_id: number | null;
  website: string | null;
  calc_method: string;
  asr_madhab: string;
  verification_state: string;
  last_verified_at: number | null;
};

type FactRow = { place_id: string; key: string; qualifier: string; state: string; value_json: string; backers: number };

export type ExportRecord = {
  properties: Record<(typeof CSV_COLUMNS)[number], string | number | null>;
  iqamah: Record<string, { time?: string; minutes_after_adhan?: number; state: string; confirmations: number }>;
  jumuah: Array<{ jamaah: number; time: string; khutbah: string | null; state: string; confirmations: number }>;
  amenities: Record<string, { available: boolean; state: string; confirmations: number }>;
  lat: number;
  lng: number;
};

function parse(json: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(json) as unknown;
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** One place and its current facts → the export record (pure; tested). */
export function exportRecord(place: PlaceRow, facts: FactRow[], base: string): ExportRecord {
  const iqamah: ExportRecord["iqamah"] = {};
  const jumuah: ExportRecord["jumuah"] = [];
  const amenities: ExportRecord["amenities"] = {};
  let verified = 0;
  let confirmations = 0;
  for (const fact of facts) {
    const value = parse(fact.value_json);
    if (!value) continue;
    if (fact.state === "verified") verified += 1;
    confirmations += fact.backers;
    if (fact.key.startsWith("iqamah.")) {
      const prayer = fact.key.slice("iqamah.".length);
      if (typeof value.t === "string") iqamah[prayer] = { time: value.t, state: fact.state, confirmations: fact.backers };
      else if (typeof value.min === "number") iqamah[prayer] = { minutes_after_adhan: value.min, state: fact.state, confirmations: fact.backers };
    } else if (fact.key === "jumuah.jamaah" && typeof value.t === "string") {
      jumuah.push({
        jamaah: Number(fact.qualifier) || 1,
        time: value.t,
        khutbah: typeof value.khutbah === "string" ? value.khutbah : null,
        state: fact.state,
        confirmations: fact.backers,
      });
    } else if (fact.key.startsWith("amenity.") && typeof value.v === "boolean") {
      amenities[fact.key.slice("amenity.".length)] = { available: value.v, state: fact.state, confirmations: fact.backers };
    }
  }
  jumuah.sort((a, b) => a.jamaah - b.jamaah);
  const iqamahCell = (prayer: string) => {
    const entry = iqamah[prayer];
    if (!entry) return null;
    return entry.time ?? `+${entry.minutes_after_adhan}`;
  };
  const order = new Map<string, number>(AMENITIES.map((amenity, index) => [amenity.slug, index]));
  return {
    lat: place.lat,
    lng: place.lng,
    iqamah,
    jumuah,
    amenities,
    properties: {
      id: place.id,
      slug: place.slug,
      name: place.name,
      name_local: place.name_local,
      kind: place.kind,
      status: place.status,
      lat: Math.round(place.lat * 1e6) / 1e6,
      lng: Math.round(place.lng * 1e6) / 1e6,
      address: place.address,
      locality: place.locality,
      region: place.region,
      country: place.country_code,
      timezone: place.timezone,
      osm_type: place.osm_type,
      osm_id: place.osm_id,
      website: place.website,
      calc_method: place.calc_method,
      asr_madhab: place.asr_madhab,
      verification: place.verification_state,
      last_verified_at: place.last_verified_at ? new Date(place.last_verified_at).toISOString() : null,
      fajr_iqamah: iqamahCell("fajr"),
      dhuhr_iqamah: iqamahCell("dhuhr"),
      asr_iqamah: iqamahCell("asr"),
      maghrib_iqamah: iqamahCell("maghrib"),
      isha_iqamah: iqamahCell("isha"),
      jumuah: jumuah.map((item) => item.time).join(" ") || null,
      amenities:
        Object.entries(amenities)
          .filter(([, item]) => item.available)
          .map(([slug]) => slug)
          .sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99))
          .join(" ") || null,
      verified_facts: verified,
      confirmations,
      url: `${base}/m/${place.slug}`,
    },
  };
}

export function geojsonFeature(record: ExportRecord): string {
  const { lat: _lat, lng: _lng, ...properties } = record.properties;
  return JSON.stringify({
    type: "Feature",
    id: record.properties.id,
    geometry: { type: "Point", coordinates: [record.properties.lng, record.properties.lat] },
    // Flat columns match the CSV (handy in GIS tools); `facts` keeps the structured values with their states.
    properties: { ...properties, facts: { iqamah: record.iqamah, jumuah: record.jumuah, amenities: record.amenities } },
  });
}

function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  // Guard spreadsheet formula injection as well as quoting.
  const safe = /^[=+\-@\t\r]/.test(text) && typeof value === "string" ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function csvRow(record: ExportRecord): string {
  return CSV_COLUMNS.map((column) => csvCell(record.properties[column])).join(",");
}

export function geojsonHeader(period: string, generatedAt: string): string {
  return `{"type":"FeatureCollection","name":"mosques-world-places-${period}","license":"ODbL-1.0","attribution":"© mosques.world contributors, © OpenStreetMap contributors","generated_at":"${generatedAt}","features":[\n`;
}

/** Buffers text into exact 5 MiB parts (R2 needs equal-sized parts, except the last). */
export class PartWriter {
  private buffer = new Uint8Array(PART_BYTES);
  private size = 0;
  private parts: R2UploadedPart[] = [];
  total = 0;
  private readonly encoder = new TextEncoder();

  constructor(private readonly upload: R2MultipartUpload) {}

  async write(text: string) {
    let bytes = this.encoder.encode(text);
    this.total += bytes.length;
    while (bytes.length > 0) {
      const take = Math.min(bytes.length, PART_BYTES - this.size);
      this.buffer.set(bytes.subarray(0, take), this.size);
      this.size += take;
      bytes = bytes.subarray(take);
      if (this.size === PART_BYTES) await this.flush();
    }
  }

  private async flush() {
    if (this.size === 0) return;
    const body = this.buffer.slice(0, this.size);
    this.size = 0;
    this.parts.push(await this.upload.uploadPart(this.parts.length + 1, body));
  }

  async finish() {
    await this.flush();
    await this.upload.complete(this.parts);
  }

  async abort() {
    await this.upload.abort().catch(() => undefined);
  }
}

export function exportKeys(period: string) {
  return { geojson: `${EXPORT_PREFIX}places-${period}.geojson`, csv: `${EXPORT_PREFIX}places-${period}.csv` };
}

export function periodOf(now: number): string {
  return new Date(now).toISOString().slice(0, 7);
}

type ExportEnv = { DB: D1Database; MEDIA: R2Bucket };

/**
 * Runs the export for `period` unless it already finished (or another run started recently).
 * Returns the run id, or null when there was nothing to do.
 */
export async function runExport(env: ExportEnv, input: { period: string; now: number; base: string; force?: boolean }): Promise<string | null> {
  const { DB } = env;
  const existing = await DB.prepare(`SELECT id, status, created_at FROM export_run WHERE kind = 'places' AND period = ?`)
    .bind(input.period)
    .first<{ id: string; status: string; created_at: number }>();
  if (existing && !input.force) {
    if (existing.status === "done") return null;
    if (existing.status === "running" && input.now - existing.created_at < STALE_RUN_MS) return null;
  }
  const keys = exportKeys(input.period);
  const id = existing?.id ?? ulid(input.now);
  await DB.prepare(
    `INSERT INTO export_run (id, kind, period, status, r2_key, csv_key, created_at) VALUES (?, 'places', ?, 'running', ?, ?, ?)
     ON CONFLICT (kind, period) DO UPDATE SET status = 'running', rows = 0, bytes = 0, csv_bytes = 0, error = NULL, created_at = excluded.created_at, finished_at = NULL`,
  )
    .bind(id, input.period, keys.geojson, keys.csv, input.now)
    .run();

  const geojson = new PartWriter(await env.MEDIA.createMultipartUpload(keys.geojson, { httpMetadata: { contentType: "application/geo+json; charset=utf-8" } }));
  const csv = new PartWriter(await env.MEDIA.createMultipartUpload(keys.csv, { httpMetadata: { contentType: "text/csv; charset=utf-8" } }));
  let rows = 0;
  try {
    await geojson.write(geojsonHeader(input.period, new Date(input.now).toISOString()));
    await csv.write(`${CSV_COLUMNS.join(",")}\n`);
    let after = "";
    for (;;) {
      const page = await DB.prepare(
        `SELECT id, slug, name, name_local, kind, status, lat, lng, address, locality, region, country_code, timezone, osm_type, osm_id, website,
                calc_method, asr_madhab, verification_state, last_verified_at
         FROM place WHERE id > ? AND status IN ('active', 'closed') ORDER BY id LIMIT ?`,
      )
        .bind(after, PAGE)
        .all<PlaceRow>();
      const places = page.results ?? [];
      if (places.length === 0) break;
      const first = places[0]!.id;
      const last = places[places.length - 1]!.id;
      // Current standing values only (dated timetable rows are not part of the directory export).
      const facts = await DB.prepare(
        `SELECT fact.place_id, fact.key, fact.qualifier, fact.state, fact_candidate.value_json,
                (SELECT COUNT(*) FROM vote WHERE vote.candidate_id = fact_candidate.id AND vote.polarity > 0) AS backers
         FROM fact JOIN fact_candidate ON fact_candidate.id = fact.current_candidate_id
         WHERE fact.place_id BETWEEN ? AND ? AND fact.key NOT LIKE 'timetable.%' AND fact.key NOT LIKE 'info.%' AND fact.key != 'status.closed'`,
      )
        .bind(first, last)
        .all<FactRow>();
      const byPlace = new Map<string, FactRow[]>();
      for (const fact of facts.results ?? []) {
        const list = byPlace.get(fact.place_id);
        if (list) list.push(fact);
        else byPlace.set(fact.place_id, [fact]);
      }
      let features = "";
      let lines = "";
      for (const place of places) {
        const record = exportRecord(place, byPlace.get(place.id) ?? [], input.base);
        features += `${rows === 0 ? "" : ",\n"}${geojsonFeature(record)}`;
        lines += `${csvRow(record)}\n`;
        rows += 1;
      }
      await geojson.write(features);
      await csv.write(lines);
      after = last;
      if (places.length < PAGE) break;
    }
    await geojson.write("\n]}\n");
    await geojson.finish();
    await csv.finish();
    await DB.prepare(`UPDATE export_run SET status = 'done', rows = ?, bytes = ?, csv_bytes = ?, finished_at = ? WHERE id = ?`)
      .bind(rows, geojson.total, csv.total, Date.now(), id)
      .run();
    return id;
  } catch (error) {
    await geojson.abort();
    await csv.abort();
    await DB.prepare(`UPDATE export_run SET status = 'failed', error = ?, finished_at = ? WHERE id = ?`)
      .bind(String(error instanceof Error ? error.message : error).slice(0, 500), Date.now(), id)
      .run();
    throw error;
  }
}

export type ExportView = { period: string; rows: number; bytes: number; csvBytes: number; finishedAt: number; geojson: string; csv: string };

export async function publishedExports(db: D1Database, limit = 12): Promise<ExportView[]> {
  const rows = await db
    .prepare(`SELECT period, rows, bytes, csv_bytes, finished_at, r2_key, csv_key FROM export_run WHERE kind = 'places' AND status = 'done' ORDER BY period DESC LIMIT ?`)
    .bind(limit)
    .all<{ period: string; rows: number; bytes: number; csv_bytes: number; finished_at: number; r2_key: string; csv_key: string }>();
  return (rows.results ?? []).map((row) => ({
    period: row.period,
    rows: row.rows,
    bytes: row.bytes,
    csvBytes: row.csv_bytes,
    finishedAt: row.finished_at,
    geojson: row.r2_key.slice(EXPORT_PREFIX.length),
    csv: row.csv_key.slice(EXPORT_PREFIX.length),
  }));
}

export function isExportMessage(body: unknown): body is { type: "open_data_export"; period: string } {
  return Boolean(body) && typeof body === "object" && (body as { type?: string }).type === "open_data_export" && typeof (body as { period?: unknown }).period === "string";
}

/**
 * Nightly check (spec P8, monthly export): the first night a month has no finished export, queue
 * one. Every other night this is a single indexed read.
 */
export async function queueMonthlyExport(env: { DB: D1Database; Q_RECOMPUTE?: Queue }, now: number): Promise<boolean> {
  const period = periodOf(now);
  const run = await env.DB.prepare(`SELECT status, created_at FROM export_run WHERE kind = 'places' AND period = ?`)
    .bind(period)
    .first<{ status: string; created_at: number }>();
  if (run && (run.status === "done" || (run.status === "running" && now - run.created_at < STALE_RUN_MS))) return false;
  if (!env.Q_RECOMPUTE) return false;
  await env.Q_RECOMPUTE.send({ type: "open_data_export", period });
  return true;
}
