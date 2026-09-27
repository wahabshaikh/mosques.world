import type { VoteSource } from "./facts";

/**
 * Facts + votes consensus engine (spec 5.4). Pure functions only: the store loads rows,
 * calls these, and writes the outcome back in one D1 batch.
 */

export type TrustLevel = 0 | 1 | 2 | 3;
export type CandidateStatus = "candidate" | "current" | "superseded" | "rejected" | "held";
export type FactState = "unknown" | "unverified" | "verified" | "disputed" | "stale";
export type PlaceVerification = "none" | "partial" | "verified" | "needs_check";

const DAY = 24 * 60 * 60 * 1000;
export const HALF_LIFE_DAYS = 45;
export const STALE_AFTER_DAYS = 60;
export const HOLD_RELEASE_MS = 48 * 60 * 60 * 1000;
export const NEW_ACCOUNT_MS = DAY;
/** Threshold tolerance: a few hours of decay must not flip a value that just met a threshold. */
const EPSILON = 0.01;

const LEVEL_WEIGHT: Record<TrustLevel, number> = { 0: 1, 1: 1.5, 2: 2.5, 3: 3 };

export function asTrustLevel(value: number | null | undefined): TrustLevel {
  if (value === 1 || value === 2 || value === 3) return value;
  return 0;
}

export function voteWeight(input: {
  trustLevel: TrustLevel;
  source: VoteSource;
  steward?: boolean;
  geoVerified?: boolean;
  evidenceApproved?: boolean;
}): number {
  const base = LEVEL_WEIGHT[input.trustLevel] + (input.steward ? 2 : 0);
  const geo = input.geoVerified ? 1.5 : 1;
  const evidence = input.evidenceApproved ? 1.5 : 1;
  const source = input.source === "board" || input.source === "announcement" ? 1.2 : 1;
  return round(base * geo * evidence * source);
}

export function decay(ageMs: number): number {
  return 0.5 ** (Math.max(0, ageMs) / DAY / HALF_LIFE_DAYS);
}

export type EngineVote = {
  userId: string;
  polarity: 1 | -1;
  weight: number;
  createdAt: number;
  /** When the voter's account was created (for the < 24h rule on replacements). */
  userCreatedAt: number;
};

export type EngineCandidate = {
  id: string;
  createdBy: string;
  status: CandidateStatus;
  effectiveFrom: string;
  createdAt: number;
  votes: EngineVote[];
};

type ScoreOptions = { excludeNewAccounts?: boolean; excludeUser?: string };

function counts(vote: EngineVote, now: number, options: ScoreOptions): boolean {
  if (options.excludeUser && vote.userId === options.excludeUser) return false;
  if (options.excludeNewAccounts && vote.createdAt - vote.userCreatedAt < NEW_ACCOUNT_MS) return false;
  return vote.createdAt <= now;
}

export function candidateScore(candidate: EngineCandidate, now: number, options: ScoreOptions = {}): number {
  let total = 0;
  for (const vote of candidate.votes) {
    if (!counts(vote, now, options)) continue;
    total += vote.polarity * vote.weight * decay(now - vote.createdAt);
  }
  return round(total);
}

export function supporters(candidate: EngineCandidate, now: number, options: ScoreOptions = {}): number {
  const ids = new Set<string>();
  for (const vote of candidate.votes) {
    if (vote.polarity > 0 && counts(vote, now, options)) ids.add(vote.userId);
  }
  return ids.size;
}

export function lastConfirmation(candidate: EngineCandidate): number | null {
  let latest: number | null = null;
  for (const vote of candidate.votes) {
    if (vote.polarity > 0 && (latest === null || vote.createdAt > latest)) latest = vote.createdAt;
  }
  return latest;
}

export function previousDay(date: string): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day - 1));
  return value.toISOString().slice(0, 10);
}

export type FactOutcome = {
  currentId: string | null;
  promotedId: string | null;
  supersededId: string | null;
  /** effective_to for the superseded candidate. */
  supersededTo: string | null;
  state: FactState;
  confidence: number;
  lastConfirmedAt: number | null;
  /** Best open challenger with a positive score (drives the dispute banner). */
  challengerId: string | null;
  scores: Record<string, number>;
  supporters: Record<string, number>;
};

function best(candidates: EngineCandidate[], score: (candidate: EngineCandidate) => number): EngineCandidate | null {
  let winner: EngineCandidate | null = null;
  let top = -Infinity;
  for (const candidate of candidates) {
    const value = score(candidate);
    if (value > top + EPSILON || (Math.abs(value - top) <= EPSILON && winner && candidate.createdAt < winner.createdAt)) {
      winner = candidate;
      top = value;
    }
  }
  return winner;
}

export function evaluateFact(candidates: EngineCandidate[], now: number): FactOutcome {
  const scores: Record<string, number> = {};
  const backers: Record<string, number> = {};
  for (const candidate of candidates) {
    scores[candidate.id] = candidateScore(candidate, now);
    backers[candidate.id] = supporters(candidate, now);
  }

  let current = candidates.find((candidate) => candidate.status === "current") ?? null;
  const open = candidates.filter((candidate) => candidate.status === "candidate");
  let promoted: EngineCandidate | null = null;
  let superseded: EngineCandidate | null = null;

  if (!current) {
    const top = best(open, (candidate) => scores[candidate.id] ?? 0);
    if (top && (scores[top.id] ?? 0) >= 1 - EPSILON) promoted = top;
  } else {
    const currentScore = scores[current.id] ?? 0;
    const strict = { excludeNewAccounts: true };
    const top = best(open, (candidate) => candidateScore(candidate, now, strict));
    if (top) {
      const challengerScore = candidateScore(top, now, strict);
      if (
        challengerScore >= 3 - EPSILON &&
        challengerScore - currentScore >= 2 - EPSILON &&
        supporters(top, now, strict) >= 2
      ) {
        promoted = top;
        superseded = current;
      }
    }
  }

  if (promoted) current = promoted;
  const remaining = open.filter((candidate) => candidate !== promoted);
  const challenger = best(
    remaining.filter((candidate) => (scores[candidate.id] ?? 0) > EPSILON),
    (candidate) => scores[candidate.id] ?? 0,
  );

  const lastConfirmedAt = current ? lastConfirmation(current) : null;
  const state = factState({
    current,
    challengers: remaining,
    now,
    lastConfirmedAt,
  });

  return {
    currentId: current?.id ?? null,
    promotedId: promoted?.id ?? null,
    supersededId: superseded?.id ?? null,
    supersededTo: superseded && promoted ? previousDay(promoted.effectiveFrom) : null,
    state,
    confidence: current ? confidence(current, now) : 0,
    lastConfirmedAt,
    challengerId: current ? (challenger?.id ?? null) : null,
    scores,
    supporters: backers,
  };
}

function factState(input: {
  current: EngineCandidate | null;
  challengers: EngineCandidate[];
  now: number;
  lastConfirmedAt: number | null;
}): FactState {
  const { current, now } = input;
  if (!current) return "unknown";
  const disputed = input.challengers.some(
    (candidate) => candidateScore(candidate, now, { excludeUser: candidate.createdBy }) >= 1 - EPSILON,
  );
  if (disputed) return "disputed";
  if (input.lastConfirmedAt === null || now - input.lastConfirmedAt > STALE_AFTER_DAYS * DAY) return "stale";
  if (candidateScore(current, now) >= 3 - EPSILON && supporters(current, now) >= 2) return "verified";
  return "unverified";
}

function confidence(candidate: EngineCandidate, now: number): number {
  const score = candidateScore(candidate, now);
  const agreement = agreementOf(candidate.votes, now);
  return round(Math.max(0, Math.min(1, score / 3)) * agreement);
}

/** Σ(+w)/Σ(|w|) over votes cast in the last 90 days (1 when there are none). */
export function agreementOf(votes: EngineVote[], now: number): number {
  let positive = 0;
  let total = 0;
  for (const vote of votes) {
    if (now - vote.createdAt > 90 * DAY) continue;
    total += vote.weight;
    if (vote.polarity > 0) positive += vote.weight;
  }
  return total === 0 ? 1 : round(positive / total);
}

/**
 * Rough count of further level-0 confirmations a value needs: to go live (first value), to be
 * verified (current value), or to replace the current value (challenger). Used for UI copy only.
 */
export function confirmationsNeeded(input: {
  role: "first" | "current" | "challenger";
  score: number;
  supporters: number;
  currentScore?: number;
}): number {
  const perPerson = 1;
  const people = (target: number) => Math.max(0, Math.ceil((target - input.score - EPSILON) / perPerson));
  if (input.role === "first") return people(1);
  if (input.role === "current") return Math.max(people(3), 2 - input.supporters, 0);
  return Math.max(people(Math.max(3, (input.currentScore ?? 0) + 2)), 2 - input.supporters, 0);
}

export type DatedCandidate = {
  id: string;
  status: CandidateStatus;
  effectiveFrom: string;
  effectiveTo: string | null;
};

/** The candidate whose value applies on a local date (dated values show only from their date). */
export function displayedOn<T extends DatedCandidate>(candidates: T[], date: string): T | null {
  let chosen: T | null = null;
  for (const candidate of candidates) {
    if (candidate.status !== "current" && candidate.status !== "superseded") continue;
    if (candidate.effectiveFrom > date) continue;
    if (candidate.effectiveTo !== null && candidate.effectiveTo < date) continue;
    if (
      !chosen ||
      candidate.effectiveFrom > chosen.effectiveFrom ||
      (candidate.effectiveFrom === chosen.effectiveFrom && candidate.status === "current")
    ) {
      chosen = candidate;
    }
  }
  return chosen;
}

export function placeVerification(states: FactState[]): PlaceVerification {
  if (states.some((state) => state === "disputed" || state === "stale")) return "needs_check";
  if (states.length > 0 && states.every((state) => state === "verified")) return "verified";
  if (states.some((state) => state === "verified")) return "partial";
  return "none";
}

export type HoldInput = {
  trustLevel: TrustLevel;
  currentState: FactState;
  currentConfirmations: number;
  steward?: boolean;
};

/** New accounts' changes to an established value wait for review (spec 5.4 and F3). */
export function shouldHold(input: HoldInput): boolean {
  if (input.trustLevel > 0 || input.steward) return false;
  return input.currentState === "verified" || input.currentConfirmations >= 3;
}

export function holdRelease(input: {
  createdAt: number;
  now: number;
  disputes: number;
  trustedConfirms: number;
}): "release" | "wait" {
  if (input.trustedConfirms > 0) return "release";
  if (input.disputes === 0 && input.now - input.createdAt >= HOLD_RELEASE_MS) return "release";
  return "wait";
}

export type DailyLimits = { votes: number; values: number };

export function dailyLimits(level: TrustLevel): DailyLimits {
  switch (level) {
    case 0:
      return { votes: 20, values: 5 };
    case 1:
      return { votes: 100, values: 50 };
    case 2:
      return { votes: 300, values: 150 };
    case 3:
      return { votes: Infinity, values: Infinity };
    default: {
      const never: never = level;
      return never;
    }
  }
}

export function trustLevelFor(input: {
  accepted: number;
  rejected: number;
  accountAgeMs: number;
  override: number | null;
  emailVerified: boolean;
}): TrustLevel {
  if (input.override !== null) return asTrustLevel(input.override);
  if (!input.emailVerified) return 0;
  const days = input.accountAgeMs / DAY;
  const decided = input.accepted + input.rejected;
  const acceptance = decided === 0 ? 0 : input.accepted / decided;
  if (input.accepted >= 50 && acceptance >= 0.9 && days >= 30) return 2;
  if (input.accepted >= 5 && days >= 7) return 1;
  return 0;
}

export const TRUST_NAMES: Record<TrustLevel, string> = {
  0: "New",
  1: "Contributor",
  2: "Trusted verifier",
  3: "Moderator-trusted",
};

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
