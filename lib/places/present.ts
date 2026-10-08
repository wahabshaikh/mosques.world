import { formatHm, getPrayerDay, nextAdhanLabel, type AsrMadhab, parseAdhanAdjust } from "@/lib/prayer/times";
import { formatTime12, IQAMAH_PRAYERS, toMinutes } from "@/lib/trust/facts";
import { dateRange, parseTimetable, PROVIDER_LABELS, timetableOn, type Timetable } from "@/lib/sources/timetable";
import { hasOpenChange, nextJamaah, parseSummary } from "@/lib/trust/summary";
import { cardTag } from "./needs";
import { placeMonogram } from "./monogram";
import { commonsThumb, parseEnrichment } from "@/lib/enrich/wikidata";
import { coverTint } from "@/lib/utils";
import type { DirectoryPlace } from "@/lib/db/queries";
import type { ExplorePlace } from "@/components/mw/explore-view";

export function madhabOf(value: string): AsrMadhab {
  return value === "hanafi" ? "hanafi" : "shafi";
}

export function toCard(place: DirectoryPlace, now: Date, options: { photos?: boolean } = {}): ExplorePlace {
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
  const timetable = parseTimetable(place.timetableJson);
  // The mosque's own published timetable comes first, then the community's iqamah, then the calculated adhan.
  const own = nextFromTimetable(timetable, day.date, nowLocal, day.jumuah);
  const jamaah = summary ? nextJamaah(summary, day, nowLocal) : null;
  const nextAdhan = nextAdhanLabel(day);
  const adhan = { label: nextAdhan.label, time: formatTime12(nextAdhan.time) };
  const iqamah = jamaah?.kind === "iqamah" ? jamaah : null;
  const next = own ?? (iqamah ? { label: iqamah.label, time: formatTime12(iqamah.time), kind: "iqamah" as const, minutes: iqamah.minutes } : { ...adhan, kind: "adhan" as const, minutes: null });
  const timeSource: ExplorePlace["timeSource"] = own ? "mosque" : iqamah ? "community" : "calculated";
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
    nextKind: next.kind,
    minutesUntil: next.kind === "iqamah" && next.minutes !== null ? next.minutes - toMinutes(nowLocal) : null,
    timeSource,
    sourceLabel: own && timetable ? PROVIDER_LABELS[timetable.p] : null,
    verification: asVerification(place.verificationState),
    changeReported: hasOpenChange(summary),
    tag: cardTag(place.amenityBits),
    verifiers,
    tint: coverTint(place.id).bg,
    monogram: placeMonogram(place.name),
    photo: options.photos ? photoOf(place) : null,
  };
}

const PRAYER_LABELS = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" } as const;

/**
 * The next time from a mosque's own timetable: its next iqamah today (or its adhan where it publishes
 * no iqamah), else tomorrow's Fajr. Null when the timetable has nothing for today.
 */
export function nextFromTimetable(
  timetable: Timetable | null,
  date: string,
  nowLocal: string,
  jumuahToday: boolean,
): { label: string; time: string; kind: "iqamah" | "adhan"; minutes: number } | null {
  const today = timetableOn(timetable, date);
  if (!today) return null;
  const now = toMinutes(nowLocal);
  const options = IQAMAH_PRAYERS.flatMap((prayer) => {
    const friday = prayer === "dhuhr" && jumuahToday && today.j?.[0];
    const time = friday || today.i?.[prayer] || today.a?.[prayer];
    if (!time) return [];
    const kind = friday || today.i?.[prayer] ? ("iqamah" as const) : ("adhan" as const);
    return [{ label: friday ? "Jumu'ah" : PRAYER_LABELS[prayer], time, kind, minutes: toMinutes(time) }];
  });
  const upcoming = options.find((option) => option.minutes > now);
  if (upcoming) return { ...upcoming, time: formatTime12(upcoming.time) };
  const [, tomorrow = date] = dateRange(date, 2);
  const next = timetableOn(timetable, tomorrow);
  const fajr = next?.i?.fajr ?? next?.a?.fajr;
  if (!fajr) return null;
  return { label: "Fajr", time: formatTime12(fajr), kind: next?.i?.fajr ? "iqamah" : "adhan", minutes: toMinutes(fajr) + 1440 };
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
/** "Most verified": a mosque's own timetable ranks with community-verified times. */
function rankOf(card: ExplorePlace): number {
  return card.timeSource === "mosque" ? 0 : VERIFICATION_RANK[card.verification];
}

/** Card order for the explore sort menu; ties fall back to distance. */
export function sortCards(cards: ExplorePlace[], sort: ExploreSort): ExplorePlace[] {
  const distance = (card: ExplorePlace) => card.distanceKm ?? Infinity;
  const sorted = [...cards];
  if (sort === "iqamah") {
    sorted.sort((a, b) => (a.minutesUntil ?? Infinity) - (b.minutesUntil ?? Infinity) || distance(a) - distance(b));
  } else if (sort === "verified") {
    sorted.sort(
      (a, b) =>
        rankOf(a) - rankOf(b) || b.verifiers - a.verifiers || distance(a) - distance(b),
    );
  } else {
    sorted.sort((a, b) => distance(a) - distance(b));
  }
  return sorted;
}

/** A small free-licence thumbnail for list rows; the mosque page shows the credit. */
function photoOf(place: DirectoryPlace): string | null {
  const thumb = parseEnrichment(place.enrichmentJson)?.image?.thumb;
  return thumb ? commonsThumb(thumb, 120) : null;
}
