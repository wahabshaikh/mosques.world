import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { enrichCell, enrichStaleCells } from "@/lib/enrich/wikidata";
import { encodeGeohash } from "@/lib/geo/geohash";
import { apiModerator, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const input = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  limit: z.number().int().min(1).max(5).optional(),
});

/** Runs the Wikidata/Commons enrichment now: the area around a point, or the next few areas the nightly run would take. */
export async function POST(request: Request) {
  const guarded = await apiModerator(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return jsonError("Send a lat and lng, or nothing.", 400);
  const { lat, lng, limit } = parsed.data;
  const now = Date.now();
  if (lat !== undefined && lng !== undefined) {
    return Response.json({ results: [await enrichCell(appEnv().DB, encodeGeohash(lat, lng, 4), fetch, now)] });
  }
  return Response.json({ results: await enrichStaleCells(appEnv().DB, fetch, now, limit ?? 3) });
}
