import { ulid } from "@/lib/id";
import { recomputeFact, refreshPlaceSummary } from "@/lib/trust/store";

export class MergeError extends Error {}

type FactRow = { id: string; key: string; qualifier: string };
type CandidateRow = { id: string; value_hash: string; effective_from: string; status: string };

/**
 * Merges a duplicate into the place that stays (spec P3 place quality): facts, candidates, votes,
 * photos, activity and reports move over; the duplicate becomes `merged` and its slug 308-redirects.
 * Identical values are combined so their votes add up; each fact is then recomputed.
 */
export async function mergePlaces(db: D1Database, input: { sourceId: string; targetId: string; moderatorId: string; now: number }) {
  const { sourceId, targetId, now } = input;
  if (sourceId === targetId) throw new MergeError("Pick two different places.");
  const [source, target] = await Promise.all([
    db.prepare(`SELECT id, slug, name, status FROM place WHERE id = ?`).bind(sourceId).first<{ id: string; slug: string; name: string; status: string }>(),
    db.prepare(`SELECT id, slug, name, status FROM place WHERE id = ?`).bind(targetId).first<{ id: string; slug: string; name: string; status: string }>(),
  ]);
  if (!source || !target) throw new MergeError("One of those places was not found.");
  if (source.status === "merged") throw new MergeError(`${source.name} was already merged.`);
  if (target.status === "merged") throw new MergeError(`${target.name} was merged into another place; merge into that one instead.`);

  const facts = await db.prepare(`SELECT id, key, qualifier FROM fact WHERE place_id = ?`).bind(sourceId).all<FactRow>();
  for (const fact of facts.results ?? []) {
    const existing = await db
      .prepare(`SELECT id, key, qualifier FROM fact WHERE place_id = ? AND key = ? AND qualifier = ?`)
      .bind(targetId, fact.key, fact.qualifier)
      .first<FactRow>();
    if (!existing) {
      await db.prepare(`UPDATE fact SET place_id = ?, updated_at = ? WHERE id = ?`).bind(targetId, now, fact.id).run();
      continue;
    }
    const candidates = await db.prepare(`SELECT id, value_hash, effective_from, status FROM fact_candidate WHERE fact_id = ?`).bind(fact.id).all<CandidateRow>();
    for (const candidate of candidates.results ?? []) {
      const twin = await db
        .prepare(`SELECT id FROM fact_candidate WHERE fact_id = ? AND value_hash = ? AND effective_from = ?`)
        .bind(existing.id, candidate.value_hash, candidate.effective_from)
        .first<{ id: string }>();
      if (twin) {
        await db.batch([
          db
            .prepare(
              `UPDATE vote SET candidate_id = ? WHERE candidate_id = ? AND user_id NOT IN (SELECT user_id FROM vote WHERE candidate_id = ?)`,
            )
            .bind(twin.id, candidate.id, twin.id),
          db.prepare(`DELETE FROM vote WHERE candidate_id = ?`).bind(candidate.id),
          db.prepare(`DELETE FROM fact_candidate WHERE id = ?`).bind(candidate.id),
        ]);
      } else {
        // Only one value per fact may stay current; the engine re-decides after the merge.
        const status = candidate.status === "current" ? "candidate" : candidate.status;
        await db.prepare(`UPDATE fact_candidate SET fact_id = ?, status = ? WHERE id = ?`).bind(existing.id, status, candidate.id).run();
      }
    }
    await db.batch([
      // A person keeps one confirmation per fact: their latest.
      db
        .prepare(
          `DELETE FROM vote WHERE polarity > 0 AND id IN (
             SELECT older.id FROM vote AS older JOIN fact_candidate AS a ON a.id = older.candidate_id
             WHERE a.fact_id = ? AND older.polarity > 0 AND EXISTS (
               SELECT 1 FROM vote AS newer JOIN fact_candidate AS b ON b.id = newer.candidate_id
               WHERE b.fact_id = a.fact_id AND newer.user_id = older.user_id AND newer.polarity > 0 AND newer.id != older.id
                 AND (newer.created_at > older.created_at OR (newer.created_at = older.created_at AND newer.id > older.id))))`,
        )
        .bind(existing.id),
      db.prepare(`DELETE FROM fact WHERE id = ?`).bind(fact.id),
    ]);
  }

  await db.batch([
    db.prepare(`UPDATE photo SET place_id = ? WHERE place_id = ?`).bind(targetId, sourceId),
    db.prepare(`UPDATE activity SET place_id = ? WHERE place_id = ?`).bind(targetId, sourceId),
    db.prepare(`UPDATE report SET place_id = ?, target_id = CASE WHEN target_type = 'place' THEN ? ELSE target_id END WHERE place_id = ?`).bind(targetId, targetId, sourceId),
    db.prepare(`UPDATE waitlist SET place_id = ? WHERE place_id = ?`).bind(targetId, sourceId),
    db.prepare(`UPDATE place_duplicate_candidate SET status = 'merged' WHERE (a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?)`).bind(sourceId, targetId, targetId, sourceId),
    db.prepare(`UPDATE place_slug_history SET place_id = ? WHERE place_id = ?`).bind(targetId, sourceId),
    db.prepare(`INSERT INTO place_slug_history (old_slug, place_id, created_at) VALUES (?, ?, ?) ON CONFLICT (old_slug) DO UPDATE SET place_id = excluded.place_id`).bind(source.slug, targetId, now),
    db.prepare(`UPDATE place SET status = 'merged', merged_into_id = ?, updated_at = ? WHERE id = ?`).bind(targetId, now, sourceId),
    db
      .prepare(`INSERT INTO audit_log (id, actor_id, action, target_type, target_id, before_json, after_json, created_at) VALUES (?, ?, 'merge_place', 'place', ?, ?, ?, ?)`)
      .bind(ulid(now), input.moderatorId, sourceId, JSON.stringify({ status: source.status, slug: source.slug }), JSON.stringify({ mergedInto: targetId, slug: target.slug }), now),
  ]);

  const merged = await db.prepare(`SELECT id FROM fact WHERE place_id = ?`).bind(targetId).all<{ id: string }>();
  for (const fact of merged.results ?? []) await recomputeFact(db, fact.id, now, input.moderatorId);
  await refreshPlaceSummary(db, targetId, now);
  return { targetSlug: target.slug, sourceSlug: source.slug };
}
