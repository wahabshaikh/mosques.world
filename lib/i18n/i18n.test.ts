import { describe, expect, it } from "vitest";
import { relativeAge } from "@/lib/trust/summary";
import { CLIENT_SOURCES, clientMessages } from "./client-messages";
import { direction, languageAlternates, localePath, LOCALES, negotiate, splitLocale } from "./config";
import { translator } from "./index";
import { en } from "./messages/en";

describe("locale routing", () => {
  it("splits a locale prefix off page paths only", () => {
    expect(splitLocale("/ar/m/markazi")).toEqual({ locale: "ar", path: "/m/markazi" });
    expect(splitLocale("/ur")).toEqual({ locale: "ur", path: "/" });
    expect(splitLocale("/en/m/x")).toEqual({ locale: "en", path: "/m/x" });
    expect(splitLocale("/m/markazi")).toBeNull();
    expect(splitLocale("/xx/m/markazi")).toBeNull();
    expect(splitLocale("/ar/api/v1/places")).toBeNull();
    expect(splitLocale("/ar/sw.js")).toBeNull();
  });

  it("keeps English unprefixed and builds hreflang alternates", () => {
    expect(localePath("en", "/m/x")).toBe("/m/x");
    expect(localePath("fr", "/")).toBe("/fr");
    expect(localePath("tr", "/api/v1/places")).toBe("/api/v1/places");
    const alternates = languageAlternates("/m/x");
    expect(alternates["x-default"]).toBe("/m/x");
    expect(alternates.ar).toBe("/ar/m/x");
    expect(Object.keys(alternates)).toHaveLength(LOCALES.length + 1);
  });

  it("negotiates Accept-Language with q-values", () => {
    expect(negotiate("ar-SA,ar;q=0.9,en;q=0.8")).toBe("ar");
    expect(negotiate("de-DE,fr;q=0.7,en;q=0.9")).toBe("en");
    expect(negotiate("de-DE,ms;q=0.5")).toBe("ms");
    expect(negotiate(null)).toBe("en");
  });

  it("marks Arabic and Urdu right-to-left", () => {
    expect(direction("ar")).toBe("rtl");
    expect(direction("ur")).toBe("rtl");
    expect(direction("fr")).toBe("ltr");
  });
});

describe("translator", () => {
  it("keeps English output identical to the pre-Phase 8 strings", () => {
    const l = translator("en");
    expect(l.time("19:24")).toBe("7:24 PM");
    expect(l.adhan("05:12")).toBe("05:12");
    expect(l.plural("status.people", 1)).toBe("1 person");
    expect(l.plural("status.people", 3)).toBe("3 people");
    expect(l.relative(1000, 1000 + 3 * 3_600_000)).toBe(relativeAge(1000, 1000 + 3 * 3_600_000));
    expect(l.prayer("dhuhr", true)).toBe("Jumu'ah");
  });

  it("uses Arabic prayer names, Arabic plural forms and 12h clock", () => {
    const l = translator("ar");
    expect(l.prayer("fajr")).toBe("الفجر");
    expect(l.prayer("dhuhr", true)).toBe("الجمعة");
    expect(l.plural("status.people", 2)).toBe("شخصان");
    expect(l.plural("status.people", 5)).toBe("5 أشخاص");
    expect(l.time("19:24")).toMatch(/^7:24\s?م$/);
  });

  it("uses a 24h clock where that's the local habit", () => {
    expect(translator("tr").time("19:24")).toBe("19:24");
    expect(translator("fr").time("07:05")).toBe("07:05");
    expect(translator("id").time("19:24")).toMatch(/^19[.:]24$/);
  });

  it("has every key in every catalog (typed) and fills placeholders", () => {
    for (const locale of LOCALES) {
      const l = translator(locale);
      for (const key of Object.keys(en) as Array<keyof typeof en>) {
        expect(l.t(key)).not.toBe("");
      }
      expect(l.t("mosque.addedBy", { user: "amina" })).toContain("amina");
    }
  });

  it("has a client string for every source in every language", () => {
    expect(clientMessages("en")).toBeNull();
    for (const locale of LOCALES.filter((item) => item !== "en")) {
      const messages = clientMessages(locale) ?? {};
      for (const source of CLIENT_SOURCES) expect(messages[source], `${locale}: ${source}`).toBeTruthy();
    }
  });
});
