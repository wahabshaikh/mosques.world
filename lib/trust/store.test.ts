import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { HOLD_RELEASE_MS, trustLevelFor, type TrustLevel } from "./engine";
import {
  approveHeld,
  castVote,
  factsDueForRecompute,
  newAccountBurst,
  nightlyTrustStatement,
  recomputeFact,
  refreshActorTrust,
  rejectHeld,
  releaseDueHolds,
  revertPromotion,
  submitValue,
  TrustError,
  type Actor,
} from "./store";
import { parseSummary } from "./summary";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 27, 12);
const PLACE = "place-1";

let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

function addUser(id: string, level: TrustLevel, ageMs = 365 * DAY): Actor {
  sqlite
    .prepare(
      `INSERT INTO user (id, name, email, email_verified, created_at, updated_at, trust_level) VALUES (?, ?, ?, 1, ?, ?, ?)`,
    )
    .run(id, id, `${id}@example.com`, NOW - ageMs, NOW - ageMs, level);
  return { id, trustLevel: level, createdAt: NOW - ageMs, role: "user" };
}

function place() {
  return sqlite.prepare(`SELECT * FROM place WHERE id = ?`).get(PLACE) as {
    verification_state: string;
    iqamah_summary_json: string | null;
    last_verified_at: number | null;
  };
}

function fact(key: string) {
  return sqlite.prepare(`SELECT * FROM fact WHERE place_id = ? AND key = ?`).get(PLACE, key) as {
    id: string;
    state: string;
    current_candidate_id: string | null;
  };
}

function candidates(key: string) {
  return sqlite
    .prepare(
      `SELECT fact_candidate.* FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id WHERE fact.key = ? ORDER BY created_at`,
    )
    .all(key) as Array<{ id: string; value_json: string; status: string; effective_to: string | null }>;
}

function propose(actor: Actor, key: string, value: unknown, now = NOW, effectiveFrom = "2026-09-27") {
  return submitValue(d1, { actor, placeId: PLACE, key, qualifier: "", value, effectiveFrom, source: "board", now });
}

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  sqlite
    .prepare(
      `INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
       VALUES (?, 'test-mosque', 'Test Mosque', 'mosque', 51.5, -0.1, 'gcpvj0', 'GB', 'london', 'Europe/London', 'MoonsightingCommittee', 'hanafi', 0, 0)`,
    )
    .run(PLACE);
});

describe("first values and verification", () => {
  it("shows a first value immediately as unverified, then verifies with a third L1 confirm", async () => {
    const a = addUser("a", 0);
    const first = await propose(a, "iqamah.asr", { t: "16:30" });
    expect(first.status).toBe("live");
    expect(first.state).toBe("unverified");
    const summary = parseSummary(place().iqamah_summary_json);
    expect(summary?.iqamah.asr?.v).toEqual({ t: "16:30" });
    expect(summary?.iqamah.asr?.n).toBe(1);

    const b = addUser("b", 0);
    const second = await castVote(d1, { actor: b, candidateId: first.candidateId, polarity: 1, source: "other", now: NOW });
    expect(second.state).toBe("unverified");

    const c = addUser("c", 1);
    const third = await castVote(d1, { actor: c, candidateId: first.candidateId, polarity: 1, source: "other", now: NOW });
    expect(third.state).toBe("verified");
    expect(parseSummary(place().iqamah_summary_json)?.iqamah.asr?.n).toBe(3);
    expect(place().verification_state).toBe("partial");
    expect(place().last_verified_at).toBe(NOW);

    const accepted = sqlite.prepare(`SELECT accepted_count FROM user WHERE id = 'c'`).get() as { accepted_count: number };
    expect(accepted.accepted_count).toBe(1);
  });

  it("treats a proposal equal to an open value as a confirmation", async () => {
    const a = addUser("a", 0);
    const b = addUser("b", 0);
    const first = await propose(a, "iqamah.fajr", { t: "05:45" });
    const again = await propose(b, "iqamah.fajr", { t: "05:45" });
    expect(again.candidateId).toBe(first.candidateId);
    expect(candidates("iqamah.fajr")).toHaveLength(1);
  });

  it("marks the place verified when all five iqamahs are verified", async () => {
    const users = [addUser("a", 1), addUser("b", 1), addUser("c", 1)];
    for (const prayer of ["fajr", "dhuhr", "asr", "maghrib", "isha"]) {
      for (const user of users) await propose(user, `iqamah.${prayer}`, { t: "12:00" });
    }
    expect(place().verification_state).toBe("verified");
  });
});

describe("disputes and replacement", () => {
  async function verifiedIsha() {
    const users = [addUser("v1", 1), addUser("v2", 1), addUser("v3", 1)];
    let id = "";
    for (const user of users) id = (await propose(user, "iqamah.isha", { t: "20:45" })).candidateId;
    expect(fact("iqamah.isha").state).toBe("verified");
    return id;
  }

  it("replaces a verified value after two trusted confirms and keeps history", async () => {
    const old = await verifiedIsha();
    const proposer = addUser("p", 1);
    const challenge = await propose(proposer, "iqamah.isha", { t: "20:30" }, NOW, "2026-09-28");
    expect(challenge.status).toBe("pending");
    expect(parseSummary(place().iqamah_summary_json)?.iqamah.isha?.c?.v).toEqual({ t: "20:30" });

    const t1 = addUser("t1", 2);
    const t2 = addUser("t2", 2);
    const firstTrusted = await castVote(d1, { actor: t1, candidateId: challenge.candidateId, polarity: 1, source: "board", now: NOW });
    expect(firstTrusted.state).toBe("disputed");
    expect(place().verification_state).toBe("needs_check");
    const secondTrusted = await castVote(d1, { actor: t2, candidateId: challenge.candidateId, polarity: 1, source: "board", now: NOW });
    expect(secondTrusted.status).toBe("live");
    expect(secondTrusted.outcome?.supersededId).toBe(old);

    const rows = candidates("iqamah.isha");
    expect(rows.find((row) => row.id === old)).toMatchObject({ status: "superseded", effective_to: "2026-09-27" });
    const summary = parseSummary(place().iqamah_summary_json);
    expect(summary?.iqamah.isha).toMatchObject({ v: { t: "20:30" }, from: "2026-09-28", prev: { t: "20:45" } });
    const log = sqlite.prepare(`SELECT action FROM audit_log WHERE action = 'promote'`).all();
    expect(log.length).toBeGreaterThanOrEqual(2);
  });

  it("withdraws a user's confirmation of sibling values", async () => {
    const old = await verifiedIsha();
    const proposer = addUser("p", 1);
    const challenge = await propose(proposer, "iqamah.isha", { t: "20:30" });
    const switcher = { id: "v1", trustLevel: 1 as const, createdAt: NOW - 365 * DAY, role: "user" };
    await castVote(d1, { actor: switcher, candidateId: challenge.candidateId, polarity: 1, source: "other", now: NOW });
    const votes = sqlite.prepare(`SELECT candidate_id FROM vote WHERE user_id = 'v1'`).all() as Array<{ candidate_id: string }>;
    expect(votes.map((vote) => vote.candidate_id)).toEqual([challenge.candidateId]);
    await castVote(d1, { actor: switcher, candidateId: old, polarity: 1, source: "other", now: NOW });
    const after = sqlite.prepare(`SELECT candidate_id FROM vote WHERE user_id = 'v1'`).all() as Array<{ candidate_id: string }>;
    expect(after.map((vote) => vote.candidate_id)).toEqual([old]);
  });

  it("records disputes against a value", async () => {
    const old = await verifiedIsha();
    const doubter = addUser("d", 0);
    const result = await castVote(d1, { actor: doubter, candidateId: old, polarity: -1, source: "observed", now: NOW });
    expect(result.status).toBe("live");
    const activity = sqlite.prepare(`SELECT type FROM activity WHERE actor_id = 'd'`).get() as { type: string };
    expect(activity.type).toBe("disputed");
  });

  it("refuses votes on closed values", async () => {
    await expect(castVote(d1, { actor: addUser("x", 0), candidateId: "missing", polarity: 1, source: "other", now: NOW })).rejects.toThrow(
      TrustError,
    );
    const old = await verifiedIsha();
    sqlite.prepare(`UPDATE fact_candidate SET status = 'superseded' WHERE id = ?`).run(old);
    await expect(castVote(d1, { actor: addUser("y", 0), candidateId: old, polarity: 1, source: "other", now: NOW })).rejects.toThrow(
      "no longer open",
    );
  });
});

describe("holds, moderation and revert", () => {
  async function verifiedAsr() {
    let id = "";
    for (const user of [addUser("v1", 1), addUser("v2", 1), addUser("v3", 1)]) {
      id = (await propose(user, "iqamah.asr", { t: "16:30" })).candidateId;
    }
    return id;
  }

  it("holds a level-0 change to a verified value until a moderator approves it, and reverts", async () => {
    const old = await verifiedAsr();
    const newbie = addUser("n", 0, 2 * DAY);
    const held = await propose(newbie, "iqamah.asr", { t: "16:45" });
    expect(held.status).toBe("held");
    expect(parseSummary(place().iqamah_summary_json)?.iqamah.asr?.v).toEqual({ t: "16:30" });
    const queue = sqlite.prepare(`SELECT id FROM held_item`).all() as Array<{ id: string }>;
    expect(queue.map((row) => row.id)).toEqual([held.candidateId]);

    addUser("mod", 3);
    const approved = await approveHeld(d1, { moderatorId: "mod", candidateId: held.candidateId, now: NOW });
    expect(approved.currentId).toBe(held.candidateId);
    expect(parseSummary(place().iqamah_summary_json)?.iqamah.asr?.v).toEqual({ t: "16:45" });
    await expect(approveHeld(d1, { moderatorId: "mod", candidateId: held.candidateId, now: NOW })).rejects.toThrow(TrustError);

    const audit = sqlite
      .prepare(`SELECT id FROM audit_log WHERE action = 'promote' AND actor_id = 'mod'`)
      .get() as { id: string };
    const reverted = await revertPromotion(d1, { moderatorId: "mod", auditId: audit.id, now: NOW });
    expect(reverted.currentId).toBe(old);
    expect(parseSummary(place().iqamah_summary_json)?.iqamah.asr?.v).toEqual({ t: "16:30" });
    const author = sqlite.prepare(`SELECT reputation, rejected_count FROM user WHERE id = 'n'`).get() as {
      reputation: number;
      rejected_count: number;
    };
    expect(author.rejected_count).toBe(1);
    expect(author.reputation).toBe(1 - 5);
    await expect(revertPromotion(d1, { moderatorId: "mod", auditId: audit.id, now: NOW })).rejects.toThrow("already reverted");
    await expect(revertPromotion(d1, { moderatorId: "mod", auditId: "nope", now: NOW })).rejects.toThrow(TrustError);
  });

  it("releases a hold when a trusted user confirms it", async () => {
    await verifiedAsr();
    const newbie = addUser("n", 0, 2 * DAY);
    const held = await propose(newbie, "iqamah.asr", { t: "16:45" });
    const selfVote = await castVote(d1, { actor: newbie, candidateId: held.candidateId, polarity: 1, source: "other", now: NOW });
    expect(selfVote.status).toBe("held");
    const trusted = addUser("t", 1);
    const released = await castVote(d1, { actor: trusted, candidateId: held.candidateId, polarity: 1, source: "other", now: NOW });
    expect(released.status).toBe("pending");
    expect(candidates("iqamah.asr").find((row) => row.id === held.candidateId)?.status).toBe("candidate");
  });

  it("releases undisputed holds after 48 hours and rejects on request", async () => {
    await verifiedAsr();
    const newbie = addUser("n", 0, 2 * DAY);
    const held = await propose(newbie, "iqamah.asr", { t: "16:45" });
    expect(await releaseDueHolds(d1, NOW + DAY)).toBe(0);
    expect(await releaseDueHolds(d1, NOW + HOLD_RELEASE_MS + 1)).toBe(1);
    expect(candidates("iqamah.asr").find((row) => row.id === held.candidateId)?.status).toBe("candidate");

    addUser("mod", 3);
    await rejectHeld(d1, { moderatorId: "mod", candidateId: held.candidateId, now: NOW });
    expect(candidates("iqamah.asr").find((row) => row.id === held.candidateId)?.status).toBe("rejected");
    await expect(propose(newbie, "iqamah.asr", { t: "16:45" })).rejects.toThrow("already rejected");
    const current = candidates("iqamah.asr").find((row) => row.status === "current");
    await expect(rejectHeld(d1, { moderatorId: "mod", candidateId: current?.id ?? "", now: NOW })).rejects.toThrow(TrustError);
  });

  it("keeps disputed holds waiting", async () => {
    await verifiedAsr();
    const held = await propose(addUser("n", 0, 2 * DAY), "iqamah.asr", { t: "16:45" });
    await castVote(d1, { actor: addUser("d", 0), candidateId: held.candidateId, polarity: -1, source: "other", now: NOW });
    expect(await releaseDueHolds(d1, NOW + HOLD_RELEASE_MS + 1)).toBe(0);
  });

  it("holds and flags bursts from new accounts", async () => {
    const first = await propose(addUser("seed", 1), "iqamah.fajr", { t: "05:45" });
    for (let index = 0; index < 11; index += 1) {
      await castVote(d1, {
        actor: addUser(`new${index}`, 0, 1000),
        candidateId: first.candidateId,
        polarity: -1,
        source: "other",
        now: NOW,
      });
    }
    expect(await newAccountBurst(d1, PLACE, NOW)).toBe(true);
    const burst = await propose(addUser("late", 0, 1000), "iqamah.dhuhr", { t: "13:30" });
    expect(burst.status).toBe("held");
    const report = sqlite.prepare(`SELECT reason FROM report`).get() as { reason: string };
    expect(report.reason).toBe("burst");
  });
});

describe("jumu'ah and nightly jobs", () => {
  it("summarises Jumu'ah jamā'ahs in order", async () => {
    const a = addUser("a", 1);
    await submitValue(d1, { actor: a, placeId: PLACE, key: "jumuah.jamaah", qualifier: "2", value: { t: "13:50" }, effectiveFrom: "2026-09-27", source: "board", now: NOW });
    await submitValue(d1, { actor: a, placeId: PLACE, key: "jumuah.jamaah", qualifier: "1", value: { t: "13:15", khutbah: "12:55", lang: ["en"] }, effectiveFrom: "2026-09-27", source: "board", now: NOW });
    const summary = parseSummary(place().iqamah_summary_json);
    expect(summary?.jumuah.map((entry) => entry.q)).toEqual(["1", "2"]);
    expect(place().verification_state).toBe("none");
  });

  it("finds facts to recompute and marks old values stale", async () => {
    const first = await propose(addUser("a", 1), "iqamah.fajr", { t: "05:45" });
    expect(await factsDueForRecompute(d1, NOW)).toEqual([]);
    const later = NOW + 61 * DAY;
    const due = await factsDueForRecompute(d1, later);
    expect(due).toEqual([first.factId]);
    const outcome = await recomputeFact(d1, first.factId, later);
    expect(outcome.state).toBe("stale");
    expect(place().verification_state).toBe("needs_check");
    await expect(recomputeFact(d1, "missing", NOW)).rejects.toThrow("not found");
  });

  it("matches the SQL trust update to trustLevelFor", async () => {
    const cases = [
      { id: "l0", accepted: 3, rejected: 0, age: 40 * DAY, override: null },
      { id: "l1", accepted: 5, rejected: 0, age: 8 * DAY, override: null },
      { id: "l1b", accepted: 60, rejected: 20, age: 40 * DAY, override: null },
      { id: "l2", accepted: 60, rejected: 1, age: 40 * DAY, override: null },
      { id: "o3", accepted: 0, rejected: 0, age: 0, override: 3 },
    ];
    for (const item of cases) {
      addUser(item.id, 0, item.age);
      sqlite
        .prepare(`UPDATE user SET accepted_count = ?, rejected_count = ?, trust_override = ? WHERE id = ?`)
        .run(item.accepted, item.rejected, item.override, item.id);
    }
    await nightlyTrustStatement(d1, NOW).run();
    for (const item of cases) {
      const row = sqlite.prepare(`SELECT trust_level FROM user WHERE id = ?`).get(item.id) as { trust_level: number };
      expect(row.trust_level).toBe(
        trustLevelFor({ accepted: item.accepted, rejected: item.rejected, accountAgeMs: item.age, override: item.override, emailVerified: true }),
      );
      expect(await refreshActorTrust(d1, item.id, NOW)).toBe(row.trust_level);
    }
    expect(await refreshActorTrust(d1, "nobody", NOW)).toBe(0);
  });
});

describe("vote results", () => {
  it("reports how many confirmations are still needed", async () => {
    const first = await propose(addUser("a", 0), "iqamah.asr", { t: "16:30" });
    expect(first).toMatchObject({ status: "live", needed: 2, key: "iqamah.asr", qualifier: "" });
    const second = await castVote(d1, { actor: addUser("b", 1), candidateId: first.candidateId, polarity: 1, source: "board", now: NOW });
    expect(second).toMatchObject({ status: "live", state: "verified", needed: 0 });
  });
});

describe("amenities", () => {
  it("keeps amenity_bits in step with current amenity values", async () => {
    const a = addUser("a", 1);
    await propose(a, "amenity.women_section", { v: true, note: "First floor" });
    await propose(a, "amenity.parking", { v: false });
    await propose(a, "amenity.step_free", { v: true });
    const bits = sqlite.prepare(`SELECT amenity_bits, iqamah_summary_json FROM place`).get() as { amenity_bits: number; iqamah_summary_json: string | null };
    expect(bits.amenity_bits).toBe(1 | 8);
    expect(bits.iqamah_summary_json).toBeNull();
  });
});

describe("community adhan settings", () => {
  it("copies the agreed method, Asr and adhan adjustments onto the place", async () => {
    const a = addUser("adhan-a", 2);
    await propose(a, "adhan.method", { v: "NorthAmerica" });
    await propose(a, "asr_madhab", { v: "shafi" });
    await propose(a, "adhan.fajr", { min: 15 });
    await propose(a, "adhan.isha", { t: "20:30" });
    const row = sqlite.prepare(`SELECT calc_method, asr_madhab, adhan_adjust_json FROM place WHERE id = ?`).get(PLACE) as Record<string, string>;
    expect(row.calc_method).toBe("NorthAmerica");
    expect(row.asr_madhab).toBe("shafi");
    expect(JSON.parse(row.adhan_adjust_json)).toEqual({ fajr: { min: 15 }, isha: { t: "20:30" } });
  });

  it("keeps the country default until someone sets one", async () => {
    const a = addUser("adhan-b", 2);
    await propose(a, "iqamah.asr", { t: "17:00" });
    const row = sqlite.prepare(`SELECT calc_method, asr_madhab, adhan_adjust_json FROM place WHERE id = ?`).get(PLACE) as Record<string, string | null>;
    expect(row).toEqual({ calc_method: "MoonsightingCommittee", asr_madhab: "hanafi", adhan_adjust_json: null });
  });
});
