import { factsDueForRecompute, nightlyTrustStatement, recomputeFact, releaseDueHolds } from "@/lib/trust/store";

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

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/**
 * Nightly trust maintenance (spec 5.4): trust levels in one UPDATE, due holds released, and facts
 * whose state drifts with time (decay, 60-day staleness) queued for recompute in small chunks.
 */
export async function nightly(env: { DB: D1Database; Q_RECOMPUTE?: Queue }, now = Date.now()) {
  await nightlyTrustStatement(env.DB, now).run();
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
