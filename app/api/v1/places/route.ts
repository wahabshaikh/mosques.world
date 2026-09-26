import { placesInBbox } from "@/lib/db/queries";
import { getPrayerDay, nextAdhanLabel } from "@/lib/prayer/times";
import { madhabOf } from "@/lib/places/present";
import { parseBbox } from "@/lib/places/view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bbox = parseBbox(url.searchParams.get("bbox") ?? undefined);
  if (!bbox) return Response.json({ error: "bbox is required" }, { status: 400 });
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam === "mosque" || kindParam === "prayer_room" ? kindParam : "all";
  const origin = {
    lat: (bbox.south + bbox.north) / 2,
    lng: (bbox.west + bbox.east) / 2,
  };
  const places = await placesInBbox(bbox, kind, origin);
  const features = places.slice(0, 500).map((place) => {
    const day = getPrayerDay({
      lat: place.lat,
      lng: place.lng,
      timeZone: place.timezone,
      method: place.calcMethod,
      madhab: madhabOf(place.asrMadhab),
      highLat: place.highLatRule,
    });
    const next = nextAdhanLabel(day);
    return {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [place.lng, place.lat] },
      properties: {
        id: place.id,
        slug: place.slug,
        name: place.name,
        kind: place.kind,
        nextLabel: next.label,
        nextTime: next.time,
      },
    };
  });
  return Response.json(
    { type: "FeatureCollection", features },
    { headers: { "cache-control": "public, s-maxage=60" } },
  );
}
