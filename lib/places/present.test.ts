import { describe, expect, it } from "vitest";
import type { DirectoryPlace } from "@/lib/db/queries";
import { isNonProductionHost, madhabOf, readNow, toCard } from "./present";

const place: DirectoryPlace = {
  id: "elm",
  slug: "east-london-mosque-whitechapel",
  name: "East London Mosque",
  nameLocal: null,
  kind: "mosque",
  status: "active",
  lat: 51.5173983,
  lng: -0.0653616,
  geohash6: "gcpvj0",
  address: null,
  locality: "Whitechapel",
  region: "London",
  countryCode: "GB",
  citySlug: "london",
  timezone: "Europe/London",
  calcMethod: "MoonsightingCommittee",
  asrMadhab: "hanafi",
  osmType: "node",
  osmId: 1,
  website: null,
  phone: null,
  wheelchair: null,
  createdAt: 0,
  updatedAt: 0,
  highLatRule: "twilightangle",
  distanceKm: 1.2,
};

describe("place cards", () => {
  it("maps a directory row to the next adhan", () => {
    const card = toCard(place, new Date("2026-09-25T11:00:00Z"));
    expect(card.slug).toBe(place.slug);
    expect(card.nextLabel).toBe("Jumu'ah");
    expect(card.nextTime).toBe("12:57");
    expect(card.tint).toMatch(/^#/);
    expect(madhabOf("hanafi")).toBe("hanafi");
    expect(madhabOf("other")).toBe("shafi");
  });

  it("reads a clock override only off production", () => {
    const fixed = readNow("2026-09-25T11:00:00Z", true);
    expect(fixed.toISOString()).toBe("2026-09-25T11:00:00.000Z");
    expect(readNow("not-a-date", true).getTime()).toBeGreaterThan(0);
    expect(readNow("2026-09-25T11:00:00Z", false).toISOString()).not.toBe("2026-09-25T11:00:00.000Z");
    expect(isNonProductionHost("127.0.0.1")).toBe(true);
    expect(isNonProductionHost("mosques-world.example.workers.dev")).toBe(true);
    expect(isNonProductionHost("mosques.world")).toBe(false);
  });
});
