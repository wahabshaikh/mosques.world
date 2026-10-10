import { describe, expect, it } from "vitest";
import { getPrayerDay } from "@/lib/prayer/times";
import { hasOpenChange, iqamahToday, jumuahToday, nextIqamah, nextJamaah, parseSummary, relativeAge, shortAge, valueOn, type PlaceSummary } from "./summary";

const day = getPrayerDay({
  lat: 51.5173983,
  lng: -0.0653616,
  timeZone: "Europe/London",
  method: "MoonsightingCommittee",
  madhab: "hanafi",
  highLat: "twilightangle",
  now: new Date("2026-09-25T11:00:00Z"),
});

const summary: PlaceSummary = {
  iqamah: {
    fajr: { v: { t: "05:45" }, from: "2026-01-01", prev: null, s: "verified", n: 4, at: 1 },
    asr: { v: { t: "17:15" }, from: "2026-09-26", prev: { t: "17:00" }, s: "unverified", n: 1, at: 2 },
    maghrib: { v: { rule: "after_adhan", min: 5 }, from: "2026-01-01", prev: null, s: "verified", n: 3, at: 3 },
    isha: { v: { t: "20:45" }, from: "2026-01-01", prev: null, s: "verified", n: 3, at: 3, c: { v: { t: "20:30" }, n: 2 } },
    dhuhr: { v: { bad: true }, from: "2026-01-01", prev: null, s: "verified", n: 3, at: 3 },
  },
  jumuah: [
    { q: "2", v: { t: "13:50" }, from: "2026-01-01", prev: null, s: "unverified", n: 1, at: 1 },
    { q: "1", v: { t: "13:15" }, from: "2026-01-01", prev: null, s: "verified", n: 5, at: 1 },
    { q: "3", v: { nope: 1 }, from: "2026-01-01", prev: null, s: "unverified", n: 1, at: 1 },
  ],
};

describe("summary", () => {
  it("parses stored JSON defensively", () => {
    expect(parseSummary(null)).toBeNull();
    expect(parseSummary("{oops")).toBeNull();
    expect(parseSummary("{}")).toEqual({ iqamah: {}, jumuah: [] });
  });

  it("applies dated values only from their date", () => {
    const entry = summary.iqamah.asr;
    expect(entry && valueOn(entry, "2026-09-25")).toEqual({ t: "17:00" });
    expect(entry && valueOn(entry, "2026-09-26")).toEqual({ t: "17:15" });
  });

  it("resolves today's iqamahs including after-adhan rules and challengers", () => {
    const today = iqamahToday(summary, day);
    expect(today.fajr?.label).toBe("5:45 AM");
    expect(today.asr?.time).toBe("17:00");
    expect(today.maghrib?.time).toBe("19:00");
    expect(today.isha?.challenger).toBe("8:30 PM");
    expect(today.dhuhr).toBeUndefined();
    expect(iqamahToday(null, day)).toEqual({});
  });

  it("lists Jumu'ah jamā'ahs in order", () => {
    expect(jumuahToday(summary, day.date).map((item) => item.q)).toEqual(["1", "2"]);
    expect(jumuahToday(null, day.date)).toEqual([]);
  });

  it("finds the next congregation, falling back to adhan", () => {
    expect(nextJamaah(summary, day, "12:00")).toMatchObject({ label: "Jumu'ah", kind: "adhan" });
    expect(nextJamaah(summary, day, "16:00")).toMatchObject({ label: "Asr", time: "17:00", kind: "iqamah" });
    expect(nextJamaah(summary, day, "23:00")).toMatchObject({ label: "Fajr", time: "05:45", minutes: 345 + 1440 });
    expect(nextJamaah(null, day, "04:00")).toMatchObject({ label: "Fajr", kind: "adhan" });
  });

  it("finds the next iqamah, skipping prayers without one", () => {
    expect(nextIqamah(summary, day, "12:00")).toMatchObject({ label: "Asr", time: "17:00", kind: "iqamah" });
    expect(nextIqamah(summary, day, "23:00")).toMatchObject({ label: "Fajr", time: "05:45", minutes: 345 + 1440 });
    expect(nextIqamah(null, day, "04:00")).toBeNull();
    expect(nextIqamah({ iqamah: {}, jumuah: [] }, day, "04:00")).toBeNull();
  });

  it("detects reported changes", () => {
    expect(hasOpenChange(summary)).toBe(true);
    expect(hasOpenChange({ iqamah: {}, jumuah: [] })).toBe(false);
    expect(hasOpenChange({ iqamah: {}, jumuah: [{ ...summary.jumuah[0]!, c: { v: {}, n: 1 } }] })).toBe(true);
    expect(hasOpenChange(null)).toBe(false);
  });

  it("formats ages", () => {
    const now = 10 * 24 * 3_600_000;
    expect(relativeAge(null, now)).toBe("never");
    expect(relativeAge(now - 30_000, now)).toBe("just now");
    expect(relativeAge(now - 5 * 60_000, now)).toBe("5 minutes ago");
    expect(relativeAge(now - 3_600_000, now)).toBe("1 hour ago");
    expect(relativeAge(now - 5 * 3_600_000, now)).toBe("5 hours ago");
    expect(relativeAge(now - 24 * 3_600_000, now)).toBe("1 day ago");
    expect(relativeAge(now - 48 * 3_600_000, now)).toBe("2 days ago");
    expect(shortAge(null, now)).toBe("—");
    expect(shortAge(now - 30_000, now)).toBe("now");
    expect(shortAge(now - 18 * 60_000, now)).toBe("18m");
    expect(shortAge(now - 5 * 3_600_000, now)).toBe("5h");
    expect(shortAge(now - 48 * 3_600_000, now)).toBe("2d");
  });
});
