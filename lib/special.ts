import { z } from "zod";
import { bboxAround, haversineKm } from "@/lib/geo/distance";
import { ulid } from "@/lib/id";
import { formatTime12 } from "@/lib/trust/facts";

/**
 * Special prayers (spec P7): Eid al-Fitr / al-Adha with several jamā'ahs and a location, and nightly
 * Taraweeh / Tahajjud over a range of dates. Contributors (level 1+) and stewards add them.
 */

export const SPECIAL_KINDS = ["eid_fitr", "eid_adha", "taraweeh", "tahajjud"] as const;
export type SpecialKind = (typeof SPECIAL_KINDS)[number];
export const SPECIAL_LABELS: Record<SpecialKind | "janazah", string> = {
  eid_fitr: "Eid al-Fitr",
  eid_adha: "Eid al-Adha",
  taraweeh: "Taraweeh",
  tahajjud: "Tahajjud",
  janazah: "Janazah",
};

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const specialInput = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["eid_fitr", "eid_adha"]),
    date: day,
    jamaahs: z
      .array(z.object({ time: hm, location: z.string().trim().max(120).optional(), language: z.string().trim().max(40).optional() }))
      .min(1)
      .max(6),
    notes: z.string().trim().max(300).optional(),
  }),
  z
    .object({
      kind: z.enum(["taraweeh", "tahajjud"]),
      date: day,
      endDate: day,
      start: hm,
      rakahs: z.number().int().min(2).max(40).optional(),
      notes: z.string().trim().max(300).optional(),
    })
    .refine((value) => value.endDate >= value.date, { message: "The last night must be on or after the first." }),
]);
export type SpecialInput = z.infer<typeof specialInput>;

export type SpecialView = {
  id: string;
  kind: SpecialKind;
  label: string;
  date: string;
  endDate: string | null;
  lines: string[];
  notes: string | null;
  author: string | null;
  createdBy: string;
};

type Row = { id: string; kind: SpecialKind; date: string; end_date: string | null; times_json: string; notes: string | null; created_by: string; username: string | null };

export function describeSpecial(kind: SpecialKind, timesJson: string): string[] {
  try {
    const times = JSON.parse(timesJson) as unknown;
    if (Array.isArray(times)) {
      return times.map((item: { time: string; location?: string; language?: string }, index) =>
        [`${times.length > 1 ? `${index + 1}${["st", "nd", "rd"][index] ?? "th"} jamā'ah ` : ""}${formatTime12(item.time)}`, item.location, item.language].filter(Boolean).join(" · "),
      );
    }
    const nightly = times as { start: string; rakahs?: number };
    return [[`Starts ${formatTime12(nightly.start)}`, nightly.rakahs ? `${nightly.rakahs} rakʿahs` : null].filter(Boolean).join(" · ")];
  } catch {
    return [];
  }
}

function toView(row: Row): SpecialView {
  return {
    id: row.id,
    kind: row.kind,
    label: SPECIAL_LABELS[row.kind] ?? row.kind,
    date: row.date,
    endDate: row.end_date,
    lines: describeSpecial(row.kind, row.times_json),
    notes: row.notes,
    author: row.username,
    createdBy: row.created_by,
  };
}

export async function addSpecialPrayer(db: D1Database, input: { userId: string; placeId: string; prayer: SpecialInput; now: number }) {
  const { prayer } = input;
  const times =
    "jamaahs" in prayer
      ? prayer.jamaahs.map((item) => ({ time: item.time, ...(item.location ? { location: item.location } : {}), ...(item.language ? { language: item.language } : {}) }))
      : { start: prayer.start, ...(prayer.rakahs ? { rakahs: prayer.rakahs } : {}) };
  const id = ulid(input.now);
  await db.batch([
    // One entry per kind and first date: a newer one replaces it (the latest announcement wins).
    db
      .prepare(`UPDATE special_prayer SET status = 'replaced' WHERE place_id = ? AND kind = ? AND date = ? AND status = 'active'`)
      .bind(input.placeId, prayer.kind, prayer.date),
    db
      .prepare(
        `INSERT INTO special_prayer (id, place_id, kind, date, end_date, times_json, notes, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
      )
      .bind(id, input.placeId, prayer.kind, prayer.date, "endDate" in prayer ? prayer.endDate : null, JSON.stringify(times), prayer.notes || null, input.userId, input.now),
    db
      .prepare(`INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at) VALUES (?, ?, ?, 'special_added', ?, ?)`)
      .bind(ulid(input.now), input.userId, input.placeId, JSON.stringify({ kind: prayer.kind, date: prayer.date }), input.now),
  ]);
  return id;
}

export async function upcomingSpecial(db: D1Database, placeId: string, today: string, limit = 10): Promise<SpecialView[]> {
  const rows = await db
    .prepare(
      `SELECT special_prayer.*, user.username FROM special_prayer LEFT JOIN user ON user.id = special_prayer.created_by
       WHERE special_prayer.place_id = ? AND special_prayer.status = 'active' AND coalesce(special_prayer.end_date, special_prayer.date) >= ?
       ORDER BY special_prayer.date LIMIT ?`,
    )
    .bind(placeId, today, limit)
    .all<Row>();
  return (rows.results ?? []).map(toView);
}

export type NearbyEid = SpecialView & { placeSlug: string; placeName: string; locality: string | null; distanceKm: number };

/** "Eid prayers near you" (spec P7 seasonal explore): upcoming Eid jamā'ahs within `radiusKm`, nearest first. */
export async function eidNear(db: D1Database, input: { lat: number; lng: number; today: string; radiusKm?: number }): Promise<NearbyEid[]> {
  const radius = input.radiusKm ?? 30;
  const box = bboxAround(input.lat, input.lng, radius);
  const rows = await db
    .prepare(
      `SELECT special_prayer.*, user.username, place.slug, place.name AS place_name, place.locality, place.lat, place.lng
       FROM special_prayer JOIN place ON place.id = special_prayer.place_id LEFT JOIN user ON user.id = special_prayer.created_by
       WHERE special_prayer.kind IN ('eid_fitr', 'eid_adha') AND special_prayer.status = 'active' AND special_prayer.date >= ?
         AND place.status = 'active' AND place.lat BETWEEN ? AND ? AND place.lng BETWEEN ? AND ?
       ORDER BY special_prayer.date LIMIT 200`,
    )
    .bind(input.today, box.south, box.north, box.west, box.east)
    .all<Row & { slug: string; place_name: string; locality: string | null; lat: number; lng: number }>();
  return (rows.results ?? [])
    .map((row) => ({
      ...toView(row),
      placeSlug: row.slug,
      placeName: row.place_name,
      locality: row.locality,
      distanceKm: haversineKm(input.lat, input.lng, row.lat, row.lng),
    }))
    .filter((row) => row.distanceKm <= radius)
    .sort((a, b) => (a.date === b.date ? a.distanceKm - b.distanceKm : a.date < b.date ? -1 : 1))
    .slice(0, 50);
}

/** Whether Eid is close (last ten nights of Ramadan through the 3rd of Shawwal, or 1–13 Dhul Hijjah). */
export function eidSeason(now: Date, timeZone = "UTC"): boolean {
  try {
    const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { timeZone, month: "numeric", day: "numeric" }).formatToParts(now);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const dayOfMonth = Number(parts.find((part) => part.type === "day")?.value);
    return (month === 9 && dayOfMonth >= 20) || (month === 10 && dayOfMonth <= 3) || (month === 12 && dayOfMonth <= 13);
  } catch {
    return false;
  }
}

export function specialDates(view: Pick<SpecialView, "date" | "endDate">): string {
  const format = (value: string) => {
    const [year, month, dayOfMonth] = value.split("-").map(Number);
    return new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, dayOfMonth ?? 1)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  };
  return view.endDate && view.endDate !== view.date ? `${format(view.date)} – ${format(view.endDate)}` : format(view.date);
}
