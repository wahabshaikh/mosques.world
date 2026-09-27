import { isNonProductionHost } from "@/lib/places/present";

export const PHASE2_FLAG = "phase2.contributions";

const TTL_MS = 60_000;
const cache = new Map<string, { value: string | null; at: number }>();

/** Reads a KV flag ("on", "off" or a rollout percentage "0"–"100"), cached for 60s per isolate. */
export async function readFlag(kv: KVNamespace | undefined, name: string, now = Date.now()): Promise<string | null> {
  const hit = cache.get(name);
  if (hit && now - hit.at < TTL_MS) return hit.value;
  let value: string | null = null;
  try {
    value = kv ? await kv.get(name) : null;
  } catch {
    value = hit?.value ?? null;
  }
  cache.set(name, { value, at: now });
  return value;
}

export function clearFlagCache() {
  cache.clear();
}

export function bucketOf(key: string): number {
  let hash = 2166136261;
  for (const char of key) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % 100;
}

/**
 * Non-production hosts default to on so preview and local always exercise the newest phase.
 * Production defaults to off until the flag is set (dark launch, spec 2.10).
 */
export function flagDecision(value: string | null, input: { host: string; bucketKey: string }): boolean {
  if (value === null || value === "") return isNonProductionHost(input.host);
  if (value === "on") return true;
  if (value === "off") return false;
  const percent = Number(value);
  if (!Number.isFinite(percent)) return false;
  return bucketOf(input.bucketKey) < percent;
}

export async function flagEnabled(
  kv: KVNamespace | undefined,
  name: string,
  input: { host: string; bucketKey: string },
): Promise<boolean> {
  return flagDecision(await readFlag(kv, name), input);
}
