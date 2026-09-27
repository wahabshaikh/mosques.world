import { describe, expect, it } from "vitest";
import { avatarColor, initials, publicHandle } from "./people";

describe("people", () => {
  it("derives avatars and handles", () => {
    expect(avatarColor("abc")).toMatch(/^#[0-9A-F]{6}$/);
    expect(initials("Aisha Khan")).toBe("AK");
    expect(initials("@yusuf.r")).toBe("YR");
    expect(initials("hafsa")).toBe("HA");
    expect(initials("")).toBe("?");
    expect(publicHandle({ username: "aishak", deletedAt: null })).toBe("@aishak");
    expect(publicHandle({ username: "aishak", deletedAt: 1 })).toBe("former member");
    expect(publicHandle(null)).toBe("former member");
  });
});
