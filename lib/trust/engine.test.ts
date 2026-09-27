import { describe, expect, it } from "vitest";
import {
  agreementOf,
  asTrustLevel,
  candidateScore,
  confirmationsNeeded,
  dailyLimits,
  decay,
  displayedOn,
  evaluateFact,
  holdRelease,
  HOLD_RELEASE_MS,
  lastConfirmation,
  placeVerification,
  previousDay,
  shouldHold,
  supporters,
  trustLevelFor,
  voteWeight,
  type EngineCandidate,
  type EngineVote,
} from "./engine";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 27, 12);
const OLD_ACCOUNT = NOW - 365 * DAY;

function vote(userId: string, weight: number, polarity: 1 | -1 = 1, ageMs = 0, userCreatedAt = OLD_ACCOUNT): EngineVote {
  return { userId, weight, polarity, createdAt: NOW - ageMs, userCreatedAt };
}

function candidate(id: string, status: EngineCandidate["status"], votes: EngineVote[], extra: Partial<EngineCandidate> = {}): EngineCandidate {
  return {
    id,
    status,
    votes,
    createdBy: votes[0]?.userId ?? "author",
    effectiveFrom: "2026-09-27",
    createdAt: NOW - 1000,
    ...extra,
  };
}

describe("voteWeight", () => {
  it("uses the trust level base", () => {
    expect(voteWeight({ trustLevel: 0, source: "other" })).toBe(1);
    expect(voteWeight({ trustLevel: 1, source: "other" })).toBe(1.5);
    expect(voteWeight({ trustLevel: 2, source: "imam" })).toBe(2.5);
    expect(voteWeight({ trustLevel: 3, source: "website" })).toBe(3);
  });

  it("applies steward, geo, evidence and board multipliers", () => {
    expect(voteWeight({ trustLevel: 0, source: "board" })).toBe(1.2);
    expect(voteWeight({ trustLevel: 0, source: "announcement" })).toBe(1.2);
    expect(voteWeight({ trustLevel: 1, source: "board", steward: true, geoVerified: true, evidenceApproved: true })).toBe(
      3.5 * 1.5 * 1.5 * 1.2,
    );
  });
});

describe("decay and scores", () => {
  it("halves every 45 days and never grows for future votes", () => {
    expect(decay(0)).toBe(1);
    expect(decay(45 * DAY)).toBeCloseTo(0.5);
    expect(decay(-DAY)).toBe(1);
  });

  it("sums signed decayed weights", () => {
    const item = candidate("a", "candidate", [vote("u1", 1), vote("u2", 1.5), vote("u3", 1, -1), vote("u4", 2, 1, 45 * DAY)]);
    expect(candidateScore(item, NOW)).toBeCloseTo(1 + 1.5 - 1 + 1);
    expect(supporters(item, NOW)).toBe(3);
  });

  it("ignores votes from the future, new accounts and a given user when asked", () => {
    const fresh = vote("new", 5, 1, 0, NOW - 1000);
    const future = { ...vote("later", 5), createdAt: NOW + DAY };
    const item = candidate("a", "candidate", [vote("author", 1), fresh, future]);
    expect(candidateScore(item, NOW)).toBe(6);
    expect(candidateScore(item, NOW, { excludeNewAccounts: true })).toBe(1);
    expect(candidateScore(item, NOW, { excludeUser: "author" })).toBe(5);
    expect(supporters(item, NOW, { excludeNewAccounts: true })).toBe(1);
  });

  it("finds the latest confirmation", () => {
    expect(lastConfirmation(candidate("a", "current", []))).toBeNull();
    expect(lastConfirmation(candidate("a", "current", [vote("u1", 1, 1, DAY), vote("u2", 1, -1), vote("u3", 1, 1, 2 * DAY)]))).toBe(
      NOW - DAY,
    );
  });
});

describe("evaluateFact", () => {
  it("is unknown without values", () => {
    const outcome = evaluateFact([], NOW);
    expect(outcome.state).toBe("unknown");
    expect(outcome.currentId).toBeNull();
    expect(outcome.challengerId).toBeNull();
  });

  it("promotes a first value at score 1 as unverified (acceptance 2)", () => {
    const outcome = evaluateFact([candidate("a", "candidate", [vote("u1", 1)])], NOW);
    expect(outcome.promotedId).toBe("a");
    expect(outcome.currentId).toBe("a");
    expect(outcome.supersededId).toBeNull();
    expect(outcome.state).toBe("unverified");
  });

  it("does not promote a first value below score 1", () => {
    const outcome = evaluateFact([candidate("a", "candidate", [vote("u1", 1, 1, 10 * DAY)])], NOW);
    expect(outcome.promotedId).toBeNull();
    expect(outcome.state).toBe("unknown");
  });

  it("verifies at score 3 from two users (acceptance 3)", () => {
    const two = evaluateFact([candidate("a", "current", [vote("u1", 1), vote("u2", 1)])], NOW);
    expect(two.state).toBe("unverified");
    const three = evaluateFact([candidate("a", "current", [vote("u1", 1), vote("u2", 1), vote("u3", 1.5)])], NOW);
    expect(three.state).toBe("verified");
    expect(three.confidence).toBe(1);
    const solo = evaluateFact([candidate("a", "current", [vote("u1", 3)])], NOW);
    expect(solo.state).toBe("unverified");
  });

  it("marks a value stale after 60 days without confirmation", () => {
    const outcome = evaluateFact([candidate("a", "current", [vote("u1", 3, 1, 61 * DAY), vote("u2", 3, 1, 61 * DAY)])], NOW);
    expect(outcome.state).toBe("stale");
    const unconfirmed = evaluateFact([candidate("a", "current", [vote("u1", 1, -1)])], NOW);
    expect(unconfirmed.state).toBe("stale");
  });

  it("disputes when a challenger has score from someone other than its author (acceptance 4)", () => {
    const current = candidate("cur", "current", [vote("u1", 1.5), vote("u2", 1), vote("u3", 1)]);
    const authorOnly = candidate("new", "candidate", [vote("p", 1.8)], { createdBy: "p" });
    const first = evaluateFact([current, authorOnly], NOW);
    expect(first.state).toBe("verified");
    expect(first.challengerId).toBe("new");

    const backed = candidate("new", "candidate", [vote("p", 1.8), vote("t1", 3)], { createdBy: "p" });
    const second = evaluateFact([current, backed], NOW);
    expect(second.state).toBe("disputed");
    expect(second.promotedId).toBeNull();

    const twice = candidate("new", "candidate", [vote("p", 1.8), vote("t1", 3), vote("t2", 3)], {
      createdBy: "p",
      effectiveFrom: "2026-09-28",
    });
    const third = evaluateFact([current, twice], NOW);
    expect(third.promotedId).toBe("new");
    expect(third.supersededId).toBe("cur");
    expect(third.supersededTo).toBe("2026-09-27");
    expect(third.currentId).toBe("new");
    expect(third.challengerId).toBeNull();
  });

  it("needs a lead of 2 and two distinct supporters to replace", () => {
    const current = candidate("cur", "current", [vote("u1", 2), vote("u2", 2)]);
    const narrow = candidate("new", "candidate", [vote("p", 3), vote("q", 2.5)]);
    expect(evaluateFact([current, narrow], NOW).promotedId).toBeNull();
    const solo = candidate("new", "candidate", [vote("p", 10)]);
    expect(evaluateFact([candidate("cur", "current", [vote("u1", 1)]), solo], NOW).promotedId).toBeNull();
  });

  it("ignores new accounts when replacing a value", () => {
    const current = candidate("cur", "current", [vote("u1", 1)]);
    const sybil = candidate("new", "candidate", [vote("p", 3, 1, 0, NOW - 1000), vote("q", 3, 1, 0, NOW - 1000)]);
    expect(evaluateFact([current, sybil], NOW).promotedId).toBeNull();
  });

  it("ignores held, rejected and superseded candidates", () => {
    const outcome = evaluateFact(
      [
        candidate("held", "held", [vote("u1", 9), vote("u2", 9)]),
        candidate("rej", "rejected", [vote("u1", 9)]),
        candidate("old", "superseded", [vote("u1", 9)]),
      ],
      NOW,
    );
    expect(outcome.currentId).toBeNull();
    expect(outcome.state).toBe("unknown");
  });

  it("breaks score ties by the older candidate", () => {
    const older = candidate("older", "candidate", [vote("u1", 1)], { createdAt: NOW - 5000 });
    const newer = candidate("newer", "candidate", [vote("u2", 1)], { createdAt: NOW - 10 });
    expect(evaluateFact([newer, older], NOW).promotedId).toBe("older");
    expect(evaluateFact([older, newer], NOW).promotedId).toBe("older");
  });
});

describe("agreementOf", () => {
  it("weights confirmations against disputes in the last 90 days", () => {
    expect(agreementOf([], NOW)).toBe(1);
    expect(agreementOf([vote("a", 3), vote("b", 1, -1), vote("c", 5, -1, 100 * DAY)], NOW)).toBe(0.75);
  });
});

describe("displayedOn", () => {
  const rows = [
    { id: "old", status: "superseded" as const, effectiveFrom: "2026-01-01", effectiveTo: "2026-09-30" },
    { id: "new", status: "current" as const, effectiveFrom: "2026-10-01", effectiveTo: null },
    { id: "gone", status: "rejected" as const, effectiveFrom: "2026-01-01", effectiveTo: null },
  ];

  it("shows a dated value only from its date", () => {
    expect(displayedOn(rows, "2026-09-27")?.id).toBe("old");
    expect(displayedOn(rows, "2026-10-01")?.id).toBe("new");
    expect(displayedOn(rows, "2025-12-31")).toBeNull();
  });

  it("prefers the current value on the same start date", () => {
    const same = [
      { id: "old", status: "superseded" as const, effectiveFrom: "2026-09-27", effectiveTo: null },
      { id: "cur", status: "current" as const, effectiveFrom: "2026-09-27", effectiveTo: null },
    ];
    expect(displayedOn(same, "2026-09-27")?.id).toBe("cur");
  });
});

describe("placeVerification", () => {
  it("summarises the five daily iqamahs", () => {
    expect(placeVerification([])).toBe("none");
    expect(placeVerification(["unknown", "unverified"])).toBe("none");
    expect(placeVerification(["verified", "unverified"])).toBe("partial");
    expect(placeVerification(Array(5).fill("verified"))).toBe("verified");
    expect(placeVerification(["verified", "stale"])).toBe("needs_check");
    expect(placeVerification(["disputed"])).toBe("needs_check");
  });
});

describe("holds", () => {
  it("holds level-0 changes to established values only", () => {
    expect(shouldHold({ trustLevel: 0, currentState: "verified", currentConfirmations: 0 })).toBe(true);
    expect(shouldHold({ trustLevel: 0, currentState: "unverified", currentConfirmations: 3 })).toBe(true);
    expect(shouldHold({ trustLevel: 0, currentState: "unverified", currentConfirmations: 2 })).toBe(false);
    expect(shouldHold({ trustLevel: 1, currentState: "verified", currentConfirmations: 9 })).toBe(false);
    expect(shouldHold({ trustLevel: 0, currentState: "verified", currentConfirmations: 9, steward: true })).toBe(false);
  });

  it("releases after a trusted confirm or 48h without dispute", () => {
    expect(holdRelease({ createdAt: NOW, now: NOW, disputes: 0, trustedConfirms: 1 })).toBe("release");
    expect(holdRelease({ createdAt: NOW, now: NOW + HOLD_RELEASE_MS, disputes: 0, trustedConfirms: 0 })).toBe("release");
    expect(holdRelease({ createdAt: NOW, now: NOW + HOLD_RELEASE_MS, disputes: 1, trustedConfirms: 0 })).toBe("wait");
    expect(holdRelease({ createdAt: NOW, now: NOW + DAY, disputes: 0, trustedConfirms: 0 })).toBe("wait");
  });
});

describe("trust levels", () => {
  it("derives levels from accepted work and account age", () => {
    const base = { rejected: 0, override: null, emailVerified: true };
    expect(trustLevelFor({ ...base, accepted: 0, accountAgeMs: 100 * DAY })).toBe(0);
    expect(trustLevelFor({ ...base, accepted: 5, accountAgeMs: 6 * DAY })).toBe(0);
    expect(trustLevelFor({ ...base, accepted: 5, accountAgeMs: 7 * DAY })).toBe(1);
    expect(trustLevelFor({ ...base, accepted: 50, accountAgeMs: 30 * DAY })).toBe(2);
    expect(trustLevelFor({ ...base, accepted: 50, rejected: 10, accountAgeMs: 30 * DAY })).toBe(1);
    expect(trustLevelFor({ ...base, accepted: 50, emailVerified: false, accountAgeMs: 30 * DAY })).toBe(0);
    expect(trustLevelFor({ ...base, accepted: 0, override: 3, accountAgeMs: 0 })).toBe(3);
  });

  it("normalises stored levels and exposes limits", () => {
    expect(asTrustLevel(2)).toBe(2);
    expect(asTrustLevel(7)).toBe(0);
    expect(asTrustLevel(null)).toBe(0);
    expect(dailyLimits(0)).toEqual({ votes: 20, values: 5 });
    expect(dailyLimits(1).votes).toBe(100);
    expect(dailyLimits(2).votes).toBe(300);
    expect(dailyLimits(3).votes).toBe(Infinity);
  });

  it("computes the previous local day", () => {
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
  });
});

describe("threshold tolerance", () => {
  it("treats a score decayed by minutes as meeting its threshold", () => {
    const fresh = [vote("u1", 1, 1, 60_000), vote("u2", 1, 1, 30_000), vote("u3", 1, 1, 0)];
    expect(evaluateFact([candidate("a", "current", fresh)], NOW).state).toBe("verified");
    expect(confirmationsNeeded({ role: "current", score: 1.99999, supporters: 2 })).toBe(1);
  });
});

describe("confirmationsNeeded", () => {
  it("estimates remaining level-0 confirmations", () => {
    expect(confirmationsNeeded({ role: "first", score: 0, supporters: 0 })).toBe(1);
    expect(confirmationsNeeded({ role: "first", score: 1, supporters: 1 })).toBe(0);
    expect(confirmationsNeeded({ role: "current", score: 2, supporters: 2 })).toBe(1);
    expect(confirmationsNeeded({ role: "current", score: 3, supporters: 1 })).toBe(1);
    expect(confirmationsNeeded({ role: "current", score: 3.5, supporters: 3 })).toBe(0);
    expect(confirmationsNeeded({ role: "challenger", score: 1.8, supporters: 1, currentScore: 3.5 })).toBe(4);
    expect(confirmationsNeeded({ role: "challenger", score: 4.8, supporters: 2, currentScore: 3.5 })).toBe(1);
    expect(confirmationsNeeded({ role: "challenger", score: 3, supporters: 1 })).toBe(1);
  });
});
