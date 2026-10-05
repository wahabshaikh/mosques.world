import { headers } from "next/headers";
import { appEnv } from "@/lib/db/client";
import { ENRICH_FLAG, flagEnabled, OSM_FLAG, PHASE2_FLAG, PHASE3_FLAG, PHASE4_FLAG, PHASE5_FLAG, PHASE6_FLAGS, PHASE7_FLAGS, PHASE8_FLAGS } from "@/lib/flags";

function flagInput(source: Headers) {
  const host = (source.get("host") ?? "").split(":")[0] ?? "";
  return { host, bucketKey: source.get("cf-connecting-ip") ?? host };
}

/** Free OSM data (area fill + Photon geocoding) builds on Phase 1 only, behind `places.osm`. */
export async function osmEnabled(): Promise<boolean> {
  return flagEnabled(appEnv().FLAGS, OSM_FLAG, flagInput(new Headers(await headers())));
}

/** Photos and summaries from Wikimedia (Commons, Wikipedia) on mosque pages and in the explore list. */
export async function enrichEnabled(): Promise<boolean> {
  return flagEnabled(appEnv().FLAGS, ENRICH_FLAG, flagInput(new Headers(await headers())));
}

export async function osmEnabledFor(request: Request): Promise<boolean> {
  return flagEnabled(appEnv().FLAGS, OSM_FLAG, flagInput(request.headers));
}

/** Phase 2 (accounts and contributions) is dark-launched behind the `phase2.contributions` KV flag. */
export async function phase2Enabled(): Promise<boolean> {
  return flagEnabled(appEnv().FLAGS, PHASE2_FLAG, flagInput(new Headers(await headers())));
}

export async function phase2EnabledFor(request: Request): Promise<boolean> {
  return flagEnabled(appEnv().FLAGS, PHASE2_FLAG, flagInput(request.headers));
}

/**
 * Phase 3 (amenities, added places, photos) sits behind `phase3.places`. It builds on accounts, so it
 * is only on when Phase 2 is on too.
 */
export async function phase3Enabled(): Promise<boolean> {
  const source = new Headers(await headers());
  const env = appEnv();
  return (await flagEnabled(env.FLAGS, PHASE2_FLAG, flagInput(source))) && flagEnabled(env.FLAGS, PHASE3_FLAG, flagInput(source));
}

export async function phase3EnabledFor(request: Request): Promise<boolean> {
  const env = appEnv();
  return (await flagEnabled(env.FLAGS, PHASE2_FLAG, flagInput(request.headers))) && flagEnabled(env.FLAGS, PHASE3_FLAG, flagInput(request.headers));
}

async function allOn(flags: string[], source: Headers): Promise<boolean> {
  const env = appEnv();
  for (const flag of flags) {
    if (!(await flagEnabled(env.FLAGS, flag, flagInput(source)))) return false;
  }
  return true;
}

/** Phase 4 (profiles, check-ins, saved places) sits behind `phase4.profiles` and needs Phases 2–3. */
export async function phase4Enabled(): Promise<boolean> {
  return allOn([PHASE2_FLAG, PHASE3_FLAG, PHASE4_FLAG], new Headers(await headers()));
}

export async function phase4EnabledFor(request: Request): Promise<boolean> {
  return allOn([PHASE2_FLAG, PHASE3_FLAG, PHASE4_FLAG], request.headers);
}

/** Phase 5 (PWA, "I'm here", quick verify) sits behind `phase5.mobile` and needs Phases 2–4. */
export async function phase5Enabled(): Promise<boolean> {
  return allOn([PHASE2_FLAG, PHASE3_FLAG, PHASE4_FLAG, PHASE5_FLAG], new Headers(await headers()));
}

export async function phase5EnabledFor(request: Request): Promise<boolean> {
  return allOn([PHASE2_FLAG, PHASE3_FLAG, PHASE4_FLAG, PHASE5_FLAG], request.headers);
}

const PHASE6 = PHASE6_FLAGS;

/** Phase 6 (stewards, notifications) sits behind `phase6.stewards` and needs Phases 2–5. */
export async function phase6Enabled(): Promise<boolean> {
  return allOn(PHASE6, new Headers(await headers()));
}

export async function phase6EnabledFor(request: Request): Promise<boolean> {
  return allOn(PHASE6, request.headers);
}

/** Phase 7 (timetables, special prayers, calendar feeds) sits behind `phase7.timetables` and needs Phases 2–6. */
export async function phase7Enabled(): Promise<boolean> {
  return allOn(PHASE7_FLAGS, new Headers(await headers()));
}

export async function phase7EnabledFor(request: Request): Promise<boolean> {
  return allOn(PHASE7_FLAGS, request.headers);
}

/** Phase 8 (languages, public read API, open data) sits behind `phase8.global`. */
export async function phase8Enabled(): Promise<boolean> {
  return allOn(PHASE8_FLAGS, new Headers(await headers()));
}

export async function phase8EnabledFor(request: Request): Promise<boolean> {
  return allOn(PHASE8_FLAGS, request.headers);
}
