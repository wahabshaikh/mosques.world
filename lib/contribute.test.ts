import { describe, expect, it } from "vitest";
import { contributionInput, effectiveFromProblem, reportInput, resultMessage, voteInput } from "./contribute";

describe("contribution inputs", () => {
  it("parses votes and submissions", () => {
    expect(voteInput.parse({ candidateId: "c", polarity: -1 })).toEqual({ candidateId: "c", polarity: -1, source: "other" });
    expect(voteInput.safeParse({ candidateId: "c", polarity: 2 }).success).toBe(false);
    const parsed = contributionInput.parse({ effectiveFrom: "2026-09-28", changes: [{ key: "iqamah.asr", value: { t: "16:30" } }] });
    expect(parsed.changes[0]?.qualifier).toBe("");
    expect(parsed.confirms).toEqual([]);
    expect(reportInput.safeParse({ placeId: "p", note: "x" }).success).toBe(false);
  });

  it("limits effective dates", () => {
    expect(effectiveFromProblem("2026-09-27", "2026-09-27")).toBeNull();
    expect(effectiveFromProblem("2026-09-26", "2026-09-27")).toMatch(/today/);
    expect(effectiveFromProblem("2026-12-31", "2026-09-27")).toMatch(/60 days/);
    expect(effectiveFromProblem("2026-13-45", "2026-09-27")).toMatch(/valid/);
  });

  it("writes result copy", () => {
    expect(resultMessage("Isha", { status: "pending", needed: 1, state: "verified" })).toBe("Thanks! Isha needs 1 more confirmation.");
    expect(resultMessage("Isha", { status: "pending", needed: 2, state: "verified" })).toBe("Thanks! Isha needs 2 more confirmations.");
    expect(resultMessage("Asr", { status: "live", needed: 2, state: "unverified" })).toMatch(/is live and needs 2 more/);
    expect(resultMessage("Asr", { status: "live", needed: 0, state: "verified" })).toBe("Thanks! Asr is verified.");
    expect(resultMessage("Asr", { status: "live", needed: 0, state: "stale" })).toBe("Thanks! Asr is live.");
    expect(resultMessage("Asr", { status: "held", needed: 0, state: "verified" })).toMatch(/review/);
  });
});
