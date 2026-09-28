import { z } from "zod";
import { haversineKm } from "@/lib/geo/distance";
import { ulid } from "@/lib/id";
import type { PrayerDay } from "@/lib/prayer/times";
import { CHECKIN_PRAYER_LABELS, CHECKIN_PRAYERS, type CheckinPrayer } from "@/lib/checkin-options";

/** "I prayed here" (spec P4, flow F5). */

export { CHECKIN_PRAYER_LABELS, CHECKIN_PRAYERS, CHECKIN_VISIBILITIES, type CheckinPrayer, type CheckinVisibility } from "@/lib/checkin-options";

/** A shared location within this distance of the place marks the check-in as verified. */
export const GEO_VERIFY_METRES = 150;

export const checkinInput = z
  .object({
    placeId: z.string().min(1).max(64),
    prayer: z.enum(CHECKIN_PRAYERS),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
    location: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
  })
  .refine((value) => !(value.date && value.month), { message: "Pick a date or a month, not both." })
  .refine((value) => !(value.month && value.location), { message: "Location can only verify a check-in for today." });

export type CheckinInput = z.infer<typeof checkinInput>;

export class CheckinError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

const OBLIGATORY = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

/** The prayer whose window we are in (or most recently passed); Dhuhr on Fridays is Jumu'ah. */
export function defaultPrayer(day: PrayerDay, now: Date): CheckinPrayer {
  let current: CheckinPrayer = "isha";
  for (const row of day.rows) {
    if (!(OBLIGATORY as readonly string[]).includes(row.key)) continue;
    if (new Date(row.at).getTime() <= now.getTime()) current = row.key as CheckinPrayer;
  }
  return current === "dhuhr" && day.jumuah ? "jumuah" : current;
}

/** Validates the date part of a check-in against the place's local "today" (YYYY-MM-DD). */
export function checkinDate(input: Pick<CheckinInput, "date" | "month">, today: string): { localDate: string; backfill: boolean } {
  if (input.month) {
    if (input.month > today.slice(0, 7)) throw new CheckinError("That month hasn't happened yet.");
    if (input.month < "1950-01") throw new CheckinError("Pick a more recent month.");
    return { localDate: input.month, backfill: true };
  }
  const localDate = input.date ?? today;
  if (localDate > today) throw new CheckinError("That date hasn't happened yet.");
  if (localDate < "1950-01-01") throw new CheckinError("Pick a more recent date.");
  return { localDate, backfill: false };
}

/** Distance from the place in whole metres; the coordinates themselves are discarded. */
export function verifyDistance(place: { lat: number; lng: number }, location: { lat: number; lng: number }) {
  const distanceM = Math.round(haversineKm(place.lat, place.lng, location.lat, location.lng) * 1000);
  return { distanceM, geoVerified: distanceM <= GEO_VERIFY_METRES };
}

export type CreatedCheckin = { id: string; localDate: string; prayer: CheckinPrayer; geoVerified: boolean; distanceM: number | null; backfill: boolean };

export async function createCheckin(
  db: D1Database,
  input: {
    userId: string;
    place: { id: string; lat: number; lng: number };
    checkin: CheckinInput;
    today: string;
    publicActivity: boolean;
    now: number;
  },
): Promise<CreatedCheckin> {
  const { localDate, backfill } = checkinDate(input.checkin, input.today);
  const location = !backfill && localDate === input.today ? input.checkin.location : undefined;
  const verified = location ? verifyDistance(input.place, location) : null;
  const id = ulid(input.now);
  const statements = [
    db
      .prepare(
        `INSERT INTO checkin (id, user_id, place_id, prayer, local_date, geo_verified, distance_m, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, place_id, local_date, prayer) DO NOTHING`,
      )
      .bind(id, input.userId, input.place.id, input.checkin.prayer, localDate, verified?.geoVerified ? 1 : 0, verified?.distanceM ?? null, input.now),
  ];
  if (input.publicActivity && !backfill) {
    statements.push(
      db
        .prepare(
          `INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at)
           SELECT ?, ?, ?, 'prayed', ?, ? WHERE changes() > 0`,
        )
        .bind(ulid(input.now), input.userId, input.place.id, JSON.stringify({ prayer: input.checkin.prayer, checkinId: id }), input.now),
    );
  }
  const [inserted] = await db.batch(statements);
  if (!inserted?.meta.changes) {
    const label = CHECKIN_PRAYER_LABELS[input.checkin.prayer];
    throw new CheckinError(backfill ? `You already added ${label} here for that month.` : `You already checked in for ${label} here on that day.`, 409);
  }
  return { id, localDate, prayer: input.checkin.prayer, geoVerified: verified?.geoVerified ?? false, distanceM: verified?.distanceM ?? null, backfill };
}

/** Deletes one of the person's own check-ins (and its feed entry). Returns false when it isn't theirs. */
export async function deleteCheckin(db: D1Database, userId: string, id: string): Promise<boolean> {
  const [removed] = await db.batch([
    db.prepare(`DELETE FROM checkin WHERE id = ? AND user_id = ?`).bind(id, userId),
    db.prepare(`DELETE FROM activity WHERE actor_id = ? AND type = 'prayed' AND json_extract(payload_json, '$.checkinId') = ?`).bind(userId, id),
  ]);
  return Boolean(removed?.meta.changes);
}

export function checkinWhen(prayer: string, localDate: string, today: string): string {
  const label = CHECKIN_PRAYER_LABELS[prayer as CheckinPrayer] ?? "Prayed";
  if (localDate === today) return `${label} · Today`;
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1, day ?? 1));
  const monthYear = date.toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  return `${label} · ${monthYear}`;
}
