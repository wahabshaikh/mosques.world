import { beforeEach, describe, expect, it } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import type { PrayerDay } from "@/lib/prayer/times";
import { checkinDate, checkinInput, CheckinError, checkinWhen, createCheckin, defaultPrayer, deleteCheckin, verifyDistance } from "./checkins";
import { asCheckinVisibility } from "./checkin-options";

const NOW = Date.UTC(2026, 8, 25, 12);
let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

const PLACE = { id: "p1", lat: 51.5175, lng: -0.0653 };

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  sqlite.prepare(`INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('u1', 'U', 'u@x', 1, 0, 0)`).run();
  sqlite
    .prepare(
      `INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
       VALUES ('p1', 'elm', 'East London Mosque', 'mosque', ?, ?, 'gcpvn0', 'GB', 'london', 'Europe/London', 'MuslimWorldLeague', 'shafi', 0, 0)`,
    )
    .run(PLACE.lat, PLACE.lng);
});

function day(jumuah: boolean): PrayerDay {
  const at = (hour: number) => new Date(Date.UTC(2026, 8, 25, hour)).toISOString();
  return {
    date: "2026-09-25",
    hijri: "",
    timezone: "UTC",
    jumuah,
    nextKey: "asr",
    rows: [
      { key: "fajr", label: "Fajr", adhan: "05:00", at: at(5) },
      { key: "sunrise", label: "Sunrise", adhan: "06:30", at: at(6) },
      { key: "dhuhr", label: "Dhuhr", adhan: "13:00", at: at(13) },
      { key: "asr", label: "Asr", adhan: "16:30", at: at(16) },
      { key: "maghrib", label: "Maghrib", adhan: "19:00", at: at(19) },
      { key: "isha", label: "Isha", adhan: "20:30", at: at(20) },
    ],
  };
}

describe("defaultPrayer", () => {
  it("picks the most recent prayer window, Jumu'ah on Fridays, and Isha before Fajr", () => {
    expect(defaultPrayer(day(false), new Date(Date.UTC(2026, 8, 25, 17)))).toBe("asr");
    expect(defaultPrayer(day(true), new Date(Date.UTC(2026, 8, 25, 14)))).toBe("jumuah");
    expect(defaultPrayer(day(false), new Date(Date.UTC(2026, 8, 25, 6)))).toBe("fajr");
    expect(defaultPrayer(day(false), new Date(Date.UTC(2026, 8, 25, 3)))).toBe("isha");
  });
});

describe("checkin input", () => {
  it("accepts a date or a month but not both, and location only for a date", () => {
    expect(checkinInput.safeParse({ placeId: "p1", prayer: "asr" }).success).toBe(true);
    expect(checkinInput.safeParse({ placeId: "p1", prayer: "asr", date: "2026-09-25", month: "2026-09" }).success).toBe(false);
    expect(checkinInput.safeParse({ placeId: "p1", prayer: "asr", month: "2026-09", location: { lat: 1, lng: 1 } }).success).toBe(false);
    expect(checkinInput.safeParse({ placeId: "p1", prayer: "brunch" }).success).toBe(false);
  });

  it("rejects future dates and far-past ones", () => {
    expect(checkinDate({}, "2026-09-25")).toEqual({ localDate: "2026-09-25", backfill: false });
    expect(checkinDate({ month: "2025-03" }, "2026-09-25")).toEqual({ localDate: "2025-03", backfill: true });
    expect(() => checkinDate({ date: "2026-09-26" }, "2026-09-25")).toThrow(CheckinError);
    expect(() => checkinDate({ month: "2026-10" }, "2026-09-25")).toThrow("hasn't happened");
    expect(() => checkinDate({ date: "1900-01-01" }, "2026-09-25")).toThrow("more recent");
    expect(() => checkinDate({ month: "1900-01" }, "2026-09-25")).toThrow("more recent");
  });

  it("maps visibility values", () => {
    expect(asCheckinVisibility("countries")).toBe("countries");
    expect(asCheckinVisibility("nonsense")).toBe("public");
  });
});

describe("verifyDistance", () => {
  it("verifies within 150 m and rounds to whole metres", () => {
    const near = verifyDistance(PLACE, { lat: PLACE.lat + 0.00054, lng: PLACE.lng });
    expect(near.distanceM).toBe(60);
    expect(near.geoVerified).toBe(true);
    expect(verifyDistance(PLACE, { lat: PLACE.lat + 0.002, lng: PLACE.lng }).geoVerified).toBe(false);
  });
});

describe("createCheckin", () => {
  const base = { userId: "u1", place: PLACE, today: "2026-09-25", publicActivity: true, now: NOW };

  it("stores geo_verified and the distance but never coordinates, plus a feed entry", async () => {
    const created = await createCheckin(d1, { ...base, checkin: { placeId: "p1", prayer: "asr", location: { lat: PLACE.lat + 0.00054, lng: PLACE.lng } } });
    expect(created).toMatchObject({ geoVerified: true, distanceM: 60, localDate: "2026-09-25", backfill: false });
    const row = sqlite.prepare(`SELECT * FROM checkin`).get() as Record<string, unknown>;
    expect(row).toMatchObject({ geo_verified: 1, distance_m: 60, prayer: "asr" });
    expect(Object.keys(row).some((column) => /lat|lng|lon/.test(column))).toBe(false);
    expect(sqlite.prepare(`SELECT type, json_extract(payload_json, '$.prayer') AS prayer FROM activity`).get()).toEqual({ type: "prayed", prayer: "asr" });
  });

  it("allows one check-in per place, date and prayer", async () => {
    await createCheckin(d1, { ...base, checkin: { placeId: "p1", prayer: "asr" } });
    await expect(createCheckin(d1, { ...base, checkin: { placeId: "p1", prayer: "asr" } })).rejects.toMatchObject({ status: 409 });
    await expect(createCheckin(d1, { ...base, checkin: { placeId: "p1", prayer: "asr", month: "2025-01" } })).resolves.toMatchObject({ backfill: true });
    await expect(createCheckin(d1, { ...base, checkin: { placeId: "p1", prayer: "asr", month: "2025-01" } })).rejects.toThrow("that month");
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM activity`).get()).toEqual({ n: 1 });
  });

  it("ignores location for past dates and skips the feed when check-ins are not public", async () => {
    const created = await createCheckin(d1, {
      ...base,
      publicActivity: false,
      checkin: { placeId: "p1", prayer: "fajr", date: "2026-09-01", location: { lat: PLACE.lat, lng: PLACE.lng } },
    });
    expect(created).toMatchObject({ geoVerified: false, distanceM: null });
    expect(sqlite.prepare(`SELECT COUNT(*) AS n FROM activity`).get()).toEqual({ n: 0 });
  });

  it("deletes only your own check-ins, with their feed entry", async () => {
    const created = await createCheckin(d1, { ...base, checkin: { placeId: "p1", prayer: "isha" } });
    expect(await deleteCheckin(d1, "someone-else", created.id)).toBe(false);
    expect(await deleteCheckin(d1, "u1", created.id)).toBe(true);
    expect(sqlite.prepare(`SELECT (SELECT COUNT(*) FROM checkin) AS c, (SELECT COUNT(*) FROM activity) AS a`).get()).toEqual({ c: 0, a: 0 });
  });
});

describe("checkinWhen", () => {
  it("labels today and older check-ins", () => {
    expect(checkinWhen("jumuah", "2026-09-25", "2026-09-25")).toBe("Jumu'ah · Today");
    expect(checkinWhen("fajr", "2025-03", "2026-09-25")).toBe("Fajr · Mar 2025");
    expect(checkinWhen("mystery", "2025-03-04", "2026-09-25")).toBe("Prayed · Mar 2025");
  });
});
