import { describe, expect, it, vi } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { chunk, isRecomputeMessage, nightly, recomputeFacts } from "./jobs";
import { submitValue } from "./trust/store";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 27, 2);

async function seeded() {
  const { d1, sqlite } = createTestD1();
  sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
    VALUES ('p', 'p', 'P', 'mosque', 0, 0, 's00000', 'GB', 'london', 'Europe/London', 'MuslimWorldLeague', 'shafi', 0, 0)`);
  sqlite.exec(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at, accepted_count) VALUES ('u', 'U', 'u@x', 1, 0, 0, 6)`);
  const result = await submitValue(d1, {
    actor: { id: "u", trustLevel: 1, createdAt: 0, role: "user" },
    placeId: "p",
    key: "iqamah.fajr",
    qualifier: "",
    value: { t: "05:45" },
    effectiveFrom: "2026-01-01",
    source: "board",
    now: NOW - 70 * DAY,
  });
  return { d1, sqlite, factId: result.factId };
}

describe("jobs", () => {
  it("validates queue messages and chunks", () => {
    expect(isRecomputeMessage({ kind: "facts", ids: ["a"] })).toBe(true);
    expect(isRecomputeMessage({ kind: "facts", ids: [1] })).toBe(false);
    expect(isRecomputeMessage({ to: "x" })).toBe(false);
    expect(isRecomputeMessage(null)).toBe(false);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("queues stale facts in chunks and updates trust levels", async () => {
    const { d1, sqlite, factId } = await seeded();
    const sendBatch = vi.fn(async () => undefined);
    const result = await nightly({ DB: d1, Q_RECOMPUTE: { sendBatch } as unknown as Queue }, NOW);
    expect(result.queued).toBe(1);
    expect(sendBatch).toHaveBeenCalledWith([{ body: { kind: "facts", ids: [factId] } }]);
    expect(sqlite.prepare(`SELECT trust_level FROM user`).get()).toEqual({ trust_level: 1 });
    await recomputeFacts(d1, [factId, "gone"], NOW);
    expect(sqlite.prepare(`SELECT state FROM fact`).get()).toEqual({ state: "stale" });
  });

  it("recomputes a small slice inline without a queue", async () => {
    const { d1, sqlite } = await seeded();
    await nightly({ DB: d1 }, NOW);
    expect(sqlite.prepare(`SELECT state FROM fact`).get()).toEqual({ state: "stale" });
  });
});
