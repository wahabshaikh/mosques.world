import { afterEach, describe, expect, it, vi } from "vitest";
import { cn, countryName, coverTint } from "./utils";

describe("utils", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("merges class names", () => {
    const hidden = false;
    expect(cn("px-2", "px-4", hidden && "hidden")).toBe("px-4");
  });

  it("picks a stable cover tint", () => {
    const first = coverTint("east-london-mosque");
    expect(coverTint("east-london-mosque")).toEqual(first);
    expect(first.bg).toMatch(/^#[0-9A-F]{6}$/i);
    expect(coverTint("")).toEqual(coverTint(""));
  });

  it("names countries and falls back when display names fail", () => {
    expect(countryName("gb")).toBe("United Kingdom");
    vi.spyOn(Intl, "DisplayNames").mockImplementation(() => {
      throw new Error("unavailable");
    });
    expect(countryName("gb")).toBe("GB");
  });
});
