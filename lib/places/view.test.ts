import { describe, expect, it } from "vitest";
import { ftsMatch, geocodeDecision, parseBbox, resolveExploreView } from "./view";

describe("explore view", () => {
  it("restores a URL view", () => {
    const view = resolveExploreView({
      where: "Istanbul",
      lat: "41.0082",
      lng: "28.9784",
      z: "11",
    });
    expect(view.where).toBe("Istanbul");
    expect(view.lat).toBeCloseTo(41.0082);
    expect(view.lng).toBeCloseTo(28.9784);
    expect(view.source).toBe("url");
    expect(view.zoom).toBe(11);
  });

  it("uses the IP header before the London default", () => {
    const view = resolveExploreView({ headerLat: "51.5", headerLng: "-0.1" });
    expect(view.source).toBe("ip");
    expect(view.where).toBe("Near you");
    expect(resolveExploreView({}).where).toBe("London");
  });

  it("parses bbox and kind filters", () => {
    expect(parseBbox("28.9,41.0,29.1,41.1")).toEqual({
      west: 28.9,
      south: 41,
      east: 29.1,
      north: 41.1,
    });
    expect(parseBbox("nope")).toBeNull();
    expect(resolveExploreView({ kind: "prayer_room" }).kind).toBe("prayer_room");
  });

  it("builds an FTS query and a geocode decision", () => {
    expect(ftsMatch("East London!")).toBe('"east"* "london"*');
    expect(ftsMatch("a")).toBe("");
    expect(geocodeDecision(3, false)).toBe("allow");
    expect(geocodeDecision(20, true)).toBe("challenge");
    expect(geocodeDecision(20, false)).toBe("block");
    expect(geocodeDecision(150, true, 200)).toBe("allow");
  });
});
