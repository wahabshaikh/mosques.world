import { formatHm, getPrayerDay, nextAdhanLabel, type AsrMadhab, parseAdhanAdjust } from "@/lib/prayer/times";
import { formatTime12, toMinutes } from "@/lib/trust/facts";
import { hasOpenChange, nextJamaah, parseSummary } from "@/lib/trust/summary";
import { cardTag } from "./needs";
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
    adjust: parseAdhanAdjust(place.adhanAdjustJson),
    now,
  });
  const summary = parseSummary(place.iqamahSummaryJson);
  const nowLocal = formatHm(now, place.timezone);
  const jamaah = summary ? nextJamaah(summary, day, nowLocal) : null;
  const adhan = nextAdhanLabel(day);
  const iqamah = jamaah?.kind === "iqamah" ? jamaah : null;
  const next = iqamah ? { label: iqamah.label, time: formatTime12(iqamah.time) } : adhan;
  const verifiers = summary ? Math.max(0, ...Object.values(summary.iqamah).map((entry) => entry?.n ?? 0)) : 0;
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
    nextKind: iqamah ? "iqamah" : "adhan",
    minutesUntil: iqamah ? iqamah.minutes - toMinutes(nowLocal) : null,
    verification: asVerification(place.verificationState),
    changeReported: hasOpenChange(summary),
    tag: cardTag(place.amenityBits),
    verifiers,
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

export type ExploreSort = "distance" | "iqamah" | "verified";

export function asSort(value: string | undefined): ExploreSort {
  return value === "iqamah" || value === "verified" ? value : "distance";
}

function asVerification(value: string): ExplorePlace["verification"] {
  return value === "verified" || value === "partial" || value === "needs_check" ? value : "none";
}

const VERIFICATION_RANK: Record<ExplorePlace["verification"], number> = { verified: 0, partial: 1, needs_check: 2, none: 3 };

/** Card order for the explore sort menu; ties fall back to distance. */
export function sortCards(cards: ExplorePlace[], sort: ExploreSort): ExplorePlace[] {
  const distance = (card: ExplorePlace) => card.distanceKm ?? Infinity;
  const sorted = [...cards];
  if (sort === "iqamah") {
    sorted.sort((a, b) => (a.minutesUntil ?? Infinity) - (b.minutesUntil ?? Infinity) || distance(a) - distance(b));
  } else if (sort === "verified") {
    sorted.sort(
      (a, b) =>
        VERIFICATION_RANK[a.verification] - VERIFICATION_RANK[b.verification] || b.verifiers - a.verifiers || distance(a) - distance(b),
    );
  } else {
    sorted.sort((a, b) => distance(a) - distance(b));
  }
  return sorted;
}
