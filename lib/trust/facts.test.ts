import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  describeValue,
  factLabel,
  formatTime12,
  fromMinutes,
  isFactKey,
  languageName,
  ordinal,
  resolveIqamah,
  toMinutes,
  validateFactValue,
  valueHash,
} from "./facts";

describe("fact values", () => {
  it("validates iqamah values", () => {
    expect(validateFactValue("iqamah.asr", "", { t: "16:30" })).toEqual({ ok: true, value: { t: "16:30" } });
    expect(validateFactValue("iqamah.maghrib", "", { rule: "after_adhan", min: 5 }).ok).toBe(true);
    expect(validateFactValue("iqamah.asr", "", { t: "25:00" }).ok).toBe(false);
    expect(validateFactValue("iqamah.asr", "1", { t: "16:30" }).ok).toBe(false);
    expect(validateFactValue("iqamah.sunrise", "", { t: "06:00" }).ok).toBe(false);
  });

  it("validates Jumu'ah and madhab values", () => {
    expect(validateFactValue("jumuah.jamaah", "1", { t: "13:15", khutbah: "12:55", lang: ["en"] }).ok).toBe(true);
    expect(validateFactValue("jumuah.jamaah", "7", { t: "13:15" }).ok).toBe(false);
    expect(validateFactValue("jumuah.jamaah", "1", { t: "1pm" }).ok).toBe(false);
    expect(validateFactValue("asr_madhab", "", { v: "hanafi" }).ok).toBe(true);
    expect(validateFactValue("asr_madhab", "", { v: "maliki" }).ok).toBe(false);
    expect(isFactKey("amenity.parking")).toBe(true);
    expect(isFactKey("amenity.pool")).toBe(false);
  });

  it("hashes canonical JSON regardless of key order", async () => {
    expect(canonicalJson({ b: 1, a: [2, { d: undefined, c: "x" }] })).toBe('{"a":[2,{"c":"x"}],"b":1}');
    expect(await valueHash({ khutbah: "12:55", t: "13:15" })).toBe(await valueHash({ t: "13:15", khutbah: "12:55" }));
    expect(await valueHash({ t: "13:15" })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("formats and resolves times", () => {
    expect(toMinutes("16:30")).toBe(990);
    expect(fromMinutes(-5)).toBe("23:55");
    expect(formatTime12("00:05")).toBe("12:05 AM");
    expect(formatTime12("12:00")).toBe("12:00 PM");
    expect(formatTime12("16:30")).toBe("4:30 PM");
    expect(resolveIqamah({ t: "16:30" }, "16:12")).toBe("16:30");
    expect(resolveIqamah({ rule: "after_adhan", min: 5 }, "18:52")).toBe("18:57");
  });

  it("describes values and labels", () => {
    expect(describeValue("iqamah.asr", { t: "16:30" })).toBe("4:30 PM");
    expect(describeValue("iqamah.maghrib", { rule: "after_adhan", min: 5 })).toBe("5 min after adhan");
    expect(describeValue("iqamah.maghrib", { rule: "after_adhan", min: 0 })).toBe("at adhan");
    expect(describeValue("iqamah.maghrib", { nope: 1 })).toBe("—");
    expect(describeValue("jumuah.jamaah", { t: "13:15" })).toBe("1:15 PM");
    expect(describeValue("jumuah.jamaah", { t: "13:15", khutbah: "12:55" })).toBe("1:15 PM (khutbah 12:55 PM)");
    expect(describeValue("jumuah.jamaah", {})).toBe("—");
    expect(describeValue("asr_madhab", { v: "hanafi" })).toBe("Hanafi Asr");
    expect(describeValue("asr_madhab", { v: "shafi" })).toBe("Shafi'i Asr");
    expect(describeValue("asr_madhab", {})).toBe("—");
    expect(factLabel("iqamah.isha")).toBe("Isha");
    expect(factLabel("jumuah.jamaah", "2")).toBe("Jumu'ah 2nd jamā'ah");
    expect(factLabel("jumuah.jamaah", "")).toBe("Jumu'ah 1st jamā'ah");
    expect(factLabel("asr_madhab")).toBe("Asr calculation");
    expect(factLabel("other")).toBe("other");
    expect(ordinal(3)).toBe("3rd");
    expect(ordinal(4)).toBe("4th");
    expect(languageName("en")).toBe("English");
  });
});

describe("phase 3 fact keys", () => {
  it("validates amenity, info and closure values", async () => {
    const { validateFactValue, describeValue, factLabel, amenityBit, isAmenityKey } = await import("./facts");
    expect(validateFactValue("amenity.women_section", "", { v: true, note: "First floor" })).toEqual({ ok: true, value: { v: true, note: "First floor" } });
    expect(validateFactValue("amenity.women_section", "", { v: "yes" }).ok).toBe(false);
    expect(validateFactValue("info.phone", "", { v: "+44 20 7650 3000" }).ok).toBe(true);
    expect(validateFactValue("info.website", "", { v: "javascript:alert(1)" }).ok).toBe(false);
    expect(validateFactValue("info.languages", "", { v: ["en", "bn"] }).ok).toBe(true);
    expect(validateFactValue("status.closed", "", { v: true, reason: "Demolished" }).ok).toBe(true);
    expect(validateFactValue("status.closed", "", { v: 1 }).ok).toBe(false);
    expect(describeValue("amenity.parking", { v: false })).toBe("no");
    expect(describeValue("amenity.parking", {})).toBe("—");
    expect(describeValue("info.languages", { v: ["en"] })).toBe("English");
    expect(describeValue("info.phone", { v: "123" })).toBe("123");
    expect(describeValue("info.phone", null)).toBe("—");
    expect(factLabel("amenity.step_free")).toBe("Step-free access");
    expect(factLabel("status.closed")).toBe("Closed");
    expect(["info.phone", "info.website", "info.languages"].map((key) => factLabel(key))).toEqual(["Phone", "Website", "Languages"]);
    expect(amenityBit("amenity.step_free")).toBe(8);
    expect(amenityBit("nope")).toBe(0);
    expect(isAmenityKey("amenity.toilets")).toBe(true);
  });
});

describe("adhan facts", () => {
  it("validates, labels and describes the adhan method and per-prayer adjustments", async () => {
    const { validateFactValue: validate, describeValue: describe_, factLabel: label, methodLabel } = await import("./facts");
    expect(validate("adhan.method", "", { v: "NorthAmerica" })).toEqual({ ok: true, value: { v: "NorthAmerica" } });
    expect(validate("adhan.method", "", { v: "Made up" }).ok).toBe(false);
    expect(validate("adhan.fajr", "", { min: -10 })).toEqual({ ok: true, value: { min: -10 } });
    expect(validate("adhan.isha", "", { t: "20:30" }).ok).toBe(true);
    expect(validate("adhan.isha", "", { min: 200 }).ok).toBe(false);
    expect(validate("adhan.sunrise", "", { min: 1 }).ok).toBe(false);
    expect(describe_("adhan.method", { v: "Karachi" })).toBe("University of Islamic Sciences, Karachi");
    expect(describe_("adhan.fajr", { min: 15 })).toBe("15 min after the calculated time");
    expect(describe_("adhan.fajr", { min: -5 })).toBe("5 min before the calculated time");
    expect(describe_("adhan.fajr", { min: 0 })).toBe("as calculated");
    expect(describe_("adhan.isha", { t: "20:30" })).toBe("8:30 PM");
    expect(describe_("adhan.isha", { bad: 1 })).toBe("—");
    expect(describe_("adhan.method", { v: "x" })).toBe("—");
    expect(label("adhan.maghrib")).toBe("Maghrib adhan");
    expect(label("adhan.method")).toBe("Adhan calculation");
    expect(methodLabel("SomethingNew")).toBe("SomethingNew");
  });
});
