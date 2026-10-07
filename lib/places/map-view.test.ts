import { describe, expect, it } from "vitest";
import { bboxParam, viewNeedsSearch } from "./map-view";

const searched = { west: -0.4, south: 51.3, east: 0.2, north: 51.7 };

describe("viewNeedsSearch", () => {
  it("skips a view inside the searched area (zooming in, small pans)", () => {
    expect(viewNeedsSearch({ west: -0.2, south: 51.45, east: 0, north: 51.55 }, searched, false)).toBe(false);
  });

  it("tolerates rounding at the edges", () => {
    expect(viewNeedsSearch({ west: -0.40001, south: 51.3, east: 0.2, north: 51.7 }, searched, false)).toBe(false);
  });

  it("asks when the view reaches outside the searched area", () => {
    expect(viewNeedsSearch({ west: 0.1, south: 51.45, east: 0.5, north: 51.55 }, searched, false)).toBe(true);
    expect(viewNeedsSearch({ west: -1, south: 51, east: 1, north: 52 }, searched, false)).toBe(true);
  });

  it("asks after any move when the search was capped", () => {
    expect(viewNeedsSearch({ west: -0.2, south: 51.45, east: 0, north: 51.55 }, searched, true)).toBe(true);
  });
});

describe("bboxParam", () => {
  it("rounds to four decimals in west,south,east,north order", () => {
    expect(bboxParam({ west: -0.123456, south: 51.000049, east: 0.5, north: 51.9 })).toBe("-0.1235,51.0000,0.5000,51.9000");
  });
});
