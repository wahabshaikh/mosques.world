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

  it("uses the country's usual method when known", () => {
    const karachi = areaTimes(24.86, 67.0, new Date("2026-10-05T09:00:00Z"), { method: "Karachi", madhab: "hanafi" });
    const standard = areaTimes(24.86, 67.0, new Date("2026-10-05T09:00:00Z"));
    expect(karachi?.method).toBe("University of Islamic Sciences, Karachi, Hanafi Asr");
    expect(standard?.method).toBe("Muslim World League");
    expect(karachi?.rows.find((row) => row.key === "asr")?.time).not.toBe(standard?.rows.find((row) => row.key === "asr")?.time);
  });

  it("returns null where no timezone is known", () => {
    expect(areaTimes(Number.NaN, 0, new Date())).toBeNull();
  });
});
