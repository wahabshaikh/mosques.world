import { getPrayerDay, nextAdhanLabel, type AsrMadhab } from "@/lib/prayer/times";
import { coverTint } from "@/lib/utils";
import type { DirectoryPlace } from "@/lib/db/queries";
import type { ExplorePlace } from "@/components/mw/explore-view";

export function madhabOf(value: string): AsrMadhab {
  return value === "hanafi" ? "hanafi" : "shafi";
}

export function toCard(place: DirectoryPlace, now: Date): ExplorePlace {
  const day = getPrayerDay({
    lat: place.lat,
    lng: place.lng,
    timeZone: place.timezone,
    method: place.calcMethod,
    madhab: madhabOf(place.asrMadhab),
    highLat: place.highLatRule,
    now,
  });
  const next = nextAdhanLabel(day);
  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    locality: place.locality,
    kind: place.kind,
    lat: place.lat,
    lng: place.lng,
    distanceKm: place.distanceKm,
    nextLabel: next.label,
    nextTime: next.time,
    tint: coverTint(place.id).bg,
  };
}

export function readNow(headerValue: string | null, nonProduction: boolean): Date {
  if (nonProduction && headerValue) {
    const parsed = new Date(headerValue);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function isNonProductionHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".workers.dev");
}
