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
    expect(isFactKey("amenity.parking")).toBe(false);
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
