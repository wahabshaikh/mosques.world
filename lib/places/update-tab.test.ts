import { describe, expect, it } from "vitest";
import { tabFrom } from "./update-tab";

describe("update tab links", () => {
  it("opens the tab a link asks for, if it exists", () => {
    expect(tabFrom("adhan", false)).toBe("adhan");
    expect(tabFrom(["jumuah"], false)).toBe("jumuah");
    expect(tabFrom("amenities", true)).toBe("amenities");
    expect(tabFrom("amenities", false)).toBe("iqamah");
    expect(tabFrom(undefined, true)).toBe("iqamah");
  });
});
