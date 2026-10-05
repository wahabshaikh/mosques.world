import { isNonProductionHost } from "@/lib/environment";

export const PHASE2_FLAG = "phase2.contributions";
export const PHASE3_FLAG = "phase3.places";
export const PHASE4_FLAG = "phase4.profiles";
export const PHASE5_FLAG = "phase5.mobile";
export const PHASE6_FLAG = "phase6.stewards";
export const PHASE7_FLAG = "phase7.timetables";
export const PHASE8_FLAG = "phase8.global";
/** Free OpenStreetMap data: on-demand area fill from Overpass and Photon geocoding instead of Google. */
export const OSM_FLAG = "places.osm";
/** Free open-data enrichment: Wikidata matches, Wikimedia Commons photos and Wikipedia summaries. */
export const ENRICH_FLAG = "places.enrich";

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

/** For crons and queues, which have no request: whether all flags are on for the public site's host. */
export async function flagsOnForSite(env: { FLAGS?: KVNamespace; PUBLIC_BASE_URL?: string }, flags: string[]): Promise<boolean> {
  let host = "mosques.world";
  try {
    host = new URL(env.PUBLIC_BASE_URL ?? "https://mosques.world").hostname;
  } catch {
    // Keep the production default.
  }
  for (const flag of flags) {
    if (!(await flagEnabled(env.FLAGS, flag, { host, bucketKey: host }))) return false;
  }
  return true;
}

export const PHASE6_FLAGS = [PHASE2_FLAG, PHASE3_FLAG, PHASE4_FLAG, PHASE5_FLAG, PHASE6_FLAG];
export const PHASE7_FLAGS = [...PHASE6_FLAGS, PHASE7_FLAG];

/** Phase 8 (languages, public API, open data) builds on Phase 1 only (spec dependency map). */
export const PHASE8_FLAGS = [PHASE8_FLAG];
