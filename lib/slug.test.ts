import { describe, expect, it } from "vitest";
import { placeSlug, slugify, uniqueSlug } from "./slug";

describe("slugs", () => {
  it("folds Turkish and punctuation", () => {
    expect(slugify("Süleymaniye Camii")).toBe("suleymaniye-camii");
    expect(slugify("İstanbul")).toBe("istanbul");
    expect(placeSlug("East London Mosque", "Whitechapel")).toBe("east-london-mosque-whitechapel");
  });

  it("suffixes collisions", () => {
    const taken = new Set(["east-london-mosque"]);
    expect(uniqueSlug("east-london-mosque", taken)).toBe("east-london-mosque-2");
    taken.add("east-london-mosque-2");
    expect(uniqueSlug("east-london-mosque", taken)).toBe("east-london-mosque-3");
  });
});
