import { describe, expect, it } from "vitest";
import { encodeGeohash } from "@/lib/geo/geohash";
import { likelyDuplicates, nameSimilarity } from "./duplicates";

const at = (id: string, name: string, lat: number, lng: number) => ({ id, name, lat, lng, geohash6: encodeGeohash(lat, lng, 6) });

describe("likelyDuplicates", () => {
  it("pairs the same mosque mapped twice nearby, not neighbours with other names", () => {
    const pairs = likelyDuplicates([
      at("b-node", "East London Mosque", 51.51752, -0.0653),
      at("a-way", "The East London Mosque", 51.5176, -0.0652),
      at("c", "Markazi Mosque", 51.5175, -0.0654),
      at("d", "East London Mosque", 51.53, -0.0653),
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ aId: "a-way", bId: "b-node", similarity: 1 });
    expect(pairs[0]!.distanceM).toBeLessThan(20);
  });

  it("ignores words every mosque name shares", () => {
    expect(nameSimilarity("Masjid Al-Noor", "Noor Mosque")).toBe(1);
    expect(nameSimilarity("Jamia Masjid", "Central Mosque")).toBe(0);
  });
});
