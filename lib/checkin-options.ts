/** Check-in choices shared by the server and the "I prayed here" sheet (kept free of zod for the client bundle). */

export const CHECKIN_PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha", "jumuah", "eid", "taraweeh", "other"] as const;
export type CheckinPrayer = (typeof CHECKIN_PRAYERS)[number];

export const CHECKIN_PRAYER_LABELS: Record<CheckinPrayer, string> = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
  jumuah: "Jumu'ah",
  eid: "Eid",
  taraweeh: "Taraweeh",
  other: "Other",
};

export const CHECKIN_VISIBILITIES = ["public", "countries", "private"] as const;
export type CheckinVisibility = (typeof CHECKIN_VISIBILITIES)[number];

export function asCheckinVisibility(value: string): CheckinVisibility {
  return value === "countries" || value === "private" ? value : "public";
}
