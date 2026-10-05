import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from "adhan";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPrayerDay, nextAdhanLabel, parseAdhanAdjust, prayerLabel, type PrayerDay } from "./times";

const eastLondon = {
  lat: 51.5173983,
  lng: -0.0653616,
  timeZone: "Europe/London",
  method: "MoonsightingCommittee",
  madhab: "hanafi" as const,
  highLat: "twilightangle" as const,
};

describe("prayer times", () => {
  it("matches adhan-js for East London Mosque on a Friday", () => {
    const now = new Date("2026-09-25T11:00:00Z");
    const day = getPrayerDay({ ...eastLondon, now });
    const direct = new PrayerTimes(
      new Coordinates(eastLondon.lat, eastLondon.lng),
      new Date(2026, 8, 25, 12, 0, 0, 0),
      Object.assign(CalculationMethod.MoonsightingCommittee(), { madhab: Madhab.Hanafi }),
    );
    expect(day.jumuah).toBe(true);
    expect(day.rows.map((row) => row.adhan)).toEqual([
      "05:18",
      "06:51",
      "12:57",
      "16:55",
      "18:55",
      "20:09",
    ]);
    expect(day.rows.find((row) => row.key === "dhuhr")?.label).toBe("Jumu'ah");
    expect(day.nextKey).toBe("dhuhr");
    expect(day.rows[0]?.adhan).toBe(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(direct.fajr),
    );
  });

  it("shifts with the London DST change", () => {
    const before = getPrayerDay({ ...eastLondon, now: new Date("2026-03-28T12:00:00Z") });
    const after = getPrayerDay({ ...eastLondon, now: new Date("2026-03-29T12:00:00Z") });
    expect(before.rows.find((row) => row.key === "fajr")?.adhan).toBe("04:10");
    expect(after.rows.find((row) => row.key === "fajr")?.adhan).toBe("05:08");
    const beforeAutumn = getPrayerDay({ ...eastLondon, now: new Date("2026-10-24T12:00:00Z") });
    const afterAutumn = getPrayerDay({ ...eastLondon, now: new Date("2026-10-25T12:00:00Z") });
    expect(beforeAutumn.rows.find((row) => row.key === "dhuhr")?.adhan).toBe("12:49");
    expect(afterAutumn.rows.find((row) => row.key === "dhuhr")?.adhan).toBe("11:49");
  });

  it("returns a full day for Oslo in June", () => {
    const day = getPrayerDay({
      lat: 59.9139,
      lng: 10.7522,
      timeZone: "Europe/Oslo",
      method: "MuslimWorldLeague",
      madhab: "shafi",
      highLat: "middleofthenight",
      now: new Date("2026-06-21T10:00:00Z"),
    });
    expect(day.rows).toHaveLength(6);
    expect(day.rows.map((row) => row.key)).toEqual([
      "fajr",
      "sunrise",
      "dhuhr",
      "asr",
      "maghrib",
      "isha",
    ]);
    expect(day.rows.every((row) => /^\d{2}:\d{2}$/.test(row.adhan))).toBe(true);
  });

  it("covers Makkah, Jakarta and Toronto", () => {
    expect(
      getPrayerDay({
        lat: 21.4225,
        lng: 39.8262,
        timeZone: "Asia/Riyadh",
        method: "UmmAlQura",
        madhab: "shafi",
        highLat: "twilightangle",
        now: new Date("2026-09-26T06:00:00Z"),
      }).rows.map((row) => row.adhan),
    ).toEqual(["04:54", "06:10", "12:12", "15:36", "18:13", "19:43"]);
    expect(
      getPrayerDay({
        lat: -6.2,
        lng: 106.8,
        timeZone: "Asia/Jakarta",
        method: "Singapore",
        madhab: "shafi",
        highLat: "twilightangle",
        now: new Date("2026-09-26T02:00:00Z"),
      }).rows.map((row) => row.adhan),
    ).toEqual(["04:24", "05:41", "11:46", "14:54", "17:49", "18:58"]);
    expect(
      getPrayerDay({
        lat: 43.65,
        lng: -79.38,
        timeZone: "America/Toronto",
        method: "NorthAmerica",
        madhab: "shafi",
        highLat: "twilightangle",
        now: new Date("2026-09-26T15:00:00Z"),
      }).rows.map((row) => row.adhan),
    ).toEqual(["05:50", "07:09", "13:10", "16:28", "19:07", "20:26"]);
  });

  it("uses a later Asr for Hanafi than Shafi", () => {
    const base = {
      lat: 51.5,
      lng: -0.12,
      timeZone: "Europe/London",
      method: "MuslimWorldLeague",
      highLat: "twilightangle" as const,
      now: new Date("2026-06-21T12:00:00Z"),
    };
    const hanafi = getPrayerDay({ ...base, madhab: "hanafi" });
    const shafi = getPrayerDay({ ...base, madhab: "shafi" });
    expect(hanafi.rows.find((row) => row.key === "asr")?.adhan).toBe("18:40");
    expect(shafi.rows.find((row) => row.key === "asr")?.adhan).toBe("17:25");
  });

  it("labels prayers exhaustively", () => {
    expect(prayerLabel("fajr", false)).toBe("Fajr");
    expect(prayerLabel("sunrise", false)).toBe("Sunrise");
    expect(prayerLabel("dhuhr", false)).toBe("Dhuhr");
    expect(prayerLabel("dhuhr", true)).toBe("Jumu'ah");
    expect(prayerLabel("asr", false)).toBe("Asr");
    expect(prayerLabel("maghrib", false)).toBe("Maghrib");
    expect(prayerLabel("isha", false)).toBe("Isha");
  });

  it("falls back to Muslim World League for an unknown method", () => {
    const day = getPrayerDay({
      ...eastLondon,
      method: "NotARealMethod",
      now: new Date("2026-09-25T11:00:00Z"),
    });
    expect(day.rows).toHaveLength(6);
  });

  it("rolls the next prayer to tomorrow's Fajr after Isha", () => {
    const day = getPrayerDay({ ...eastLondon, now: new Date("2026-09-25T20:00:00Z") });
    expect(day.nextKey).toBe("fajr");
    expect(day.rows[0]?.label).toBe("Fajr");
    expect(day.rows[0]?.at.startsWith("2026-09-26")).toBe(true);
    expect(nextAdhanLabel(day).label).toBe("Fajr");
  });

  it("uses the seventh-of-the-night rule and a default clock", () => {
    const day = getPrayerDay({
      lat: 59.9139,
      lng: 10.7522,
      timeZone: "Europe/Oslo",
      method: "MuslimWorldLeague",
      madhab: "shafi",
      highLat: "seventhofthenight",
    });
    expect(day.rows).toHaveLength(6);
    expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back when a day has no rows and when Hijri is unavailable", () => {
    const day = getPrayerDay({ ...eastLondon, now: new Date("2026-09-25T11:00:00Z") });
    const empty: PrayerDay = { ...day, rows: [], nextKey: "asr" };
    expect(nextAdhanLabel(empty)).toEqual({ label: "Fajr", time: "" });
    expect(nextAdhanLabel(day)).toEqual({ label: "Jumu'ah", time: "12:57" });

    const Original = Intl.DateTimeFormat;
    vi.spyOn(Intl, "DateTimeFormat").mockImplementation((locales, options) => {
      if (options && "calendar" in options && options.calendar === "islamic-umalqura") {
        throw new RangeError("unsupported calendar");
      }
      return new Original(locales, options);
    });
    expect(getPrayerDay({ ...eastLondon, now: new Date("2026-09-25T11:00:00Z") }).hijri).toBe("");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("community adhan adjustments", () => {
  it("shifts by minutes, pins fixed times, and leaves the rest calculated", () => {
    const now = new Date("2026-09-25T11:00:00Z");
    const day = getPrayerDay({ ...eastLondon, now, adjust: { fajr: { min: 15 }, isha: { t: "20:30" }, dhuhr: { min: -5 } } });
    expect(day.rows.map((row) => row.adhan)).toEqual(["05:33", "06:51", "12:52", "16:55", "18:55", "20:30"]);
    expect(day.rows.find((row) => row.key === "isha")?.at).toBe("2026-09-25T19:30:00.000Z");
  });

  it("uses the adjusted times for the next prayer, including tomorrow's Fajr", () => {
    // 20:15 local: calculated Isha (20:09) has passed, the mosque's 20:30 Isha has not.
    const evening = new Date("2026-09-25T19:15:00Z");
    expect(getPrayerDay({ ...eastLondon, now: evening, adjust: { isha: { t: "20:30" } } }).nextKey).toBe("isha");
    const late = new Date("2026-09-25T21:00:00Z");
    const day = getPrayerDay({ ...eastLondon, now: late, adjust: { fajr: { min: 10 } } });
    expect(day.nextKey).toBe("fajr");
    // Tomorrow's calculated Fajr is 05:19.
    expect(day.rows[0]?.adhan).toBe("05:29");
  });

  it("parses stored adjustments defensively", () => {
    expect(parseAdhanAdjust(null)).toBeNull();
    expect(parseAdhanAdjust("not json")).toBeNull();
    expect(parseAdhanAdjust('{"fajr":{"min":500},"sunrise":{"min":3},"isha":{"t":"25:00"}}')).toBeNull();
    expect(parseAdhanAdjust('{"fajr":{"min":-10},"maghrib":{"t":"18:45"},"asr":{"min":1.5}}')).toEqual({ fajr: { min: -10 }, maghrib: { t: "18:45" } });
  });
});
