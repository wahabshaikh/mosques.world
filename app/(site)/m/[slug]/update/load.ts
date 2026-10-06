import { notFound } from "next/navigation";
import { appEnv } from "@/lib/db/client";
import { placeBySlug } from "@/lib/db/queries";
import { updateData } from "@/lib/places/mosque";
import { madhabOf } from "@/lib/places/present";
import { getPrayerDay, parseAdhanAdjust } from "@/lib/prayer/times";
import { requireUser } from "@/lib/session";
import { placeFacts } from "@/lib/trust/read";

export async function loadUpdate(slug: string) {
  const place = await placeBySlug(slug);
  if (!place || place.status !== "active") notFound();
  const user = await requireUser(`/m/${place.slug}/update`);
  const base = {
    lat: place.lat,
    lng: place.lng,
    timeZone: place.timezone,
    method: place.calcMethod,
    madhab: madhabOf(place.asrMadhab),
    highLat: place.highLatRule,
  };
  const day = getPrayerDay({ ...base, adjust: parseAdhanAdjust(place.adhanAdjustJson) });
  // The unadjusted times, so the Adhan tab can show "calculated" and store the mosque's adhan relative to it.
  const calculated = getPrayerDay(base);
  const facts = await placeFacts(appEnv().DB, place.id, day.date);
  return updateData({ place: { ...place, method: place.calcMethod, madhab: madhabOf(place.asrMadhab) }, facts, day, calculated, trustLevel: user.trustLevel, amenities: true });
}
