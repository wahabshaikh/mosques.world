import { describe, expect, it } from "vitest";
import { bboxAround, formatDistance, haversineKm } from "./distance";
import { encodeGeohash } from "./geohash";

describe("geo", () => {
  it("encodes the standard geohash vector", () => {
    expect(encodeGeohash(57.64911, 10.40744, 11)).toBe("u4pruydqqvj");
    expect(encodeGeohash(51.5173983, -0.0653616, 6)).toHaveLength(6);
  });

  it("measures distance and builds a bbox", () => {
    const km = haversineKm(51.5173983, -0.0653616, 51.528953, -0.1648009);
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(10);
    const box = bboxAround(51.5, -0.12, 20);
    expect(box.south).toBeLessThan(51.5);
    expect(box.north).toBeGreaterThan(51.5);
    expect(formatDistance(0.4)).toBe("400 m");
    expect(formatDistance(3.25)).toBe("3.3 km");
    expect(formatDistance(18)).toBe("18 km");
  });
});
