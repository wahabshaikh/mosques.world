import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { castVote, submitValue, type Actor } from "./store";
import { myVotes, placeActivity, placeFacts, placeHistory, placeTrustStats } from "./read";

const NOW = Date.UTC(2026, 8, 27, 12);
let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

function user(id: string, level: 0 | 1 | 2 | 3, username: string | null = id): Actor {
  sqlite
    .prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, username) VALUES (?, ?, ?, 1, 0, 0, ?)`)
    .run(id, id, `${id}@x`, username);
  return { id, trustLevel: level, createdAt: 0, role: "user" };
}

function propose(actor: Actor, key: string, value: unknown, qualifier = "", from = "2026-09-27") {
  return submitValue(d1, { actor, placeId: "p", key, qualifier, value, effectiveFrom: from, source: "board", now: NOW });
}

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
    VALUES ('p', 'p', 'P', 'mosque', 0, 0, 's00000', 'GB', 'london', 'Europe/London', 'MuslimWorldLeague', 'shafi', 0, 0)`);
});

describe("read models", () => {
  it("returns current, shown and challenging values", async () => {
    const a = user("a", 1);
    const b = user("b", 1);
    const first = await propose(a, "iqamah.isha", { t: "20:45" });
    await castVote(d1, { actor: b, candidateId: first.candidateId, polarity: 1, source: "other", now: NOW });
    const change = await propose(user("c", 1), "iqamah.isha", { t: "20:30" }, "", "2026-10-01");
    await propose(a, "jumuah.jamaah", { t: "13:15" }, "2");
    await propose(a, "jumuah.jamaah", { t: "12:45" }, "1");

    const facts = await placeFacts(d1, "p", "2026-09-27");
    const isha = facts.find((fact) => fact.key === "iqamah.isha");
    expect(isha?.current?.value).toEqual({ t: "20:45" });
    expect(isha?.shown?.candidateId).toBe(first.candidateId);
    expect(isha?.challenger?.candidateId).toBe(change.candidateId);
    expect(isha?.current).toMatchObject({ backers: 2, disputes: 0, author: "@a" });
    expect(facts.filter((fact) => fact.key === "jumuah.jamaah").map((fact) => fact.qualifier)).toEqual(["1", "2"]);

    const history = await placeHistory(d1, "p");
    expect(history.map((entry) => entry.status)).toContain("candidate");
    expect(history).toHaveLength(4);

    const activity = await placeActivity(d1, "p");
    expect(activity[0]?.handle).toMatch(/^@|mosques\.world/);
    // First values are already shown as "reported"; only replacements appear as engine entries.
    expect(activity.some((item) => item.type === "promoted")).toBe(false);

    const stats = await placeTrustStats(d1, "p", NOW);
    expect(stats).toEqual({ contributors: 3, recentConfirmers: 2, agreement: 100 });
    expect(await myVotes(d1, "p", "b")).toEqual({ [first.candidateId]: 1 });
  });

  it("anonymises deleted members and handles empty places", async () => {
    const gone = user("gone", 1, null);
    await propose(gone, "iqamah.fajr", { t: "05:45" });
    sqlite.exec(`UPDATE user SET deleted_at = 1 WHERE id = 'gone'`);
    const [fact] = await placeFacts(d1, "p", "2026-09-27");
    expect(fact?.current?.author).toBe("former member");
    expect((await placeActivity(d1, "p")).find((item) => item.actorId === "gone")?.handle).toBe("former member");
    sqlite.exec(`DELETE FROM activity; DELETE FROM vote;`);
    expect(await placeTrustStats(d1, "p", NOW)).toEqual({ contributors: 0, recentConfirmers: 0, agreement: null });
    expect(await placeFacts(d1, "missing", "2026-09-27")).toEqual([]);
  });
});
