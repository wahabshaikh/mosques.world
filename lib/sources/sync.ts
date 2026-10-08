import { haversineKm } from "@/lib/geo/distance";
import { fetchMasjidal } from "./masjidal";
import { fetchMawaqit, mawaqitDays } from "./mawaqit";
import { detectSource, TIMETABLE_DAYS, type SourceRef, type Timetable, type TimetableProvider } from "./timetable";

/** A linked Mawaqit page must be this close to the place, so a wrong link can't put another mosque's times here. */
export const MAX_SOURCE_DISTANCE_KM = 3;
/** Refresh a linked timetable this often; the stored window is two weeks, so a few missed nights are harmless. */
export const REFRESH_AFTER_MS = 3 * 24 * 60 * 60 * 1000;
/** Failed sources are retried weekly, not nightly. */
const RETRY_FAILED_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

type PlaceForSync = { id: string; lat: number; lng: number; timezone: string };

/** Today's date (YYYY-MM-DD) where the place is. */
export function localDate(now: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  } catch {
    return new Date(now).toISOString().slice(0, 10);
  }
}

/** Fetches a source's next two weeks for a place. Throws a user-facing sentence when it can't. */
export async function loadTimetable(place: PlaceForSync, ref: SourceRef, fetcher: typeof fetch, now: number): Promise<Timetable> {
  const start = localDate(now, place.timezone);
  if (ref.provider === "mawaqit") {
    const conf = await fetchMawaqit(ref.externalId, fetcher);
    if (typeof conf.latitude === "number" && typeof conf.longitude === "number") {
      const away = haversineKm(place.lat, place.lng, conf.latitude, conf.longitude);
      if (away > MAX_SOURCE_DISTANCE_KM) throw new Error(`That Mawaqit page is for a mosque ${Math.round(away)} km away, not this one.`);
    }
    const days = mawaqitDays(conf, start, TIMETABLE_DAYS);
    if (Object.keys(days).length === 0) throw new Error("That Mawaqit page has no times for the coming days.");
    return { p: "mawaqit", url: ref.url, at: now, days };
  }
  const days = await fetchMasjidal(ref.externalId, start, TIMETABLE_DAYS, fetcher);
  return { p: "masjidal", url: ref.url, at: now, days };
}

/** Links a source to a place (or re-links it) and fetches it straight away. */
export async function linkSource(
  db: D1Database,
  place: PlaceForSync,
  ref: SourceRef,
  options: { userId: string | null; fetcher?: typeof fetch; now?: number },
): Promise<{ ok: true; timetable: Timetable } | { ok: false; error: string }> {
  const now = options.now ?? Date.now();
  await db
    .prepare(
      `INSERT INTO place_source (place_id, provider, external_id, url, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
       ON CONFLICT (place_id, provider) DO UPDATE SET external_id = excluded.external_id, url = excluded.url,
         status = 'pending', error = NULL, created_by = excluded.created_by, updated_at = excluded.updated_at`,
    )
    .bind(place.id, ref.provider, ref.externalId, ref.url, options.userId, now, now)
    .run();
  return syncSource(db, place, ref, options.fetcher ?? fetch, now);
}

/** Fetches one linked source and stores its window on the place; a failure leaves the last good window in place. */
export async function syncSource(
  db: D1Database,
  place: PlaceForSync,
  ref: SourceRef,
  fetcher: typeof fetch,
  now: number,
): Promise<{ ok: true; timetable: Timetable } | { ok: false; error: string }> {
  try {
    const timetable = await loadTimetable(place, ref, fetcher, now);
    await db.batch([
      db.prepare(`UPDATE place_source SET status = 'ok', error = NULL, fetched_at = ?, updated_at = ? WHERE place_id = ? AND provider = ?`).bind(now, now, place.id, ref.provider),
      db.prepare(`UPDATE place SET timetable_json = ?, updated_at = ? WHERE id = ?`).bind(JSON.stringify(timetable), now, place.id),
    ]);
    return { ok: true, timetable };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : "The timetable couldn't be loaded.";
    await db
      .prepare(`UPDATE place_source SET status = 'failed', error = ?, fetched_at = ?, updated_at = ? WHERE place_id = ? AND provider = ?`)
      .bind(message, now, now, place.id, ref.provider)
      .run();
    return { ok: false, error: message };
  }
}

/**
 * Places whose OpenStreetMap website already points at Mawaqit or Masjidal get that timetable linked.
 * Bounded per run; returns how many were linked.
 */
export async function linkFromWebsites(db: D1Database, now: number, limit = 50): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT id, website FROM place
       WHERE status = 'active' AND website IS NOT NULL
         AND (website LIKE '%mawaqit.net%' OR website LIKE '%masjidal.com%')
         AND NOT EXISTS (SELECT 1 FROM place_source WHERE place_source.place_id = place.id)
       LIMIT ?`,
    )
    .bind(limit)
    .all<{ id: string; website: string }>();
  let linked = 0;
  for (const row of rows.results ?? []) {
    const ref = detectSource(row.website);
    if (!ref) {
      // A website that mentions a provider but isn't a mosque's timetable (its home page, say): note it once, so
      // it doesn't come back every night and crowd out real links. external_id '' is never fetched.
      await db
        .prepare(
          `INSERT OR IGNORE INTO place_source (place_id, provider, external_id, url, status, error, created_by, created_at, updated_at)
           VALUES (?, ?, '', ?, 'failed', 'Not a mosque timetable link.', NULL, ?, ?)`,
        )
        .bind(row.id, row.website.includes("masjidal") ? "masjidal" : "mawaqit", row.website.slice(0, 500), now, now)
        .run();
      continue;
    }
    await db
      .prepare(
        `INSERT OR IGNORE INTO place_source (place_id, provider, external_id, url, status, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'pending', NULL, ?, ?)`,
      )
      .bind(row.id, ref.provider, ref.externalId, ref.url, now, now)
      .run();
    linked += 1;
  }
  return linked;
}

/**
 * New links first, then the stalest timetables, bounded so a cron or a request stays well inside its
 * budget. Nightly for everything; right after an area fill for just that area (`bbox`), so mosques whose
 * OpenStreetMap entry links Mawaqit show their own times on first view.
 */
export async function refreshDueSources(
  db: D1Database,
  fetcher: typeof fetch,
  now: number,
  limit = 40,
  bbox?: { west: number; south: number; east: number; north: number },
): Promise<{ ok: number; failed: number }> {
  await linkFromWebsites(db, now);
  const area = bbox ? `AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?` : "";
  const rows = await db
    .prepare(
      `SELECT s.place_id, s.provider, s.external_id, s.url, p.lat, p.lng, p.timezone
       FROM place_source s JOIN place p ON p.id = s.place_id
       WHERE p.status IN ('active', 'pending') AND s.external_id != '' ${area}
         AND (s.status = 'pending'
           OR (s.status = 'ok' AND (s.fetched_at IS NULL OR s.fetched_at < ?))
           OR (s.status = 'failed' AND (s.fetched_at IS NULL OR s.fetched_at < ?)))
       ORDER BY s.status = 'pending' DESC, s.fetched_at ASC
       LIMIT ?`,
    )
    .bind(...(bbox ? [bbox.south, bbox.north, bbox.west, bbox.east] : []), now - REFRESH_AFTER_MS, now - RETRY_FAILED_AFTER_MS, limit)
    .all<{ place_id: string; provider: TimetableProvider; external_id: string; url: string; lat: number; lng: number; timezone: string }>();
  // A few at a time: polite to the providers, and quick enough for the request path.
  const results: boolean[] = [];
  const queue = [...(rows.results ?? [])];
  while (queue.length > 0) {
    const slice = queue.splice(0, 4);
    const settled = await Promise.all(
      slice.map((row) =>
        syncSource(db, { id: row.place_id, lat: row.lat, lng: row.lng, timezone: row.timezone }, { provider: row.provider, externalId: row.external_id, url: row.url }, fetcher, now),
      ),
    );
    results.push(...settled.map((result) => result.ok));
  }
  return { ok: results.filter(Boolean).length, failed: results.filter((ok) => !ok).length };
}

/** Links one person may add per day; each is checked against the mosque's location, so a wrong one can't land. */
export const DAILY_LINKS = 10;

export async function linksLeftToday(db: D1Database, userId: string, now: number): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM place_source WHERE created_by = ? AND created_at > ?`)
    .bind(userId, now - 24 * 60 * 60 * 1000)
    .first<{ n: number }>();
  return Math.max(0, DAILY_LINKS - (row?.n ?? 0));
}
