import { haversineKm } from "@/lib/geo/distance";
import { geohashBounds } from "@/lib/osm-fill";
import type { Bbox } from "@/lib/geo/distance";

/**
 * Free open-data enrichment on top of OpenStreetMap (spec 2.5 data sources): match each place to its
 * Wikidata item, then take a freely licensed photo from Wikimedia Commons and a short summary from
 * Wikipedia. Everything here is CC0 (Wikidata) or CC BY-SA (Commons, Wikipedia) and is shown with its
 * attribution. Areas are matched one geohash-4 cell at a time, like the OSM area fill, and refreshed
 * quarterly by the nightly cron. Community data always wins: we only fill empty fields.
 */

export const USER_AGENT = "mosques.world/1.0 (https://mosques.world; open-data enrichment)";
const SPARQL = "https://query.wikidata.org/sparql";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const REFRESH_MS = 90 * 24 * 3_600_000;
const RETRY_MS = 24 * 3_600_000;
const CELL_PRECISION = 4;

export type WikidataMosque = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  /** Commons file name, without the "File:" prefix. */
  image: string | null;
  website: string | null;
  inception: string | null;
  /** English Wikipedia article title. */
  article: string | null;
  nameAr: string | null;
};

export type CommonsImage = { file: string; thumb: string; page: string; author: string | null; license: string; licenseUrl: string | null };
export type WikipediaSummary = { title: string; url: string; extract: string };
export type Enrichment = {
  wikidata: string;
  image?: CommonsImage;
  wikipedia?: WikipediaSummary;
  inception?: string;
  nameAr?: string;
};

/** SPARQL for every mosque Wikidata knows inside a box (instances of Q32815 or its subclasses). */
export function boxQuery(bbox: Bbox): string {
  return `SELECT ?item ?itemLabel ?coord ?image ?website ?inception ?article ?arLabel WHERE {
  SERVICE wikibase:box { ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:cornerWest "Point(${bbox.west} ${bbox.south})"^^geo:wktLiteral .
    bd:serviceParam wikibase:cornerEast "Point(${bbox.east} ${bbox.north})"^^geo:wktLiteral . }
  ?item wdt:P31/wdt:P279* wd:Q32815 .
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?item rdfs:label ?arLabel FILTER(lang(?arLabel) = "ar") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ar,tr,ur,fr,id,ms,de". }
} LIMIT 2000`;
}

type Binding = Record<string, { value: string } | undefined>;

/** One row per item (SPARQL repeats an item once per extra image or website). */
export function parseSparql(json: unknown): WikidataMosque[] {
  const bindings = ((json as { results?: { bindings?: Binding[] } } | null)?.results?.bindings ?? []) as Binding[];
  const byId = new Map<string, WikidataMosque>();
  for (const row of bindings) {
    const id = row.item?.value.split("/").pop();
    const point = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(row.coord?.value ?? "");
    if (!id || !/^Q\d+$/.test(id) || !point) continue;
    if (byId.has(id)) continue;
    const label = row.itemLabel?.value ?? id;
    byId.set(id, {
      id,
      label: label === id ? "" : label,
      lng: Number(point[1]),
      lat: Number(point[2]),
      image: row.image ? decodeURIComponent(row.image.value.split("/Special:FilePath/").pop() ?? "").replace(/_/g, " ") || null : null,
      website: row.website?.value ?? null,
      inception: /^[+-]?(\d{3,4})-/.exec(row.inception?.value ?? "")?.[1] ?? null,
      article: row.article ? decodeURIComponent(row.article.value.split("/wiki/").pop() ?? "").replace(/_/g, " ") || null : null,
      nameAr: row.arLabel?.value ?? null,
    });
  }
  return [...byId.values()];
}

const FILLER = new Set(["the", "and", "of", "al", "el", "mosque", "masjid", "masjed", "mesjid", "mescidi", "camii", "cami", "jamia", "jami", "jame", "islamic", "muslim", "centre", "center", "community", "cultural", "society", "trust", "e", "ul", "i"]);

function tokens(name: string): Set<string> {
  return new Set(
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((word) => word.length > 1 && !FILLER.has(word)),
  );
}

/** Overlap of the telling words in two names, 0–1 (Dice coefficient). */
export function nameSimilarity(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return (2 * shared) / (left.size + right.size);
}

type PlaceRef = { id: string; name: string; lat: number; lng: number };

/**
 * Pairs places with Wikidata items. Wikidata coordinates are often a building centroid or rounded,
 * so a name match reaches further than a bare proximity match. Each item goes to its best place only;
 * when two places would both claim the same item they are probably duplicates, which we report.
 */
export function matchPlaces(places: PlaceRef[], items: WikidataMosque[]): { matches: Map<string, WikidataMosque>; duplicates: Array<{ wikidata: string; placeIds: string[] }> } {
  const candidates: Array<{ place: PlaceRef; item: WikidataMosque; score: number }> = [];
  for (const item of items) {
    for (const place of places) {
      const metres = haversineKm(place.lat, place.lng, item.lat, item.lng) * 1000;
      if (metres > 1500) continue;
      const similarity = item.label ? nameSimilarity(place.name, item.label) : 0;
      const accepted = metres <= 60 || (metres <= 400 && similarity >= 0.5) || similarity >= 0.8;
      if (!accepted) continue;
      candidates.push({ place, item, score: similarity * 2 - metres / 1000 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const matches = new Map<string, WikidataMosque>();
  const taken = new Set<string>();
  const claims = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (candidate.item.label && nameSimilarity(candidate.place.name, candidate.item.label) >= 0.8) {
      const set = claims.get(candidate.item.id) ?? new Set<string>();
      set.add(candidate.place.id);
      claims.set(candidate.item.id, set);
    }
    if (matches.has(candidate.place.id) || taken.has(candidate.item.id)) continue;
    matches.set(candidate.place.id, candidate.item);
    taken.add(candidate.item.id);
  }
  const duplicates = [...claims.entries()].filter(([, ids]) => ids.size > 1).map(([wikidata, ids]) => ({ wikidata, placeIds: [...ids].sort() }));
  return { matches, duplicates };
}

/** Plain text from Commons' HTML credit fields ("<a href=…>Jane</a>" → "Jane"). */
function plain(html: string | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, 120) : null;
}

/** Commons imageinfo for several files at once. Files without a usable free licence are left out. */
export function parseImageInfo(json: unknown): Map<string, CommonsImage> {
  type Page = {
    title?: string;
    imageinfo?: Array<{ thumburl?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string } | undefined> }>;
  };
  const query = (json as { query?: { pages?: Record<string, Page>; normalized?: Array<{ from: string; to: string }> } } | null)?.query;
  const out = new Map<string, CommonsImage>();
  const original = new Map((query?.normalized ?? []).map((item) => [item.to, item.from]));
  for (const page of Object.values(query?.pages ?? {})) {
    const info = page.imageinfo?.[0];
    const meta = info?.extmetadata ?? {};
    const license = plain(meta.LicenseShortName?.value);
    if (!page.title || !info?.thumburl || !info.descriptionurl || !license) continue;
    // Only licences that let anyone reuse the photo: public domain, CC0, CC BY and CC BY-SA.
    if (!/^(public domain|pd|cc0|cc[ -]by)/i.test(license) || /\bnc\b|\bnd\b/i.test(license)) continue;
    const file = (original.get(page.title) ?? page.title).replace(/^File:/, "");
    out.set(file, {
      file,
      // Drop Commons' tracking parameters; the URL itself is stable.
      thumb: info.thumburl.split("?")[0] ?? info.thumburl,
      page: info.descriptionurl,
      author: plain(meta.Artist?.value),
      license,
      licenseUrl: meta.LicenseUrl?.value ?? null,
    });
  }
  return out;
}

/** Wikipedia's REST summary: the first sentence or two, trimmed for the mosque page. */
export function parseSummary(json: unknown): WikipediaSummary | null {
  const body = json as { type?: string; title?: string; extract?: string; content_urls?: { desktop?: { page?: string } } } | null;
  if (!body?.title || !body.extract || body.type === "disambiguation") return null;
  const sentences = body.extract.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+(\s|$)/g) ?? [body.extract];
  let extract = "";
  for (const [index, sentence] of sentences.entries()) {
    if (index >= 2 || (extract && extract.length + sentence.length > 320)) break;
    extract += sentence;
  }
  extract = extract.trim();
  if (extract.length > 360) extract = `${extract.slice(0, 357).trimEnd()}…`;
  return { title: body.title, url: body.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(body.title.replace(/ /g, "_"))}`, extract };
}

export function parseEnrichment(json: string | null | undefined): Enrichment | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Enrichment;
    return typeof value?.wikidata === "string" ? value : null;
  } catch {
    return null;
  }
}

async function getJson(fetcher: typeof fetch, url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetcher(url, { ...init, headers: { "user-agent": USER_AGENT, accept: "application/json", ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error(`${new URL(url).hostname} ${response.status}`);
  return response.json();
}

export async function wikidataMosques(fetcher: typeof fetch, bbox: Bbox): Promise<WikidataMosque[]> {
  const body = new URLSearchParams({ query: boxQuery(bbox) });
  return parseSparql(
    await getJson(fetcher, SPARQL, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/sparql-results+json" } }),
  );
}

export async function commonsImages(fetcher: typeof fetch, files: string[]): Promise<Map<string, CommonsImage>> {
  const out = new Map<string, CommonsImage>();
  for (let index = 0; index < files.length; index += 50) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "800",
      iiextmetadatafilter: "Artist|LicenseShortName|LicenseUrl",
      titles: files
        .slice(index, index + 50)
        .map((file) => `File:${file}`)
        .join("|"),
    });
    for (const [file, image] of parseImageInfo(await getJson(fetcher, `${COMMONS_API}?${params}`))) out.set(file, image);
  }
  return out;
}

export async function wikipediaSummary(fetcher: typeof fetch, title: string): Promise<WikipediaSummary | null> {
  return parseSummary(await getJson(fetcher, `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`));
}

export type EnrichResult = { cell: string; status: "done" | "failed"; matched: number; duplicates: Array<{ wikidata: string; placeIds: string[] }>; error?: string };

/** Matches one geohash-4 cell's places against Wikidata and stores what it finds. */
export async function enrichCell(db: D1Database, cell: string, fetcher: typeof fetch, now: number): Promise<EnrichResult> {
  try {
    const bbox = geohashBounds(cell);
    const places = await db
      .prepare(`SELECT id, name, lat, lng, website FROM place WHERE status != 'merged' AND geohash6 >= ? AND geohash6 < ?`)
      .bind(cell, `${cell}~`)
      .all<PlaceRef & { website: string | null }>();
    const rows = places.results ?? [];
    const items = rows.length > 0 ? await wikidataMosques(fetcher, bbox) : [];
    const { matches, duplicates } = matchPlaces(rows, items);
    const files = [...new Set([...matches.values()].map((item) => item.image).filter((file): file is string => Boolean(file)))];
    // Photos and summaries are extras: an outage or rate limit there still stores the Wikidata match.
    const images = files.length > 0 ? await commonsImages(fetcher, files).catch(() => new Map<string, CommonsImage>()) : new Map<string, CommonsImage>();
    const statements: D1PreparedStatement[] = [];
    for (const place of rows) {
      const item = matches.get(place.id);
      if (!item) continue;
      const summary = item.article ? await wikipediaSummary(fetcher, item.article).catch(() => null) : null;
      const enrichment: Enrichment = {
        wikidata: item.id,
        ...(item.image && images.get(item.image) ? { image: images.get(item.image) } : {}),
        ...(summary ? { wikipedia: summary } : {}),
        ...(item.inception ? { inception: item.inception } : {}),
        ...(item.nameAr ? { nameAr: item.nameAr } : {}),
      };
      statements.push(
        db
          .prepare(`UPDATE place SET wikidata_id = ?, enrichment_json = ?, website = COALESCE(website, ?), updated_at = ? WHERE id = ?`)
          .bind(item.id, JSON.stringify(enrichment), item.website && /^https?:\/\//.test(item.website) ? item.website : null, now, place.id),
      );
    }
    // Two places that are both the same Wikidata mosque go to the moderators' duplicate queue (never merged automatically).
    const byId = new Map(rows.map((place) => [place.id, place]));
    for (const duplicate of duplicates) {
      for (const [index, aId] of duplicate.placeIds.entries()) {
        for (const bId of duplicate.placeIds.slice(index + 1)) {
          const a = byId.get(aId);
          const b = byId.get(bId);
          if (!a || !b) continue;
          statements.push(
            db
              .prepare(
                `INSERT INTO place_duplicate_candidate (a_id, b_id, distance_m, name_similarity, status, created_at)
                 VALUES (?, ?, ?, ?, 'open', ?) ON CONFLICT DO NOTHING`,
              )
              .bind(aId, bId, Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * 1000), nameSimilarity(a.name, b.name), now),
          );
        }
      }
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO enrich_cell (geohash, status, synced_at, matched, error) VALUES (?, 'done', ?, ?, NULL)
           ON CONFLICT (geohash) DO UPDATE SET status = 'done', synced_at = excluded.synced_at, matched = excluded.matched, error = NULL`,
        )
        .bind(cell, now, matches.size),
    );
    await db.batch(statements);
    return { cell, status: "done", matched: matches.size, duplicates };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .prepare(
        `INSERT INTO enrich_cell (geohash, status, synced_at, matched, error) VALUES (?, 'failed', ?, 0, ?)
         ON CONFLICT (geohash) DO UPDATE SET status = 'failed', synced_at = excluded.synced_at, error = excluded.error`,
      )
      .bind(cell, now, message.slice(0, 200))
      .run();
    return { cell, status: "failed", matched: 0, duplicates: [], error: message };
  }
}

/** Cells with places that were never matched, failed a day ago, or were matched over 90 days ago. */
export async function cellsToEnrich(db: D1Database, now: number, limit: number): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT substr(p.geohash6, 1, ${CELL_PRECISION}) AS cell, COUNT(*) AS n
       FROM place p LEFT JOIN enrich_cell e ON e.geohash = substr(p.geohash6, 1, ${CELL_PRECISION})
       WHERE p.status = 'active' AND (e.geohash IS NULL OR (e.status = 'done' AND e.synced_at < ?) OR (e.status = 'failed' AND e.synced_at < ?))
       GROUP BY cell ORDER BY n DESC LIMIT ?`,
    )
    .bind(now - REFRESH_MS, now - RETRY_MS, limit)
    .all<{ cell: string }>();
  return (result.results ?? []).map((row) => row.cell);
}

/** Nightly: enrich a few areas, busiest first, gently enough for Wikimedia's public endpoints. */
export async function enrichStaleCells(db: D1Database, fetcher: typeof fetch, now: number, limit = 3): Promise<EnrichResult[]> {
  const results: EnrichResult[] = [];
  for (const cell of await cellsToEnrich(db, now, limit)) {
    const result = await enrichCell(db, cell, fetcher, now);
    if (result.status === "failed") console.error("Enrichment failed", cell, result.error);
    if (result.duplicates.length > 0) console.warn("Possible duplicate places", JSON.stringify(result.duplicates));
    results.push(result);
  }
  return results;
}

/** The same Commons thumbnail at another width ("…/800px-a.jpg" → "…/120px-a.jpg"). */
export function commonsThumb(url: string, width: number): string {
  return url.replace(/\/(\d+)px-([^/]+)$/, `/${width}px-$2`);
}
