import { appEnv } from "@/lib/db/client";
import { suggestPlaces } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const placeId = url.searchParams.get("placeId");
  const q = url.searchParams.get("q");
  const env = appEnv();
  if (placeId && env.GOOGLE_MAPS_API_KEY) {
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": env.GOOGLE_MAPS_API_KEY,
        "X-Goog-FieldMask": "id,location,displayName",
      },
    });
    if (response.ok) {
      const body = (await response.json()) as {
        displayName?: { text?: string };
        location?: { latitude?: number; longitude?: number };
      };
      return Response.json({
        label: body.displayName?.text ?? "",
        lat: body.location?.latitude ?? null,
        lng: body.location?.longitude ?? null,
      });
    }
  }
  const suggestions = await suggestPlaces(q ?? "");
  return Response.json(suggestions[0] ?? { label: q, lat: null, lng: null });
}
