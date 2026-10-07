import { appEnv } from "@/lib/db/client";
import { placesInBbox } from "@/lib/db/queries";
import { bboxAround } from "@/lib/geo/distance";
import { apiError, guardKey, placeFeature } from "@/lib/public-api";

export const dynamic = "force-dynamic";

const MAX_SPAN = 2;

/** GET /api/v1/public/places?bbox=w,s,e,n | ?lat=&lng=&radius_km= — a GeoJSON FeatureCollection. */
export async function GET(request: Request) {
  const env = appEnv();
  const guarded = await guardKey(request, env);
  if ("response" in guarded) return guarded.response;
  const params = new URL(request.url).searchParams;
  const kind = params.get("kind");
  if (kind && kind !== "mosque" && kind !== "prayer_room") return apiError("`kind` is mosque or prayer_room.", 400, guarded.headers);
  const limit = Math.min(500, Math.max(1, Number(params.get("limit") ?? 100) || 100));
  let box: { west: number; south: number; east: number; north: number };
  let origin: { lat: number; lng: number };
  const bbox = params.get("bbox");
  if (bbox) {
    const [west, south, east, north] = bbox.split(",").map(Number);
    if (![west, south, east, north].every((value) => Number.isFinite(value)) || west! >= east! || south! >= north!) {
      return apiError("`bbox` is west,south,east,north in degrees.", 400, guarded.headers);
    }
    if (east! - west! > MAX_SPAN || north! - south! > MAX_SPAN) return apiError(`\`bbox\` can span at most ${MAX_SPAN}° each way.`, 400, guarded.headers);
    box = { west: west!, south: south!, east: east!, north: north! };
    origin = { lat: (south! + north!) / 2, lng: (west! + east!) / 2 };
  } else {
    const lat = Number(params.get("lat"));
    const lng = Number(params.get("lng"));
    const radius = Math.min(50, Math.max(0.1, Number(params.get("radius_km") ?? 5) || 5));
    if (!params.has("lat") || !params.has("lng") || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return apiError("Pass `bbox`, or `lat` and `lng` (with optional `radius_km`, up to 50).", 400, guarded.headers);
    }
    box = bboxAround(lat, lng, radius);
    origin = { lat, lng };
  }
  const base = new URL(request.url).origin;
  const places = (await placesInBbox(box, (kind as "mosque" | "prayer_room" | null) ?? "all", origin)).slice(0, limit);
  return Response.json(
    {
      type: "FeatureCollection",
      features: places.map((place) => ({ ...placeFeature(place, base), properties: { ...placeFeature(place, base).properties, distance_km: place.distanceKm } })),
      license: "ODbL-1.0",
      attribution: "© mosques.world contributors, © OpenStreetMap contributors",
    },
    { headers: guarded.headers },
  );
}

export function OPTIONS(request: Request) {
  return guardKey(request, appEnv()).then((guarded) => ("response" in guarded ? guarded.response : new Response(null, { status: 204 })));
}
