import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bucketOf, clearFlagCache, flagDecision, flagEnabled, readFlag } from "./flags";

function kv(value: string | null) {
  return { get: vi.fn(async () => value) } as unknown as KVNamespace & { get: ReturnType<typeof vi.fn> };
}

describe("flags", () => {
  beforeEach(() => clearFlagCache());

  afterEach(() => {
    delete (env as { ENVIRONMENT?: string }).ENVIRONMENT;
  });

  it("defaults on outside production and off in production", () => {
    (env as { ENVIRONMENT?: string }).ENVIRONMENT = "preview";
    expect(flagDecision(null, { host: "127.0.0.1", bucketKey: "a" })).toBe(true);
    expect(flagDecision(null, { host: "pr-1-mosques-world.x.workers.dev", bucketKey: "a" })).toBe(true);
    expect(flagDecision(null, { host: "mosques.world", bucketKey: "a" })).toBe(false);
    (env as { ENVIRONMENT?: string }).ENVIRONMENT = "production";
    expect(flagDecision(null, { host: "1a2b3c4d-mosques-world.x.workers.dev", bucketKey: "a" })).toBe(false);
  });

  it("honours on, off and percentages", () => {
    expect(flagDecision("on", { host: "mosques.world", bucketKey: "a" })).toBe(true);
    expect(flagDecision("off", { host: "localhost", bucketKey: "a" })).toBe(false);
    expect(flagDecision("100", { host: "mosques.world", bucketKey: "a" })).toBe(true);
    expect(flagDecision("0", { host: "mosques.world", bucketKey: "a" })).toBe(false);
    expect(flagDecision("nonsense", { host: "mosques.world", bucketKey: "a" })).toBe(false);
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
    expect(await flagEnabled(store, "f", { host: "mosques.world", bucketKey: "b" })).toBe(true);
  });

  it("survives KV errors and missing bindings", async () => {
    const broken = { get: vi.fn(async () => { throw new Error("down"); }) } as unknown as KVNamespace;
    expect(await readFlag(broken, "g", 0)).toBeNull();
    expect(await readFlag(undefined, "h", 0)).toBeNull();
  });
});
