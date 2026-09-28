import { notFound } from "next/navigation";
import { appEnv } from "@/lib/db/client";
import { placeBySlug } from "@/lib/db/queries";
import { phase2Enabled, phase3Enabled } from "@/lib/phase";
import { updateData } from "@/lib/places/mosque";
import { madhabOf } from "@/lib/places/present";
import { getPrayerDay } from "@/lib/prayer/times";
import { requireUser } from "@/lib/session";
import { placeFacts } from "@/lib/trust/read";

export async function loadUpdate(slug: string) {
  if (!(await phase2Enabled())) notFound();
  const place = await placeBySlug(slug);
  if (!place || place.status !== "active") notFound();
  const user = await requireUser(`/m/${place.slug}/update`);
  const day = getPrayerDay({
    lat: place.lat,
    lng: place.lng,
    timeZone: place.timezone,
    method: place.calcMethod,
    madhab: madhabOf(place.asrMadhab),
    highLat: place.highLatRule,
  });
  const facts = await placeFacts(appEnv().DB, place.id, day.date);
  return updateData({ place, facts, day, trustLevel: user.trustLevel, amenities: await phase3Enabled() });
}
