import { describe, expect, it } from "vitest";
import type { FactView, FactValueView } from "@/lib/trust/read";
import { amenityRows, amenitySummary, cardTag, matchesNeeds, needMasks, parseNeeds } from "./amenities";

function fact(key: string, value: unknown, author = "@a"): FactView {
  const current: FactValueView = {
    candidateId: key,
    value,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    status: "current",
    score: 2,
    backers: 4,
    disputes: 0,
    lastConfirmedAt: 1,
    createdAt: 1,
    author,
  };
  return { factId: key, key, qualifier: "", state: "unverified", current, shown: current, challenger: null };
}

describe("amenities", () => {
  it("lists current amenities, available first", () => {
    const rows = amenityRows([
      fact("amenity.parking", { v: false }),
      fact("amenity.women_section", { v: true, note: "First floor" }),
      fact("amenity.step_free", { v: true }, "@mosques.world"),
      fact("amenity.toilets", { nope: 1 }),
      fact("iqamah.asr", { t: "16:30" }),
    ]);
    expect(rows.map((row) => row.key)).toEqual(["amenity.women_section", "amenity.step_free", "amenity.parking"]);
    expect(rows[0]).toMatchObject({ note: "First floor", confirms: 4, fromOsm: false });
    expect(rows[1]?.fromOsm).toBe(true);
    expect(amenitySummary(rows)).toEqual(["Women's section", "Step-free"]);
  });

  it("summarises wudhu areas", () => {
    const both = amenityRows([fact("amenity.wudhu_men", { v: true }), fact("amenity.wudhu_women", { v: true })]);
    expect(amenitySummary(both)).toEqual(["Wudhu for men & women"]);
    expect(amenitySummary(amenityRows([fact("amenity.wudhu_men", { v: true })]))).toEqual(["Wudhu for men"]);
    expect(amenitySummary(amenityRows([fact("amenity.wudhu_women", { v: true })]))).toEqual(["Wudhu for women"]);
  });

  it("parses and matches explore needs", () => {
    expect(parseNeeds("women_section,wudhu,bogus")).toEqual(["women_section", "wudhu"]);
    expect(parseNeeds(["step_free", "parking"])).toEqual(["step_free", "parking"]);
    expect(parseNeeds(undefined)).toEqual([]);
    expect(needMasks(["women_section", "wudhu", "step_free"])).toEqual({ all: 9, any: [6] });
    expect(needMasks(["nope" as never])).toEqual({ all: 0, any: [] });
    expect(matchesNeeds(1 | 4, ["women_section", "wudhu"])).toBe(true);
    expect(matchesNeeds(1, ["women_section", "wudhu"])).toBe(false);
    expect(cardTag(1 << 9)).toBe("Open for Fajr");
    expect(cardTag(0)).toBeNull();
  });
});
