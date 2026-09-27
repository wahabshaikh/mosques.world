import { describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { dailyUsage, limitProblem, writeAllowed } from "./ratelimit";

describe("rate limits", () => {
  it("allows the 20th and refuses the 21st vote for a level-0 user", () => {
    expect(limitProblem(0, { votes: 19, values: 0 }, { votes: 1, values: 0 })).toBeNull();
    expect(limitProblem(0, { votes: 20, values: 0 }, { votes: 1, values: 0 })).toMatch(/limit of 20 confirmations/);
    expect(limitProblem(0, { votes: 0, values: 5 }, { votes: 1, values: 1 })).toMatch(/limit of 5 new times/);
    expect(limitProblem(1, { votes: 20, values: 5 }, { votes: 1, values: 1 })).toBeNull();
    expect(limitProblem(3, { votes: 10_000, values: 10_000 }, { votes: 1, values: 1 })).toBeNull();
  });

  it("counts the last 24 hours", async () => {
    const { d1, sqlite } = createTestD1();
    const now = 10 * 24 * 60 * 60 * 1000;
    sqlite.exec("PRAGMA foreign_keys = OFF");
    sqlite.exec(`INSERT INTO vote (id, candidate_id, user_id, polarity, weight, created_at) VALUES ('v1', 'c1', 'u', 1, 1, ${now - 1000}), ('v2', 'c2', 'u', 1, 1, ${now - 2 * 86_400_000})`);
    expect(await dailyUsage(d1, "u", now)).toEqual({ votes: 1, values: 0 });
  });

  it("uses the binding when present", async () => {
    expect(await writeAllowed(undefined, "k")).toBe(true);
    const binding = { limit: async () => ({ success: false }) } as unknown as RateLimit;
    expect(await writeAllowed(binding, "k")).toBe(false);
  });
});
