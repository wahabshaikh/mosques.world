import { describe, expect, it } from "vitest";
import { canChangeUsername, exportableUser, firstIssue, onboardingInput, profileInput } from "./account";

describe("account inputs", () => {
  it("validates onboarding", () => {
    const ok = onboardingInput.safeParse({ username: "@Aisha.K", name: " Aisha ", acceptGuidelines: true, homeCountry: "gb", homeCityLabel: "" });
    expect(ok.success && ok.data).toEqual({ username: "aisha.k", name: "Aisha", acceptGuidelines: true, homeCountry: "GB", homeCityLabel: null });
    const noGuidelines = onboardingInput.safeParse({ username: "aisha", name: "A", acceptGuidelines: false });
    expect(noGuidelines.success).toBe(false);
    if (!noGuidelines.success) expect(firstIssue(noGuidelines.error)).toMatch(/guidelines/);
    const reserved = onboardingInput.safeParse({ username: "admin", name: "A", acceptGuidelines: true });
    if (!reserved.success) expect(firstIssue(reserved.error)).toMatch(/reserved/);
  });

  it("validates profile edits", () => {
    expect(profileInput.safeParse({ username: "aisha", name: "Aisha", bio: "x".repeat(281) }).success).toBe(false);
    const parsed = profileInput.safeParse({ username: "aisha", name: "Aisha", bio: "" });
    expect(parsed.success && parsed.data.bio).toBeNull();
  });

  it("limits username changes to once every 30 days", () => {
    const day = 24 * 60 * 60 * 1000;
    expect(canChangeUsername(null, 0)).toBe(true);
    expect(canChangeUsername(0, 29 * day)).toBe(false);
    expect(canChangeUsername(0, 30 * day)).toBe(true);
  });

  it("drops moderator-only fields from exports", () => {
    expect(exportableUser({ id: "u", banReason: "x", trustOverride: 3 })).toEqual({ id: "u" });
  });
});
