import { publicHandle } from "@/lib/people";
import { displayedOn, type CandidateStatus, type FactState } from "./engine";

/** Read models for the mosque page, update dialog and history page. */

export type FactValueView = {
  candidateId: string;
  value: unknown;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: CandidateStatus;
  score: number;
  backers: number;
  disputes: number;
  lastConfirmedAt: number | null;
  createdAt: number;
  author: string;
};

export type FactView = {
  factId: string;
  key: string;
  qualifier: string;
  state: FactState;
  current: FactValueView | null;
  /** Value that applies on the requested date (may differ from `current` for dated changes). */
  shown: FactValueView | null;
  challenger: FactValueView | null;
};

type Row = {
  fact_id: string;
  key: string;
  qualifier: string;
  state: FactState;
  candidate_id: string;
  value_json: string;
  effective_from: string;
  effective_to: string | null;
  status: CandidateStatus;
  score: number;
  created_at: number;
  backers: number;
  disputes: number;
  last_confirmed_at: number | null;
  username: string | null;
  deleted_at: number | null;
};

function toValue(row: Row): FactValueView {
  return {
    candidateId: row.candidate_id,
    value: JSON.parse(row.value_json),
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    status: row.status,
    score: row.score,
    backers: row.backers,
    disputes: row.disputes,
    lastConfirmedAt: row.last_confirmed_at,
    createdAt: row.created_at,
    author: publicHandle({ username: row.username, deletedAt: row.deleted_at }),
  };
}

const FACT_ROWS = `SELECT fact.id AS fact_id, fact.key, fact.qualifier, fact.state,
    fact_candidate.id AS candidate_id, fact_candidate.value_json, fact_candidate.effective_from, fact_candidate.effective_to,
    fact_candidate.status, fact_candidate.score, fact_candidate.created_at,
    (SELECT COUNT(DISTINCT vote.user_id) FROM vote WHERE vote.candidate_id = fact_candidate.id AND vote.polarity > 0) AS backers,
    (SELECT COUNT(*) FROM vote WHERE vote.candidate_id = fact_candidate.id AND vote.polarity < 0) AS disputes,
    (SELECT MAX(vote.created_at) FROM vote WHERE vote.candidate_id = fact_candidate.id AND vote.polarity > 0) AS last_confirmed_at,
    user.username, user.deleted_at
  FROM fact
  JOIN fact_candidate ON fact_candidate.fact_id = fact.id
  LEFT JOIN user ON user.id = fact_candidate.created_by
  WHERE fact.place_id = ?`;

/** Current, displayed and challenging values for every fact of a place. */
export async function placeFacts(db: D1Database, placeId: string, date: string): Promise<FactView[]> {
  const result = await db
    .prepare(
      `${FACT_ROWS} AND (fact_candidate.status IN ('current', 'candidate')
         OR (fact_candidate.status = 'superseded' AND (fact_candidate.effective_to IS NULL OR fact_candidate.effective_to >= ?)))`,
    )
    .bind(placeId, date)
    .all<Row>();
  const groups = new Map<string, Row[]>();
  for (const row of result.results ?? []) groups.set(row.fact_id, [...(groups.get(row.fact_id) ?? []), row]);
  const views: FactView[] = [];
  for (const rows of groups.values()) {
    const first = rows[0];
    if (!first) continue;
    const values = rows.map(toValue);
    const current = values.find((value) => value.status === "current") ?? null;
    const shown = displayedOn(
      values.map((value) => ({ ...value, id: value.candidateId })),
      date,
    );
    const challenger =
      values
        .filter((value) => value.status === "candidate" && value.score > 0)
        .sort((a, b) => b.score - a.score || a.createdAt - b.createdAt)[0] ?? null;
    views.push({ factId: first.fact_id, key: first.key, qualifier: first.qualifier, state: first.state, current, shown, challenger });
  }
  return views.sort((a, b) => (a.key === b.key ? Number(a.qualifier) - Number(b.qualifier) : a.key < b.key ? -1 : 1));
}

export type HistoryEntry = FactValueView & { key: string; qualifier: string; factId: string };

/** Every value ever proposed for a place, newest first (the transparency page). */
export async function placeHistory(db: D1Database, placeId: string, limit = 300): Promise<HistoryEntry[]> {
  const result = await db
    .prepare(`${FACT_ROWS} ORDER BY fact_candidate.created_at DESC LIMIT ?`)
    .bind(placeId, limit)
    .all<Row>();
  return (result.results ?? []).map((row) => ({ ...toValue(row), key: row.key, qualifier: row.qualifier, factId: row.fact_id }));
}

export type ActivityView = {
  id: string;
  type: string;
  handle: string;
  actorId: string | null;
  payload: { key?: string; qualifier?: string; value?: unknown; replaced?: boolean; held?: boolean; prayer?: string };
  createdAt: number;
};

export async function placeActivity(db: D1Database, placeId: string, limit = 8): Promise<ActivityView[]> {
  const result = await db
    .prepare(
      `SELECT activity.id, activity.type, activity.actor_id, activity.payload_json, activity.created_at, user.username, user.deleted_at
       FROM activity LEFT JOIN user ON user.id = activity.actor_id
       WHERE activity.place_id = ? AND activity.visibility = 'public'
         AND NOT (activity.type = 'promoted' AND json_extract(activity.payload_json, '$.replaced') = 0)
       ORDER BY activity.created_at DESC LIMIT ?`,
    )
    .bind(placeId, limit)
    .all<{ id: string; type: string; actor_id: string | null; payload_json: string; created_at: number; username: string | null; deleted_at: number | null }>();
  return (result.results ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    actorId: row.actor_id,
    handle: row.actor_id ? publicHandle({ username: row.username, deletedAt: row.deleted_at }) : "mosques.world",
    payload: JSON.parse(row.payload_json) as ActivityView["payload"],
    createdAt: row.created_at,
  }));
}

export type TrustStats = { contributors: number; recentConfirmers: number; agreement: number | null };

/** Numbers for the TrustSummary box: people this month and weighted agreement over 90 days. */
export async function placeTrustStats(db: D1Database, placeId: string, now: number): Promise<TrustStats> {
  const day = 24 * 60 * 60 * 1000;
  const [contributors, recent, agreement] = await db.batch([
    db.prepare(`SELECT COUNT(DISTINCT actor_id) AS n FROM activity WHERE place_id = ? AND actor_id IS NOT NULL`).bind(placeId),
    db
      .prepare(
        `SELECT COUNT(DISTINCT vote.user_id) AS n FROM vote
         JOIN fact_candidate ON fact_candidate.id = vote.candidate_id JOIN fact ON fact.id = fact_candidate.fact_id
         WHERE fact.place_id = ? AND fact_candidate.status = 'current' AND vote.polarity > 0 AND vote.created_at > ?`,
      )
      .bind(placeId, now - 30 * day),
    db
      .prepare(
        `SELECT SUM(CASE WHEN vote.polarity > 0 THEN vote.weight ELSE 0 END) AS positive, SUM(vote.weight) AS total FROM vote
         JOIN fact_candidate ON fact_candidate.id = vote.candidate_id JOIN fact ON fact.id = fact_candidate.fact_id
         WHERE fact.place_id = ? AND fact_candidate.status = 'current' AND vote.created_at > ?`,
      )
      .bind(placeId, now - 90 * day),
  ]);
  const totals = agreement?.results?.[0] as { positive: number | null; total: number | null } | undefined;
  return {
    contributors: (contributors?.results?.[0] as { n: number } | undefined)?.n ?? 0,
    recentConfirmers: (recent?.results?.[0] as { n: number } | undefined)?.n ?? 0,
    agreement: totals?.total ? Math.round(((totals.positive ?? 0) / totals.total) * 100) : null,
  };
}

/** The signed-in person's votes on a place, keyed by candidate. */
export async function myVotes(db: D1Database, placeId: string, userId: string): Promise<Record<string, 1 | -1>> {
  const result = await db
    .prepare(
      `SELECT vote.candidate_id, vote.polarity FROM vote
       JOIN fact_candidate ON fact_candidate.id = vote.candidate_id JOIN fact ON fact.id = fact_candidate.fact_id
       WHERE fact.place_id = ? AND vote.user_id = ?`,
    )
    .bind(placeId, userId)
    .all<{ candidate_id: string; polarity: number }>();
  return Object.fromEntries((result.results ?? []).map((row) => [row.candidate_id, row.polarity > 0 ? 1 : -1]));
}
