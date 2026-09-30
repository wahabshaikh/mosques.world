import { describe, expect, it } from "vitest";
import { isNonProductionHost } from "./environment";

describe("isNonProductionHost", () => {
  it("treats local dev as non-production whatever the environment", () => {
    expect(isNonProductionHost("127.0.0.1", "production")).toBe(true);
    expect(isNonProductionHost("localhost", undefined)).toBe(true);
  });

  it("treats workers.dev as non-production only on a preview deployment", () => {
    expect(isNonProductionHost("pr-12-mosques-world.example.workers.dev", "preview")).toBe(true);
    // Production also answers on workers.dev Version URLs; those keep production behaviour.
    expect(isNonProductionHost("1a2b3c4d-mosques-world.example.workers.dev", "production")).toBe(false);
    expect(isNonProductionHost("mosques-world.example.workers.dev", undefined)).toBe(false);
  });

  it("never treats the public domain as non-production", () => {
    expect(isNonProductionHost("mosques.world", "preview")).toBe(false);
  });
});
