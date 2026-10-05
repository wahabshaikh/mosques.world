import type { DirectoryPlace } from "@/lib/db/queries";
import { madhabOf } from "@/lib/places/present";
import { getPrayerDay, parseAdhanAdjust } from "@/lib/prayer/times";
import { formatTime12, IQAMAH_PRAYERS } from "@/lib/trust/facts";
import { iqamahToday, parseSummary } from "@/lib/trust/summary";

/** Seven days of adhan and iqamah times per saved place, precomputed for offline use (spec P5). */

export type OfflineDay = {
  date: string;
  prayers: Array<{ key: string; label: string; adhan: string; iqamah: string | null }>;
};

export type OfflinePlace = { id: string; slug: string; name: string; locality: string | null; timezone: string; days: OfflineDay[] };

const LABELS: Record<string, string> = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

export function weekTimes(place: DirectoryPlace, now: Date, days = 7): OfflinePlace {
  const summary = parseSummary(place.iqamahSummaryJson);
  const out: OfflineDay[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const day = getPrayerDay({
      lat: place.lat,
      lng: place.lng,
      timeZone: place.timezone,
      method: place.calcMethod,
      madhab: madhabOf(place.asrMadhab),
      highLat: place.highLatRule,
      adjust: parseAdhanAdjust(place.adhanAdjustJson),
      now: new Date(now.getTime() + offset * 24 * 60 * 60 * 1000),
    });
    const iqamah = iqamahToday(summary, day);
    out.push({
      date: day.date,
      prayers: IQAMAH_PRAYERS.map((key) => {
        const adhan = day.rows.find((row) => row.key === key)?.adhan ?? "00:00";
        return {
          key,
          label: key === "dhuhr" && day.jumuah ? "Jumu'ah" : (LABELS[key] ?? key),
          adhan: formatTime12(adhan),
          iqamah: iqamah[key]?.label ?? null,
        };
      }),
    });
  }
  return { id: place.id, slug: place.slug, name: place.name, locality: place.locality, timezone: place.timezone, days: out };
}
