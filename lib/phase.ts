import { headers } from "next/headers";
import { appEnv } from "@/lib/db/client";
import { flagEnabled, PHASE2_FLAG } from "@/lib/flags";

function flagInput(source: Headers) {
  const host = (source.get("host") ?? "").split(":")[0] ?? "";
  return { host, bucketKey: source.get("cf-connecting-ip") ?? host };
}

/** Phase 2 (accounts and contributions) is dark-launched behind the `phase2.contributions` KV flag. */
export async function phase2Enabled(): Promise<boolean> {
  return flagEnabled(appEnv().FLAGS, PHASE2_FLAG, flagInput(new Headers(await headers())));
}

export async function phase2EnabledFor(request: Request): Promise<boolean> {
  return flagEnabled(appEnv().FLAGS, PHASE2_FLAG, flagInput(request.headers));
}
