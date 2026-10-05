import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { isNonProductionHost } from "@/lib/environment";
import { fillArea } from "@/lib/osm-fill";
import { fixtureFetcher } from "@/lib/osm-fixture";
import { osmEnabledFor } from "@/lib/phase";
import { writeAllowed } from "@/lib/ratelimit";
import { jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const input = z.object({
  bbox: z
    .object({ west: z.number().min(-180).max(180), south: z.number().min(-90).max(90), east: z.number().min(-180).max(180), north: z.number().min(-90).max(90) })
    .refine((box) => box.south < box.north && box.west < box.east, "That map area is not valid."),
});

/**
 * Loads the mosques of a map area from OpenStreetMap the first time anyone looks at it. Public (the
 * explore page calls it for signed-out visitors), rate-limited per IP, and idempotent: cells already
 * filled or being filled by another request are skipped.
 */
export async function POST(request: Request) {
  if (!(await osmEnabledFor(request))) return jsonError("Not found", 404);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("That map area is not valid.", 400);
  const env = appEnv();
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  if (!(await writeAllowed(env.RL_WRITE, `fill:${ip}`))) return jsonError("Slow down a little and try again.", 429);
  // E2E runs where Overpass is unreachable answer from a fixture (never in production).
  const fixture =
    isNonProductionHost(new URL(request.url).hostname) &&
    (request.headers.get("x-mw-osm-fixture") === "1" || /(?:^|;\s*)mw_osm_fixture=1(?:;|$)/.test(request.headers.get("cookie") ?? ""));
  const { results, remaining, busy } = await fillArea(env, parsed.data.bbox, fixture ? fixtureFetcher() : fetch, Date.now());
  const failed = results.filter((result) => result.error);
  if (failed.length > 0) console.error(`Area fill failed for ${failed.map((result) => `${result.cell}: ${result.error}`).join("; ")}`);
  return Response.json({
    ok: failed.length === 0,
    inserted: results.reduce((sum, result) => sum + result.inserted, 0),
    busy: busy > 0,
    remaining,
  });
}
