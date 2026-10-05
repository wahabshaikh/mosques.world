import tzLookup from "tz-lookup";
import { getPrayerDay } from "@/lib/prayer/times";
import { formatTime12, madhabLabel, methodLabel } from "@/lib/trust/facts";

export type AreaTimes = {
  timezone: string;
  method: string;
  rows: Array<{ key: string; label: string; time: string; next: boolean }>;
};

/**
 * Today's calculated adhan for a point on the map, for an area with no mosques listed yet: the visitor
 * still leaves knowing when to pray. Uses the country's usual method when we know the country (as the
 * OSM fill does for new places), else Muslim World League with the standard Asr; always labelled.
 */
export function areaTimes(lat: number, lng: number, now: Date, preset?: { method: string; madhab: string } | null): AreaTimes | null {
  let timezone: string;
  try {
    timezone = tzLookup(lat, lng);
  } catch {
    return null;
  }
  const method = preset?.method ?? "MuslimWorldLeague";
  const madhab = preset?.madhab === "hanafi" ? "hanafi" : "shafi";
  const day = getPrayerDay({ lat, lng, timeZone: timezone, method, madhab, highLat: "twilightangle", now });
  return {
    timezone,
    method: madhab === "hanafi" ? `${methodLabel(method)}, ${madhabLabel(madhab)} Asr` : methodLabel(method),
    rows: day.rows.filter((row) => row.key !== "sunrise").map((row) => ({ key: row.key, label: row.label, time: formatTime12(row.adhan), next: row.key === day.nextKey })),
  };
}
