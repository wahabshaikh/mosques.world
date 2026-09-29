import { beforeEach, describe, expect, it, vi } from "vitest";
import { bucketOf, clearFlagCache, flagDecision, flagEnabled, readFlag } from "./flags";

function kv(value: string | null) {
  return { get: vi.fn(async () => value) } as unknown as KVNamespace & { get: ReturnType<typeof vi.fn> };
}

describe("flags", () => {
  beforeEach(() => clearFlagCache());

  it("uses the configured environment rather than the request host for defaults", () => {
    expect(flagDecision(null, { environment: "local", bucketKey: "a" })).toBe(true);
    expect(flagDecision(null, { environment: "preview", bucketKey: "a" })).toBe(true);
    expect(flagDecision(null, { environment: "production", bucketKey: "a" })).toBe(false);
    expect(flagDecision(null, { bucketKey: "a" })).toBe(false);
  });

  it("honours on, off and percentages", () => {
    expect(flagDecision("on", { environment: "production", bucketKey: "a" })).toBe(true);
    expect(flagDecision("off", { environment: "preview", bucketKey: "a" })).toBe(false);
    expect(flagDecision("100", { environment: "production", bucketKey: "a" })).toBe(true);
    expect(flagDecision("0", { environment: "production", bucketKey: "a" })).toBe(false);
    expect(flagDecision("nonsense", { environment: "production", bucketKey: "a" })).toBe(false);
    expect(bucketOf("203.0.113.9")).toBe(bucketOf("203.0.113.9"));
    expect(bucketOf("x")).toBeLessThan(100);
  });

  it("caches KV reads for a minute", async () => {
    const store = kv("on");
    expect(await readFlag(store, "f", 0)).toBe("on");
    expect(await readFlag(store, "f", 30_000)).toBe("on");
    expect(store.get).toHaveBeenCalledTimes(1);
    await readFlag(store, "f", 61_000);
    expect(store.get).toHaveBeenCalledTimes(2);
    expect(await flagEnabled(store, "f", { environment: "production", bucketKey: "b" })).toBe(true);
  });

  it("survives KV errors and missing bindings", async () => {
    const broken = { get: vi.fn(async () => { throw new Error("down"); }) } as unknown as KVNamespace;
    expect(await readFlag(broken, "g", 0)).toBeNull();
    expect(await readFlag(undefined, "h", 0)).toBeNull();
  });
});
