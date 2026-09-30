import { describe, expect, it } from "vitest";
import { isNonProductionHost, linkBase } from "./environment";

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

describe("linkBase", () => {
  it("links back to the Preview or local server that sent the email", () => {
    expect(linkBase("https://pr-3-mosques-world.x.workers.dev/api/v1/waitlist", "https://mosques.world", "preview")).toBe(
      "https://pr-3-mosques-world.x.workers.dev",
    );
    expect(linkBase("http://127.0.0.1:5173/api/v1/waitlist", "https://mosques.world", "production")).toBe("http://127.0.0.1:5173");
  });

  it("uses the public base URL in production, whatever host the request came in on", () => {
    expect(linkBase("https://1a2b-mosques-world.x.workers.dev/api", "https://mosques.world", "production")).toBe("https://mosques.world");
    expect(linkBase("https://mosques.world/api", undefined, "production")).toBe("https://mosques.world");
  });
});
