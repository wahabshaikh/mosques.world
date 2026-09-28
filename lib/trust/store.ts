import { ulid } from "@/lib/id";
import { changeText, disputeText, isTimeKey, savedChangeStatement, stewardAlertStatement } from "@/lib/notifications";
import {
  asTrustLevel,
  confirmationsNeeded,
  displayedOn,
  evaluateFact,
  holdRelease,
  HOLD_RELEASE_MS,
  NEW_ACCOUNT_MS,
  placeVerification,
  previousDay,
  shouldHold,
  supporters,
  trustLevelFor,
  voteWeight,
  type CandidateStatus,
  type EngineCandidate,
  type FactOutcome,
  type FactState,
  type TrustLevel,
} from "./engine";
import { amenityBit, IQAMAH_KEYS, isAmenityKey, JUMUAH_KEY, valueHash, type VoteSource } from "./facts";
import type { PlaceSummary, SummaryEntry } from "./summary";

/**
 * D1 side of the trust engine. Every mutation reads the affected fact, runs the pure engine
 * and writes the result in one `batch()` (a single transaction in D1).
 */

export type Actor = {
  id: string;
  trustLevel: TrustLevel;
  createdAt: number;
  role: string;
};

export type FactRow = {
  id: string;
  place_id: string;
  key: string;
  qualifier: string;
  current_candidate_id: string | null;
  state: FactState;
  confidence: number;
  last_confirmed_at: number | null;
  updated_at: number;
};

export type CandidateRow = {
  id: string;
  fact_id: string;
  value_json: string;
  value_hash: string;
  effective_from: string;
  effective_to: string | null;
  status: CandidateStatus;
  score: number;
  created_by: string;
  created_at: number;
};

type VoteRow = {
  id: string;
  candidate_id: string;
  user_id: string;
  polarity: number;
  source: string;
  weight: number;
  created_at: number;
  user_created_at: number;
};

export class TrustError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Burst rule: more than this many votes on one place from new accounts within an hour. */
export const BURST_LIMIT = 10;

async function loadFact(db: D1Database, factId: string) {
  const [factResult, candidateResult, voteResult] = await db.batch([
    db.prepare(`SELECT * FROM fact WHERE id = ?`).bind(factId),
    db.prepare(`SELECT * FROM fact_candidate WHERE fact_id = ? AND status != 'rejected'`).bind(factId),
    db
      .prepare(
        `SELECT vote.*, user.created_at AS user_created_at
         FROM vote
         JOIN fact_candidate ON fact_candidate.id = vote.candidate_id
         JOIN user ON user.id = vote.user_id
         WHERE fact_candidate.fact_id = ? AND fact_candidate.status != 'rejected'`,
      )
      .bind(factId),
  ]);
  const fact = (factResult?.results?.[0] as FactRow | undefined) ?? null;
  if (!fact) throw new TrustError("That fact was not found.", 404);
  const rows = (candidateResult?.results ?? []) as CandidateRow[];
  const votes = (voteResult?.results ?? []) as VoteRow[];
  return { fact, rows, votes };
}

function toEngine(rows: CandidateRow[], votes: VoteRow[]): EngineCandidate[] {
  return rows.map((row) => ({
    id: row.id,
    createdBy: row.created_by,
    status: row.status,
    effectiveFrom: row.effective_from,
    createdAt: row.created_at,
    votes: votes
      .filter((vote) => vote.candidate_id === row.id)
      .map((vote) => ({
        userId: vote.user_id,
        polarity: vote.polarity > 0 ? (1 as const) : (-1 as const),
        weight: vote.weight,
        createdAt: vote.created_at,
        userCreatedAt: vote.user_created_at,
      })),
  }));
}

export type RecomputeResult = FactOutcome & { factId: string; placeId: string; key: string };

/** Re-evaluates one fact, applies promotions, and refreshes the place's denormalised summary. */
export async function recomputeFact(
  db: D1Database,
  factId: string,
  now: number,
  actorId: string | null = null,
  /** Whoever caused this recompute; they are not notified about their own change. */
  triggeredBy: string | null = actorId,
): Promise<RecomputeResult> {
  const { fact, rows, votes } = await loadFact(db, factId);
  const candidates = toEngine(rows, votes);
  const outcome = evaluateFact(candidates, now);
  const statements: D1PreparedStatement[] = [];

  for (const row of rows) {
    const score = outcome.scores[row.id] ?? 0;
    if (Math.abs(score - row.score) > 1e-9) {
      statements.push(db.prepare(`UPDATE fact_candidate SET score = ? WHERE id = ?`).bind(score, row.id));
    }
  }

  if (outcome.promotedId) {
    const promoted = rows.find((row) => row.id === outcome.promotedId);
    statements.push(
      db.prepare(`UPDATE fact_candidate SET status = 'current', effective_to = NULL WHERE id = ?`).bind(outcome.promotedId),
    );
    if (outcome.supersededId) {
      statements.push(
        db
          .prepare(`UPDATE fact_candidate SET status = 'superseded', effective_to = ? WHERE id = ?`)
          .bind(outcome.supersededTo, outcome.supersededId),
      );
    }
    const promotedCandidate = candidates.find((candidate) => candidate.id === outcome.promotedId);
    const backers = new Set(promotedCandidate?.votes.filter((vote) => vote.polarity > 0).map((vote) => vote.userId) ?? []);
    for (const userId of backers) {
      statements.push(
        db.prepare(`UPDATE user SET accepted_count = accepted_count + 1, reputation = reputation + 1 WHERE id = ?`).bind(userId),
      );
    }
    statements.push(
      db
        .prepare(
          `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, before_json, after_json, created_at)
           VALUES (?, ?, 'promote', 'fact', ?, ?, ?, ?)`,
        )
        .bind(
          ulid(now),
          actorId,
          fact.id,
          JSON.stringify({ candidateId: outcome.supersededId }),
          JSON.stringify({ candidateId: outcome.promotedId }),
          now,
        ),
      activityStatement(db, now, null, fact.place_id, "promoted", {
        key: fact.key,
        qualifier: fact.qualifier,
        value: promoted ? JSON.parse(promoted.value_json) : null,
        replaced: outcome.supersededId !== null,
      }),
    );
  }

  const changed = Boolean(outcome.promotedId && outcome.supersededId && isTimeKey(fact.key));
  const newDispute = outcome.state === "disputed" && fact.state !== "disputed" && isTimeKey(fact.key);
  if (changed || newDispute) {
    const place = await db.prepare(`SELECT name, slug FROM place WHERE id = ?`).bind(fact.place_id).first<{ name: string; slug: string }>();
    if (place && changed) {
      const before = rows.find((row) => row.id === outcome.supersededId);
      const after = rows.find((row) => row.id === outcome.promotedId);
      const text = changeText({
        key: fact.key,
        qualifier: fact.qualifier,
        placeName: place.name,
        before: before ? JSON.parse(before.value_json) : null,
        after: after ? JSON.parse(after.value_json) : null,
      });
      statements.push(savedChangeStatement(db, { placeId: fact.place_id, slug: place.slug, ...text, exclude: triggeredBy, now }));
    }
    if (place && newDispute) {
      const challenger = rows.find((row) => row.id !== outcome.currentId && row.status === "candidate" && (outcome.scores[row.id] ?? 0) > 0);
      if (challenger) {
        const text = disputeText({ key: fact.key, qualifier: fact.qualifier, placeName: place.name, challenger: JSON.parse(challenger.value_json) });
        statements.push(stewardAlertStatement(db, { placeId: fact.place_id, ...text, exclude: triggeredBy, now }));
      }
    }
  }

  statements.push(
    db
      .prepare(
        `UPDATE fact SET current_candidate_id = ?, state = ?, confidence = ?, last_confirmed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(outcome.currentId, outcome.state, outcome.confidence, outcome.lastConfirmedAt, now, fact.id),
  );
  await db.batch(statements);
  await refreshPlaceSummary(db, fact.place_id, now);
  return { ...outcome, factId: fact.id, placeId: fact.place_id, key: fact.key };
}

function activityStatement(
  db: D1Database,
  now: number,
  actorId: string | null,
  placeId: string,
  type: string,
  payload: Record<string, unknown>,
) {
  return db
    .prepare(`INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(ulid(now), actorId, placeId, type, JSON.stringify(payload), now);
}

type SummaryRow = CandidateRow & { key: string; qualifier: string; state: FactState; last_confirmed_at: number | null; backers: number };

/** Rebuilds `place.iqamah_summary_json`, `verification_state` and `last_verified_at`. */
export async function refreshPlaceSummary(db: D1Database, placeId: string, now: number): Promise<PlaceSummary> {
  const since = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [factResult, candidateResult, timetableResult] = await db.batch([
    db.prepare(`SELECT key, qualifier, state FROM fact WHERE place_id = ? AND key NOT LIKE 'timetable.%'`).bind(placeId),
    db
      .prepare(
        `SELECT fact_candidate.*, fact.key, fact.qualifier, fact.state, fact.last_confirmed_at,
          (SELECT COUNT(DISTINCT vote.user_id) FROM vote WHERE vote.candidate_id = fact_candidate.id AND vote.polarity > 0) AS backers
         FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id
         WHERE fact.place_id = ? AND fact.key NOT LIKE 'timetable.%'
           AND (fact_candidate.status IN ('current', 'candidate')
             OR (fact_candidate.status = 'superseded' AND (fact_candidate.effective_to IS NULL OR fact_candidate.effective_to >= ?)))`,
      )
      .bind(placeId, since),
    // Monthly-timetable values for the next two weeks ride along, so cards and offline times use them (spec P7).
    db
      .prepare(
        `SELECT fact.key, fact.qualifier, fact_candidate.value_json FROM fact JOIN fact_candidate ON fact_candidate.id = fact.current_candidate_id
         WHERE fact.place_id = ? AND fact.key LIKE 'timetable.%' AND fact.qualifier BETWEEN ? AND ?`,
      )
      .bind(placeId, isoDay(now - DAY_MS), isoDay(now + 15 * DAY_MS)),
  ]);
  const facts = (factResult?.results ?? []) as Array<{ key: string; qualifier: string; state: FactState }>;
  const rows = (candidateResult?.results ?? []) as SummaryRow[];
  const summary: PlaceSummary = { iqamah: {}, jumuah: [] };

  const groups = new Map<string, SummaryRow[]>();
  for (const row of rows) {
    const id = `${row.key}|${row.qualifier}`;
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  let amenityBits = 0;
  for (const group of groups.values()) {
    const current = group.find((row) => row.status === "current");
    if (!current) continue;
    if (isAmenityKey(current.key)) {
      if ((JSON.parse(current.value_json) as { v?: unknown }).v === true) amenityBits |= amenityBit(current.key);
      continue;
    }
    const previous = displayedOn(
      group
        .filter((row) => row.status === "superseded")
        .map((row) => ({ ...row, effectiveFrom: row.effective_from, effectiveTo: row.effective_to })),
      previousDay(current.effective_from),
    );
    const challenger = group
      .filter((row) => row.status === "candidate" && row.score > 0)
      .sort((a, b) => b.score - a.score)[0];
    const entry: SummaryEntry = {
      v: JSON.parse(current.value_json),
      from: current.effective_from,
      prev: previous ? JSON.parse(previous.value_json) : null,
      s: current.state,
      n: current.backers,
      at: current.last_confirmed_at,
      c: challenger ? { v: JSON.parse(challenger.value_json), n: challenger.backers } : null,
    };
    if (current.key === JUMUAH_KEY) {
      summary.jumuah.push({ ...entry, q: current.qualifier });
    } else if (current.key.startsWith("iqamah.")) {
      summary.iqamah[current.key.slice("iqamah.".length) as keyof PlaceSummary["iqamah"]] = entry;
    }
  }
  summary.jumuah.sort((a, b) => Number(a.q) - Number(b.q));
  for (const row of (timetableResult?.results ?? []) as Array<{ key: string; qualifier: string; value_json: string }>) {
    const time = (JSON.parse(row.value_json) as { t?: string }).t;
    if (!time) continue;
    summary.tt ??= {};
    (summary.tt[row.qualifier] ??= {})[row.key.slice("timetable.".length) as keyof PlaceSummary["iqamah"]] = time;
  }

  const states = IQAMAH_KEYS.map((key) => facts.find((item) => item.key === key)?.state ?? "unknown");
  const verification = placeVerification(states);
  const lastVerified = Object.values(summary.iqamah).reduce<number | null>(
    (latest, entry) => (entry?.at && (!latest || entry.at > latest) ? entry.at : latest),
    null,
  );
  const hasAny = Object.keys(summary.iqamah).length > 0 || summary.jumuah.length > 0 || Boolean(summary.tt);
  await db
    .prepare(`UPDATE place SET iqamah_summary_json = ?, verification_state = ?, last_verified_at = ?, amenity_bits = ? WHERE id = ?`)
    .bind(hasAny ? JSON.stringify(summary) : null, verification, lastVerified, amenityBits, placeId)
    .run();
  return summary;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

async function getCandidate(db: D1Database, candidateId: string) {
  const row = await db
    .prepare(
      `SELECT fact_candidate.*, fact.place_id, fact.key, fact.qualifier, fact.state AS fact_state
       FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id WHERE fact_candidate.id = ?`,
    )
    .bind(candidateId)
    .first<CandidateRow & { place_id: string; key: string; qualifier: string; fact_state: FactState }>();
  if (!row) throw new TrustError("That value was not found.", 404);
  return row;
}

export type VoteResult = {
  factId: string;
  placeId: string;
  key: string;
  qualifier: string;
  candidateId: string;
  status: "live" | "pending" | "held";
  state: FactState;
  /** Further confirmations until live (pending) or verified (live); 0 when neither applies. */
  needed: number;
  outcome: RecomputeResult | null;
};

export async function castVote(
  db: D1Database,
  input: {
    actor: Actor;
    candidateId: string;
    polarity: 1 | -1;
    source: VoteSource;
    now: number;
    /** A timetable photo backing the vote; it adds ×1.5 once approved (applied on approval). */
    evidence?: { photoId: string; approved: boolean };
    /** The voter was confirmed within 150 m of the place (quick verify, spec P5): weight ×1.5. */
    geoVerified?: boolean;
  },
): Promise<VoteResult> {
  const { actor, now } = input;
  const candidate = await getCandidate(db, input.candidateId);
  if (candidate.status === "rejected" || candidate.status === "superseded") {
    throw new TrustError("That value is no longer open for votes.", 409);
  }
  const [previous, steward] = await Promise.all([
    db.prepare(`SELECT polarity FROM vote WHERE candidate_id = ? AND user_id = ?`).bind(candidate.id, actor.id).first<{ polarity: number }>(),
    // Approved stewards of this place vote with +2 (spec P6).
    db
      .prepare(`SELECT 1 AS found FROM steward WHERE place_id = ? AND user_id = ? AND status = 'approved'`)
      .bind(candidate.place_id, actor.id)
      .first<{ found: number }>(),
  ]);
  const weight = voteWeight({
    steward: Boolean(steward),
    trustLevel: actor.trustLevel,
    source: input.source,
    evidenceApproved: input.evidence?.approved,
    geoVerified: input.geoVerified,
  });
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO vote (id, candidate_id, user_id, polarity, source, weight, geo_verified, evidence_photo_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (candidate_id, user_id) DO UPDATE SET polarity = excluded.polarity, source = excluded.source,
           weight = excluded.weight, geo_verified = excluded.geo_verified, evidence_photo_id = excluded.evidence_photo_id,
           created_at = excluded.created_at`,
      )
      .bind(ulid(now), candidate.id, actor.id, input.polarity, input.source, weight, input.geoVerified ? 1 : 0, input.evidence?.photoId ?? null, now),
  ];
  if (input.polarity > 0) {
    statements.push(
      db
        .prepare(
          `DELETE FROM vote WHERE user_id = ? AND polarity > 0 AND candidate_id IN
             (SELECT id FROM fact_candidate WHERE fact_id = ? AND id != ?)`,
        )
        .bind(actor.id, candidate.fact_id, candidate.id),
    );
    if (candidate.status === "current" && previous?.polarity !== 1) {
      statements.push(
        db.prepare(`UPDATE user SET accepted_count = accepted_count + 1, reputation = reputation + 1 WHERE id = ?`).bind(actor.id),
      );
    }
  }
  let held = candidate.status === "held";
  if (held && input.polarity > 0 && (actor.trustLevel >= 1 || steward) && actor.id !== candidate.created_by) {
    held = false;
    statements.push(
      db.prepare(`UPDATE fact_candidate SET status = 'candidate' WHERE id = ?`).bind(candidate.id),
      auditStatement(db, now, actor.id, "release", "candidate", candidate.id, { status: "held" }, { status: "candidate" }),
    );
  }
  const authorsOwnVote = actor.id === candidate.created_by && !previous;
  if (previous?.polarity !== input.polarity && !authorsOwnVote) {
    statements.push(
      activityStatement(db, now, actor.id, candidate.place_id, input.polarity > 0 ? "confirmed" : "disputed", {
        key: candidate.key,
        qualifier: candidate.qualifier,
        value: JSON.parse(candidate.value_json),
      }),
    );
  }
  await db.batch(statements);
  await refreshActorTrust(db, actor.id, now);
  const base = { factId: candidate.fact_id, placeId: candidate.place_id, key: candidate.key, qualifier: candidate.qualifier, candidateId: candidate.id };
  if (held) return { ...base, status: "held", state: candidate.fact_state, needed: 0, outcome: null };
  const outcome = await recomputeFact(db, candidate.fact_id, now, null, actor.id);
  const live = outcome.currentId === candidate.id;
  const score = outcome.scores[candidate.id] ?? 0;
  const backers = outcome.supporters[candidate.id] ?? 0;
  const needed = live
    ? outcome.state === "verified"
      ? 0
      : confirmationsNeeded({ role: "current", score, supporters: backers })
    : confirmationsNeeded({
        role: outcome.currentId ? "challenger" : "first",
        score,
        supporters: backers,
        currentScore: outcome.currentId ? (outcome.scores[outcome.currentId] ?? 0) : 0,
      });
  return { ...base, status: live ? "live" : "pending", state: outcome.state, needed, outcome };
}

async function ensureFact(db: D1Database, placeId: string, key: string, qualifier: string, now: number): Promise<FactRow> {
  await db
    .prepare(
      `INSERT INTO fact (id, place_id, key, qualifier, state, confidence, updated_at) VALUES (?, ?, ?, ?, 'unknown', 0, ?)
       ON CONFLICT (place_id, key, qualifier) DO NOTHING`,
    )
    .bind(ulid(now), placeId, key, qualifier, now)
    .run();
  const fact = await db
    .prepare(`SELECT * FROM fact WHERE place_id = ? AND key = ? AND qualifier = ?`)
    .bind(placeId, key, qualifier)
    .first<FactRow>();
  if (!fact) throw new TrustError("Could not save that fact.", 500);
  return fact;
}

export async function newAccountBurst(db: D1Database, placeId: string, now: number): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n FROM vote
       JOIN fact_candidate ON fact_candidate.id = vote.candidate_id
       JOIN fact ON fact.id = fact_candidate.fact_id
       JOIN user ON user.id = vote.user_id
       WHERE fact.place_id = ? AND vote.created_at > ? AND vote.created_at - user.created_at < ?`,
    )
    .bind(placeId, now - 60 * 60 * 1000, NEW_ACCOUNT_MS)
    .first<{ n: number }>();
  return (row?.n ?? 0) > BURST_LIMIT;
}

/** Proposes a value (or confirms an identical one). Returns how the value now stands. */
export async function submitValue(
  db: D1Database,
  input: {
    actor: Actor;
    placeId: string;
    key: string;
    qualifier: string;
    value: unknown;
    effectiveFrom: string;
    source: VoteSource;
    now: number;
    evidence?: { photoId: string; approved: boolean };
    geoVerified?: boolean;
  },
): Promise<VoteResult> {
  const { actor, now } = input;
  const fact = await ensureFact(db, input.placeId, input.key, input.qualifier, now);
  const hash = await valueHash(input.value);
  const [sameResult, currentResult] = await db.batch([
    db
      .prepare(`SELECT * FROM fact_candidate WHERE fact_id = ? AND value_hash = ? AND status IN ('candidate', 'current', 'held') ORDER BY created_at DESC LIMIT 1`)
      .bind(fact.id, hash),
    db.prepare(`SELECT * FROM fact_candidate WHERE fact_id = ? AND status = 'current'`).bind(fact.id),
  ]);
  const same = sameResult?.results?.[0] as CandidateRow | undefined;
  if (same) {
    return castVote(db, { actor, candidateId: same.id, polarity: 1, source: input.source, now, evidence: input.evidence, geoVerified: input.geoVerified });
  }

  const exact = await db
    .prepare(`SELECT * FROM fact_candidate WHERE fact_id = ? AND value_hash = ? AND effective_from = ?`)
    .bind(fact.id, hash, input.effectiveFrom)
    .first<CandidateRow>();
  if (exact?.status === "rejected") throw new TrustError("A moderator already rejected that value.", 409);

  const current = currentResult?.results?.[0] as CandidateRow | undefined;
  let status: "candidate" | "held" = "candidate";
  if (current) {
    const { rows, votes } = await loadFact(db, fact.id);
    const engineCurrent = toEngine(rows, votes).find((candidate) => candidate.id === current.id);
    const confirmations = engineCurrent ? supporters(engineCurrent, now) : 0;
    if (shouldHold({ trustLevel: actor.trustLevel, currentState: fact.state, currentConfirmations: confirmations })) {
      status = "held";
    }
  }
  if (actor.trustLevel === 0 && now - actor.createdAt < NEW_ACCOUNT_MS && (await newAccountBurst(db, input.placeId, now))) {
    status = "held";
    await db
      .prepare(
        `INSERT INTO report (id, target_type, target_id, place_id, reason, note, status, created_at)
         SELECT ?, 'place', ?, ?, 'burst', 'Many votes from new accounts within an hour', 'open', ?
         WHERE NOT EXISTS (SELECT 1 FROM report WHERE target_type = 'place' AND target_id = ? AND reason = 'burst' AND status = 'open')`,
      )
      .bind(ulid(now), input.placeId, input.placeId, now, input.placeId)
      .run();
  }

  const candidateId = exact?.id ?? ulid(now);
  const statements: D1PreparedStatement[] = [];
  if (exact) {
    statements.push(
      db.prepare(`UPDATE fact_candidate SET status = ?, effective_to = NULL, created_by = ?, created_at = ? WHERE id = ?`).bind(status, actor.id, now, exact.id),
    );
  } else {
    statements.push(
      db
        .prepare(
          `INSERT INTO fact_candidate (id, fact_id, value_json, value_hash, effective_from, status, score, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .bind(candidateId, fact.id, JSON.stringify(input.value), hash, input.effectiveFrom, status, actor.id, now),
    );
  }
  statements.push(
    activityStatement(db, now, actor.id, input.placeId, "proposed", {
      key: input.key,
      qualifier: input.qualifier,
      value: input.value,
      effectiveFrom: input.effectiveFrom,
      held: status === "held",
    }),
  );
  await db.batch(statements);
  return castVote(db, { actor, candidateId, polarity: 1, source: input.source, now, evidence: input.evidence, geoVerified: input.geoVerified });
}

function auditStatement(
  db: D1Database,
  now: number,
  actorId: string | null,
  action: string,
  targetType: string,
  targetId: string,
  before: unknown,
  after: unknown,
  revertsId: string | null = null,
) {
  return db
    .prepare(
      `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, before_json, after_json, reverts_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(ulid(now), actorId, action, targetType, targetId, JSON.stringify(before), JSON.stringify(after), revertsId, now);
}

/** Moderator approval of a held value: it goes live immediately. */
export async function approveHeld(db: D1Database, input: { moderatorId: string; candidateId: string; now: number }) {
  const { now } = input;
  const candidate = await getCandidate(db, input.candidateId);
  if (candidate.status !== "held") throw new TrustError("That value is not waiting for review.", 409);
  const current = await db
    .prepare(`SELECT id FROM fact_candidate WHERE fact_id = ? AND status = 'current'`)
    .bind(candidate.fact_id)
    .first<{ id: string }>();
  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE fact_candidate SET status = 'current', effective_to = NULL WHERE id = ?`).bind(candidate.id),
    db.prepare(`UPDATE fact SET current_candidate_id = ?, updated_at = ? WHERE id = ?`).bind(candidate.id, now, candidate.fact_id),
    db.prepare(`UPDATE user SET accepted_count = accepted_count + 1, reputation = reputation + 1 WHERE id = ?`).bind(candidate.created_by),
    auditStatement(db, now, input.moderatorId, "promote", "fact", candidate.fact_id, { candidateId: current?.id ?? null }, { candidateId: candidate.id }),
    activityStatement(db, now, null, candidate.place_id, "promoted", {
      key: candidate.key,
      qualifier: candidate.qualifier,
      value: JSON.parse(candidate.value_json),
      replaced: Boolean(current),
    }),
  ];
  if (current) {
    statements.push(
      db
        .prepare(`UPDATE fact_candidate SET status = 'superseded', effective_to = ? WHERE id = ?`)
        .bind(previousDay(candidate.effective_from), current.id),
    );
  }
  await db.batch(statements);
  return recomputeFact(db, candidate.fact_id, now, input.moderatorId);
}

export async function rejectHeld(db: D1Database, input: { moderatorId: string; candidateId: string; now: number }) {
  const candidate = await getCandidate(db, input.candidateId);
  if (candidate.status !== "held" && candidate.status !== "candidate") {
    throw new TrustError("Only pending values can be rejected.", 409);
  }
  await db.batch([
    db.prepare(`UPDATE fact_candidate SET status = 'rejected' WHERE id = ?`).bind(candidate.id),
    db.prepare(`UPDATE user SET rejected_count = rejected_count + 1 WHERE id = ?`).bind(candidate.created_by),
    auditStatement(db, input.now, input.moderatorId, "reject", "candidate", candidate.id, { status: candidate.status }, { status: "rejected" }),
  ]);
  return recomputeFact(db, candidate.fact_id, input.now, input.moderatorId);
}

/** Reverts a promotion from the audit log: the previous value becomes current again. */
export async function revertPromotion(db: D1Database, input: { moderatorId: string; auditId: string; now: number }) {
  const { now } = input;
  const entry = await db.prepare(`SELECT * FROM audit_log WHERE id = ?`).bind(input.auditId).first<{
    id: string;
    action: string;
    target_id: string;
    before_json: string | null;
    after_json: string | null;
    reverted_at: number | null;
  }>();
  if (!entry || entry.action !== "promote") throw new TrustError("Only promotions can be reverted.", 400);
  if (entry.reverted_at) throw new TrustError("That change was already reverted.", 409);
  const before = JSON.parse(entry.before_json ?? "{}") as { candidateId?: string | null };
  const after = JSON.parse(entry.after_json ?? "{}") as { candidateId?: string | null };
  if (!after.candidateId) throw new TrustError("Nothing to revert.", 400);
  const promoted = await getCandidate(db, after.candidateId);
  if (promoted.status !== "current") throw new TrustError("That value is no longer current, so it cannot be reverted.", 409);

  const statements: D1PreparedStatement[] = [
    db.prepare(`UPDATE fact_candidate SET status = 'rejected', effective_to = NULL WHERE id = ?`).bind(promoted.id),
    db
      .prepare(`UPDATE user SET rejected_count = rejected_count + 1, reputation = reputation - 5 WHERE id = ?`)
      .bind(promoted.created_by),
    db
      .prepare(`UPDATE fact SET current_candidate_id = ?, updated_at = ? WHERE id = ?`)
      .bind(before.candidateId ?? null, now, entry.target_id),
    db.prepare(`UPDATE audit_log SET reverted_at = ? WHERE id = ?`).bind(now, entry.id),
    auditStatement(db, now, input.moderatorId, "revert", "fact", entry.target_id, after, before, entry.id),
    activityStatement(db, now, null, promoted.place_id, "reverted", {
      key: promoted.key,
      qualifier: promoted.qualifier,
      value: JSON.parse(promoted.value_json),
    }),
  ];
  if (before.candidateId) {
    statements.push(
      db.prepare(`UPDATE fact_candidate SET status = 'current', effective_to = NULL WHERE id = ?`).bind(before.candidateId),
    );
  }
  await db.batch(statements);
  return recomputeFact(db, entry.target_id, now, input.moderatorId);
}

type TrustRow = {
  id: string;
  accepted_count: number;
  rejected_count: number;
  created_at: number;
  trust_override: number | null;
  email_verified: number;
  trust_level: number;
};

export async function refreshActorTrust(db: D1Database, userId: string, now: number): Promise<TrustLevel> {
  const row = await db
    .prepare(`SELECT id, accepted_count, rejected_count, created_at, trust_override, email_verified, trust_level FROM user WHERE id = ?`)
    .bind(userId)
    .first<TrustRow>();
  if (!row) return 0;
  const level = trustLevelFor({
    accepted: row.accepted_count,
    rejected: row.rejected_count,
    accountAgeMs: now - row.created_at,
    override: row.trust_override,
    emailVerified: row.email_verified === 1,
  });
  if (level !== asTrustLevel(row.trust_level)) {
    await db.prepare(`UPDATE user SET trust_level = ? WHERE id = ?`).bind(level, userId).run();
  }
  return level;
}

/** Nightly SQL form of `trustLevelFor`, limited to users who can hold a level above 0. */
export function nightlyTrustStatement(db: D1Database, now: number) {
  const day = 24 * 60 * 60 * 1000;
  return db
    .prepare(
      `UPDATE user SET trust_level = CASE
         WHEN trust_override IS NOT NULL THEN trust_override
         WHEN email_verified = 0 THEN 0
         WHEN accepted_count >= 50 AND accepted_count * 1.0 / (accepted_count + rejected_count) >= 0.9 AND created_at <= ? THEN 2
         WHEN accepted_count >= 5 AND created_at <= ? THEN 1
         ELSE 0 END
       WHERE deleted_at IS NULL AND (accepted_count >= 5 OR trust_override IS NOT NULL OR trust_level > 0)`,
    )
    .bind(now - 30 * day, now - 7 * day);
}

/** Held values with no dispute after 48h are released (spec 5.4, trust level 0 limits). */
export async function releaseDueHolds(db: D1Database, now: number, limit = 100): Promise<number> {
  const due = await db
    .prepare(
      `SELECT fact_candidate.id, fact_candidate.fact_id, fact_candidate.created_at,
         (SELECT COUNT(*) FROM vote WHERE vote.candidate_id = fact_candidate.id AND vote.polarity < 0) AS disputes
       FROM fact_candidate WHERE status = 'held' AND created_at <= ? ORDER BY created_at LIMIT ?`,
    )
    .bind(now - HOLD_RELEASE_MS, limit)
    .all<{ id: string; fact_id: string; created_at: number; disputes: number }>();
  let released = 0;
  for (const row of due.results ?? []) {
    if (holdRelease({ createdAt: row.created_at, now, disputes: row.disputes, trustedConfirms: 0 }) !== "release") continue;
    await db.batch([
      db.prepare(`UPDATE fact_candidate SET status = 'candidate' WHERE id = ? AND status = 'held'`).bind(row.id),
      auditStatement(db, now, null, "release", "candidate", row.id, { status: "held" }, { status: "candidate" }),
    ]);
    await recomputeFact(db, row.fact_id, now);
    released += 1;
  }
  return released;
}

/** Facts whose state can drift with time alone (decay, 60-day staleness), oldest first. */
export async function factsDueForRecompute(db: D1Database, now: number, limit = 1000): Promise<string[]> {
  const rows = await db
    .prepare(
      `SELECT id FROM fact WHERE state IN ('verified', 'unverified', 'disputed') AND updated_at < ?
         AND NOT (key LIKE 'timetable.%' AND qualifier < ?) ORDER BY updated_at LIMIT ?`,
    )
    // Timetable values for days that have passed never need recomputing.
    .bind(now - 20 * 60 * 60 * 1000, isoDay(now - DAY_MS), limit)
    .all<{ id: string }>();
  return (rows.results ?? []).map((row) => row.id);
}

