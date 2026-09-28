import { describe, expect, it } from "vitest";
import type { DirectoryPlace } from "@/lib/db/queries";
import { weekTimes } from "./offline";

const place = {
  id: "p1",
  slug: "elm",
  name: "East London Mosque",
  locality: "Whitechapel",
  lat: 51.5175,
  lng: -0.0653,
  timezone: "Europe/London",
  calcMethod: "MoonsightingCommittee",
  asrMadhab: "hanafi",
  highLatRule: "twilightangle",
  iqamahSummaryJson: JSON.stringify({ iqamah: { isha: { v: { t: "20:45" }, from: "2026-09-27", prev: { t: "21:00" }, s: "verified", n: 3, at: 1 } }, jumuah: [] }),
} as unknown as DirectoryPlace;

describe("weekTimes", () => {
  it("precomputes 7 days with iqamah where known and Jumu'ah on Fridays", () => {
    const week = weekTimes(place, new Date(Date.UTC(2026, 8, 24, 12)));
    expect(week.days.map((day) => day.date)).toEqual(["2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30"]);
    const isha = (index: number) => week.days[index]?.prayers.find((prayer) => prayer.key === "isha")?.iqamah;
    expect(isha(0)).toBe("9:00 PM");
    expect(isha(3)).toBe("8:45 PM");
    expect(week.days[1]?.prayers.find((prayer) => prayer.key === "dhuhr")?.label).toBe("Jumu'ah");
    expect(week.days[0]?.prayers.find((prayer) => prayer.key === "fajr")).toMatchObject({ iqamah: null, adhan: expect.stringMatching(/AM$/) });
  });
});
