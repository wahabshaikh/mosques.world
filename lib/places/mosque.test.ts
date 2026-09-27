import { describe, expect, it } from "vitest";
import { getPrayerDay } from "@/lib/prayer/times";
import type { FactView, FactValueView } from "@/lib/trust/read";
import { iqamahCells, jumuahCards, localInstant, nextRows, statusFor, trustHeadline, updateData } from "./mosque";

const NOW = Date.parse("2026-09-25T11:00:00Z");
const day = getPrayerDay({
  lat: 51.5173983,
  lng: -0.0653616,
  timeZone: "Europe/London",
  method: "MoonsightingCommittee",
  madhab: "hanafi",
  highLat: "twilightangle",
  now: new Date(NOW),
});

function value(v: unknown, extra: Partial<FactValueView> = {}): FactValueView {
  return {
    candidateId: "c",
    value: v,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    status: "current",
    score: 3,
    backers: 3,
    disputes: 0,
    lastConfirmedAt: NOW - 2 * 86_400_000,
    createdAt: NOW - 5 * 86_400_000,
    author: "@a",
    ...extra,
  };
}

function fact(key: string, state: FactView["state"], v: unknown, extra: Partial<FactView> = {}): FactView {
  const current = value(v);
  return { factId: key, key, qualifier: "", state, current, shown: current, challenger: null, ...extra };
}

describe("mosque page presenter", () => {
  it("converts local times to instants", () => {
    expect(localInstant({ year: 2026, month: 9, day: 25 }, "16:30", "Europe/London")).toBe("2026-09-25T15:30:00.000Z");
  });

  it("builds iqamah cells with trust status", () => {
    const facts = [
      fact("iqamah.asr", "verified", { t: "17:00" }),
      fact("iqamah.maghrib", "verified", { rule: "after_adhan", min: 5 }),
      fact("iqamah.isha", "verified", { t: "20:45" }, { challenger: value({ t: "20:30" }, { status: "candidate", createdAt: NOW - 5 * 3_600_000 }) }),
      fact("iqamah.fajr", "unverified", { t: "05:45" }, { current: value({ t: "05:45" }, { backers: 1 }), shown: value({ t: "05:45" }, { backers: 1 }) }),
      fact("iqamah.dhuhr", "stale", { t: "13:30" }),
    ];
    const cells = iqamahCells(facts, day, NOW);
    expect(cells.asr).toMatchObject({ label: "5:00 PM", status: "Verified 2 days ago · 3 people", tone: "ok" });
    expect(cells.maghrib).toMatchObject({ label: "7:00 PM", status: "5 min after adhan · 3 people" });
    expect(cells.isha).toMatchObject({ status: "Change reported 5 hours ago", tone: "warning" });
    expect(cells.fajr?.status).toBe("Unverified · 1 person");
    expect(cells.dhuhr?.status).toMatch(/^Needs check/);
    expect(iqamahCells([fact("iqamah.asr", "verified", { bad: 1 })], day, NOW)).toEqual({});

    const next = nextRows(day, cells, facts, NOW);
    expect(next.find((row) => row.key === "asr")).toMatchObject({ iqamah: "5:00 PM", meta: "iqamah verified 2 days ago" });
    expect(next.find((row) => row.key === "fajr")?.meta).toBe("iqamah unverified");
  });

  it("covers disputed and after-adhan unverified states", () => {
    expect(statusFor(fact("iqamah.asr", "disputed", { t: "17:00" }), NOW)).toEqual({ status: "Change reported", tone: "warning" });
    expect(statusFor(fact("iqamah.maghrib", "unverified", { rule: "after_adhan", min: 5 }), NOW).status).toBe(
      "5 min after adhan · Unverified · 3 people",
    );
  });

  it("builds Jumu'ah cards", () => {
    const cards = jumuahCards([
      { ...fact("jumuah.jamaah", "unverified", { t: "13:50" }), qualifier: "2" },
      { ...fact("jumuah.jamaah", "verified", { t: "13:15", khutbah: "12:55", lang: ["en"] }), qualifier: "1" },
      { ...fact("jumuah.jamaah", "verified", { nope: 1 }), qualifier: "3" },
    ]);
    expect(cards.map((card) => card.overline)).toEqual(["1ST JAMĀ'AH", "2ND JAMĀ'AH"]);
    expect(cards[0]).toMatchObject({ time: "1:15 PM", detail: "Khutbah 12:55 PM · English", status: "Verified · 3 people" });
    expect(cards[1]?.detail).toBeNull();
  });

  it("names the trust state", () => {
    expect(trustHeadline("verified").title).toBe("Community verified");
    expect(trustHeadline("partial").tone).toBe("partial");
    expect(trustHeadline("needs_check").tone).toBe("needs_check");
    expect(trustHeadline("none").tone).toBe("none");
  });
});

describe("update dialog data", () => {
  it("carries current values and the date window", () => {
    const data = updateData({
      place: { id: "p", slug: "s", name: "Test" },
      facts: [fact("iqamah.asr", "verified", { t: "17:00" }), { ...fact("jumuah.jamaah", "unverified", { t: "13:15" }), qualifier: "1" }],
      day,
      trustLevel: 0,
    });
    expect(data.today).toBe("2026-09-25");
    expect(data.tomorrow).toBe("2026-09-26");
    expect(data.defaultFrom).toBe("2026-09-26");
    expect(updateData({ place: { id: "p", slug: "s", name: "T" }, facts: [], day, trustLevel: 0 }).defaultFrom).toBe("2026-09-25");
    expect(data.prayers.find((prayer) => prayer.key === "iqamah.asr")?.current).toMatchObject({ value: { t: "17:00" }, state: "verified" });
    expect(data.prayers.find((prayer) => prayer.key === "iqamah.fajr")?.current).toBeNull();
    expect(data.jumuah).toHaveLength(1);
    expect(data.dhuhrAdhan).toBe("12:57");
  });
});
