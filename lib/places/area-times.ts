import tzLookup from "tz-lookup";
import { getPrayerDay } from "@/lib/prayer/times";
import { formatTime12 } from "@/lib/trust/facts";

export type AreaTimes = {
  timezone: string;
  method: string;
  rows: Array<{ key: string; label: string; time: string; next: boolean }>;
};

/**
 * Today's calculated adhan for a point on the map, for an area with no mosques listed yet: the visitor
 * still leaves knowing when to pray. Muslim World League with the standard Asr, labelled as such,
 * because without a mosque there is no local timetable to follow.
 */
export function areaTimes(lat: number, lng: number, now: Date): AreaTimes | null {
  let timezone: string;
  try {
    timezone = tzLookup(lat, lng);
  } catch {
    return null;
  }
  const day = getPrayerDay({ lat, lng, timeZone: timezone, method: "MuslimWorldLeague", madhab: "shafi", highLat: "twilightangle", now });
  return {
    timezone,
    method: "Muslim World League",
    rows: day.rows.filter((row) => row.key !== "sunrise").map((row) => ({ key: row.key, label: row.label, time: formatTime12(row.adhan), next: row.key === day.nextKey })),
  };
}
