import { describe, expect, it } from "vitest";
import type { DirectoryPlace } from "@/lib/db/queries";
import { asSort, madhabOf, readNow, sortCards, toCard } from "./present";

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
  verificationState: "none",
  lastVerifiedAt: null,
  iqamahSummaryJson: null,
  mergedIntoId: null,
  googlePlaceId: null,
  googleLatlngFetchedAt: null,
  createdBy: null,
  amenityBits: 0,
  accessNotes: null,
  adhanAdjustJson: null,
  wikidataId: null,
  enrichmentJson: null,
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
    expect(card.nextTime).toBe("12:57 PM");
    expect(card.monogram).toBe("EL");
    expect(card.photo).toBeNull();
    expect(card.tint).toMatch(/^#/);
    expect(madhabOf("hanafi")).toBe("hanafi");
    expect(madhabOf("other")).toBe("shafi");
  });

  it("shows a small Commons thumbnail only when photos are on", () => {
    const enriched = { ...place, enrichmentJson: JSON.stringify({ wikidata: "Q1", image: { thumb: "https://upload.wikimedia.org/x/thumb/a/b/A.jpg/960px-A.jpg" } }) };
    expect(toCard(enriched, new Date("2026-09-25T11:00:00Z"), { photos: true }).photo).toBe("https://upload.wikimedia.org/x/thumb/a/b/A.jpg/120px-A.jpg");
    expect(toCard(enriched, new Date("2026-09-25T11:00:00Z")).photo).toBeNull();
    expect(toCard(place, new Date("2026-09-25T11:00:00Z"), { photos: true }).photo).toBeNull();
  });

  it("reads a clock override only off production", () => {
    const fixed = readNow("2026-09-25T11:00:00Z", true);
    expect(fixed.toISOString()).toBe("2026-09-25T11:00:00.000Z");
    expect(readNow("not-a-date", true).getTime()).toBeGreaterThan(0);
    expect(readNow("2026-09-25T11:00:00Z", false).toISOString()).not.toBe("2026-09-25T11:00:00.000Z");
  });
});

describe("explore upgrades", () => {
  const summary = JSON.stringify({
    iqamah: {
      asr: { v: { t: "16:30" }, from: "2026-01-01", prev: null, s: "verified", n: 9, at: 1 },
      isha: { v: { t: "20:45" }, from: "2026-01-01", prev: null, s: "verified", n: 3, at: 1, c: { v: { t: "20:30" }, n: 2 } },
    },
    jumuah: [],
  });

  it("shows the next iqamah when known and flags reported changes", () => {
    const card = toCard({ ...place, iqamahSummaryJson: summary, verificationState: "partial" }, new Date("2026-09-25T14:00:00Z"));
    expect(card.nextLabel).toBe("Asr");
    expect(card.nextTime).toBe("4:30 PM");
    expect(card.nextKind).toBe("iqamah");
    expect(card.minutesUntil).toBe(90);
    expect(card.changeReported).toBe(true);
    expect(card.verifiers).toBe(9);
    expect(card.verification).toBe("partial");
    const adhan = toCard(place, new Date("2026-09-25T14:00:00Z"));
    expect(adhan.nextKind).toBe("adhan");
    expect(adhan.minutesUntil).toBeNull();
    expect(adhan.verification).toBe("none");
  });

  it("sorts by soonest iqamah, verification and distance", () => {
    const base = toCard(place, new Date("2026-09-25T14:00:00Z"));
    const cards = [
      { ...base, id: "far-verified", distanceKm: 5, verification: "verified" as const, verifiers: 3, minutesUntil: 30 },
      { ...base, id: "near-none", distanceKm: 1, verification: "none" as const, verifiers: 0, minutesUntil: null },
      { ...base, id: "mid-soon", distanceKm: 2, verification: "partial" as const, verifiers: 9, minutesUntil: 5 },
    ];
    expect(sortCards(cards, "distance").map((card) => card.id)).toEqual(["near-none", "mid-soon", "far-verified"]);
    expect(sortCards(cards, "iqamah").map((card) => card.id)).toEqual(["mid-soon", "far-verified", "near-none"]);
    expect(sortCards(cards, "verified").map((card) => card.id)).toEqual(["far-verified", "mid-soon", "near-none"]);
    expect(asSort("iqamah")).toBe("iqamah");
    expect(asSort("verified")).toBe("verified");
    expect(asSort(undefined)).toBe("distance");
  });
});
