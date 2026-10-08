import { GOOGLE_PLACES_IN_USE, refreshGoogleLocations } from "@/lib/places/google";
import { factsDueForRecompute, nightlyTrustStatement, recomputeFact, refreshPlaceSummary, releaseDueHolds } from "@/lib/trust/store";

/** Facts per queue message; a consumer batch (≤ 10 messages) then touches at most 250 facts. */
export const RECOMPUTE_CHUNK = 25;
/** Upper bound of facts recomputed per night; the oldest-updated go first, the rest roll over. */
export const NIGHTLY_FACT_LIMIT = 1000;

export type RecomputeMessage = { kind: "facts"; ids: string[] };

export function isRecomputeMessage(body: unknown): body is RecomputeMessage {
  if (!body || typeof body !== "object") return false;
  const message = body as Partial<RecomputeMessage>;
  return message.kind === "facts" && Array.isArray(message.ids) && message.ids.every((id) => typeof id === "string");
}

export type PhotoMessage = { kind: "photo"; id: string };

export function isPhotoMessage(body: unknown): body is PhotoMessage {
  return Boolean(body && typeof body === "object" && (body as PhotoMessage).kind === "photo" && typeof (body as PhotoMessage).id === "string");
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/**
 * Nightly trust maintenance (spec 5.4): trust levels in one UPDATE, due holds released, and facts
 * whose state drifts with time (decay, 60-day staleness) queued for recompute in small chunks.
 */
/** New accounts' places go public after 24 hours unless someone reported them (spec P3). */
export function activatePendingStatement(db: D1Database, now: number) {
  return db
    .prepare(
      `UPDATE place SET status = 'active', updated_at = ? WHERE status = 'pending' AND created_at <= ?
       AND NOT EXISTS (SELECT 1 FROM report WHERE report.place_id = place.id AND report.status = 'open')`,
    )
    .bind(now, now - 24 * 60 * 60 * 1000);
}

export async function nightly(
  env: { DB: D1Database; Q_RECOMPUTE?: Queue; CACHE?: KVNamespace; GOOGLE_MAPS_API_KEY?: string },
  now = Date.now(),
) {
  await nightlyTrustStatement(env.DB, now).run();
  await activatePendingStatement(env.DB, now).run();
  if (GOOGLE_PLACES_IN_USE && env.CACHE && env.GOOGLE_MAPS_API_KEY) {
    await refreshGoogleLocations(env.DB, { apiKey: env.GOOGLE_MAPS_API_KEY, cache: env.CACHE, mocks: false }, now);
  }
  // Places with monthly timetables: slide their two-week window in the summary forward (spec P7).
  const today = new Date(now).toISOString().slice(0, 10);
  const soon = new Date(now + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const timetabled = await env.DB.prepare(
    `SELECT DISTINCT place_id FROM fact WHERE key LIKE 'timetable.%' AND qualifier BETWEEN ? AND ? LIMIT 200`,
  )
    .bind(today, soon)
    .all<{ place_id: string }>();
  for (const row of timetabled.results ?? []) await refreshPlaceSummary(env.DB, row.place_id, now);
  const released = await releaseDueHolds(env.DB, now, 100);
  const ids = await factsDueForRecompute(env.DB, now, NIGHTLY_FACT_LIMIT);
  const messages = chunk(ids, RECOMPUTE_CHUNK).map((part) => ({ body: { kind: "facts", ids: part } satisfies RecomputeMessage }));
  if (env.Q_RECOMPUTE) {
    for (const batch of chunk(messages, 100)) await env.Q_RECOMPUTE.sendBatch(batch);
  } else {
    // No queue bound (local tooling): do a small slice inline rather than the whole list.
    for (const id of ids.slice(0, RECOMPUTE_CHUNK)) await recomputeFact(env.DB, id, now);
  }
  return { released, queued: ids.length };
}

export async function recomputeFacts(db: D1Database, ids: string[], now = Date.now()) {
  for (const id of ids) {
    try {
      await recomputeFact(db, id, now);
    } catch (error) {
      if (!(error instanceof Error && error.message.includes("not found"))) throw error;
    }
  }
}
