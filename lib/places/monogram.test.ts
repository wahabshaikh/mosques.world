import { describe, expect, it } from "vitest";
import { placeMonogram } from "./monogram";

describe("placeMonogram", () => {
  it("skips words every mosque name shares", () => {
    expect(placeMonogram("Darul Ummah Mosque")).toBe("DU");
    expect(placeMonogram("The East London Mosque")).toBe("EL");
    expect(placeMonogram("Muslim Welfare House")).toBe("WH");
    expect(placeMonogram("Al-Risaalah Mosque & Islington Islamic Centre")).toBe("RI");
  });

  it("falls back to the words there are", () => {
    expect(placeMonogram("Masjid")).toBe("MA");
    expect(placeMonogram("Suleymaniye Mosque")).toBe("SU");
    expect(placeMonogram("")).toBe("?");
  });

  it("keeps non-Latin scripts", () => {
    expect(placeMonogram("مسجد النور")).toBe("ما");
    expect(placeMonogram("Çamlıca Camii")).toBe("CC");
  });
});
