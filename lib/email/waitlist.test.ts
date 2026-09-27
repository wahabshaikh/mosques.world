import { describe, expect, it } from "vitest";
import { hashToken, newToken, normalizeEmail, waitlistMessage } from "./waitlist";

describe("waitlist", () => {
  it("hashes tokens and normalises email", async () => {
    const hash = await hashToken("abc");
    expect(hash).toHaveLength(64);
    expect(await hashToken("abc")).toBe(hash);
    expect(normalizeEmail("  Person@Example.com ")).toBe("person@example.com");
    expect(normalizeEmail("nope")).toBeNull();
    expect(normalizeEmail(`${"a".repeat(250)}@example.com`)).toBeNull();
    expect(newToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("includes the confirm link", () => {
    const message = waitlistMessage({
      placeName: "East London Mosque",
      confirmUrl: "https://mosques.world/waitlist/confirm?token=abc",
    });
    expect(message.subject).toContain("East London Mosque");
    expect(message.text).toContain("token=abc");
  });
});
