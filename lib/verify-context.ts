import { placeById, type DirectoryPlace } from "@/lib/db/queries";
import { haversineKm } from "@/lib/geo/distance";
import { GEO_VERIFY_METRES } from "@/lib/checkins";
import { isNonProductionHost } from "@/lib/environment";
import { madhabOf, readNow } from "@/lib/places/present";
import { getPrayerDay, type PrayerDay } from "@/lib/prayer/times";

/** Loads a place for quick verify and checks the person is within 150 m of it right now. */
export async function presentAt(
  request: Request,
  placeId: string,
  location: { lat: number; lng: number },
): Promise<{ place: DirectoryPlace; day: PrayerDay; now: Date; distanceM: number } | { error: string; status: number }> {
  const place = await placeById(placeId);
  if (!place || place.status !== "active") return { error: "That place was not found.", status: 404 };
  const distanceM = Math.round(haversineKm(place.lat, place.lng, location.lat, location.lng) * 1000);
  if (distanceM > GEO_VERIFY_METRES) return { error: `You need to be within ${GEO_VERIFY_METRES} m of ${place.name} to verify it.`, status: 403 };
  const host = new URL(request.url).hostname;
  const now = readNow(request.headers.get("x-mw-now"), isNonProductionHost(host));
  const day = getPrayerDay({
    lat: place.lat,
    lng: place.lng,
    timeZone: place.timezone,
    method: place.calcMethod,
    madhab: madhabOf(place.asrMadhab),
    highLat: place.highLatRule,
    now,
  });
  return { place, day, now, distanceM };
}
