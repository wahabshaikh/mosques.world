import { describe, expect, it } from "vitest";
import { normalizeUsername, suggestUsernames, usernameProblem } from "./username";

describe("usernames", () => {
  it("normalises and validates", () => {
    expect(normalizeUsername(" @WahabShaikh ")).toBe("wahabshaikh");
    expect(usernameProblem("wahab.shaikh")).toBeNull();
    expect(usernameProblem("ab")).toMatch(/3–30/);
    expect(usernameProblem("Wahab")).toMatch(/lowercase/);
    expect(usernameProblem(".wahab")).toMatch(/Dots/);
    expect(usernameProblem("wa..hab")).toMatch(/Dots/);
    expect(usernameProblem("admin")).toMatch(/reserved/);
  });

  it("suggests valid names", () => {
    expect(suggestUsernames("Aisha Khan", "aisha@example.com")).toEqual(["aishakhan", "aisha.khan", "aishak"]);
    expect(suggestUsernames("Zoë", "")).toEqual(["zoe"]);
    expect(suggestUsernames("Al", "")).toEqual(["al.mw"]);
    expect(suggestUsernames("", "x@example.com")).toEqual([]);
  });
});
