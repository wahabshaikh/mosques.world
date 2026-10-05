import { describe, expect, it } from "vitest";
import { areaTimes } from "./area-times";

describe("areaTimes", () => {
  it("gives the five adhan times in the point's own timezone and marks the next one", () => {
    const times = areaTimes(40.6782, -73.9442, new Date("2026-10-05T19:00:00Z"));
    expect(times?.timezone).toBe("America/New_York");
    expect(times?.rows.map((row) => row.key)).toEqual(["fajr", "dhuhr", "asr", "maghrib", "isha"]);
    expect(times?.rows.every((row) => /^\d{1,2}:\d{2} (AM|PM)$/.test(row.time))).toBe(true);
    expect(times?.rows.filter((row) => row.next)).toHaveLength(1);
    expect(times?.rows.find((row) => row.next)?.key).toBe("asr");
  });

  it("returns null where no timezone is known", () => {
    expect(areaTimes(Number.NaN, 0, new Date())).toBeNull();
  });
});
