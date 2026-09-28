import { z } from "zod";

export const IQAMAH_PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type IqamahPrayer = (typeof IQAMAH_PRAYERS)[number];
export const IQAMAH_KEYS = IQAMAH_PRAYERS.map((prayer) => `iqamah.${prayer}` as const);
export type IqamahKey = (typeof IQAMAH_KEYS)[number];
export const JUMUAH_KEY = "jumuah.jamaah";
export const ASR_MADHAB_KEY = "asr_madhab";
/** Amenity registry (spec 5.3). `bit` is the place.amenity_bits position; never reorder or reuse. */
export const AMENITIES = [
  { key: "amenity.women_section", slug: "women_section", label: "Women's section", bit: 0 },
  { key: "amenity.wudhu_men", slug: "wudhu_men", label: "Wudhu area — men", bit: 1 },
  { key: "amenity.wudhu_women", slug: "wudhu_women", label: "Wudhu area — women", bit: 2 },
  { key: "amenity.step_free", slug: "step_free", label: "Step-free access", bit: 3 },
  { key: "amenity.parking", slug: "parking", label: "Parking on site", bit: 4 },
  { key: "amenity.toilets", slug: "toilets", label: "Toilets", bit: 5 },
  { key: "amenity.classes", slug: "classes", label: "Qur'an & Arabic classes", bit: 6 },
  { key: "amenity.janazah", slug: "janazah", label: "Janazah service", bit: 7 },
  { key: "amenity.open_between_prayers", slug: "open_between_prayers", label: "Open between prayers", bit: 8 },
  { key: "amenity.open_for_fajr", slug: "open_for_fajr", label: "Open for Fajr", bit: 9 },
] as const;
export type AmenityKey = (typeof AMENITIES)[number]["key"];
export const AMENITY_KEYS = AMENITIES.map((amenity) => amenity.key);
export const INFO_KEYS = ["info.phone", "info.website", "info.languages"] as const;
export const CLOSED_KEY = "status.closed";

export const FACT_KEYS = [...IQAMAH_KEYS, JUMUAH_KEY, ASR_MADHAB_KEY, ...AMENITY_KEYS, ...INFO_KEYS, CLOSED_KEY] as const;

export function isAmenityKey(key: string): key is AmenityKey {
  return (AMENITY_KEYS as readonly string[]).includes(key);
}

export function amenityBit(key: string): number {
  const found = AMENITIES.find((amenity) => amenity.key === key);
  return found ? 1 << found.bit : 0;
}
export type FactKey = (typeof FACT_KEYS)[number];

export const VOTE_SOURCES = ["board", "announcement", "imam", "website", "observed", "other"] as const;
export type VoteSource = (typeof VOTE_SOURCES)[number];

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");

export const iqamahValue = z.union([
  z.object({ t: hm }).strict(),
  z.object({ rule: z.literal("after_adhan"), min: z.number().int().min(0).max(90) }).strict(),
]);
export type IqamahValue = z.infer<typeof iqamahValue>;

export const jumuahValue = z
  .object({
    t: hm,
    khutbah: hm.optional(),
    lang: z.array(z.string().regex(/^[a-z]{2,3}$/)).max(4).optional(),
  })
  .strict();
export type JumuahValue = z.infer<typeof jumuahValue>;

export const madhabValue = z.object({ v: z.enum(["shafi", "hanafi"]) }).strict();

export const amenityValue = z.object({ v: z.boolean(), note: z.string().trim().min(1).max(120).optional() }).strict();
export type AmenityValue = z.infer<typeof amenityValue>;

const infoValues = {
  "info.phone": z.object({ v: z.string().trim().regex(/^[+0-9 ()-]{5,24}$/) }).strict(),
  "info.website": z.object({ v: z.string().trim().url().max(200).regex(/^https?:\/\//) }).strict(),
  "info.languages": z.object({ v: z.array(z.string().regex(/^[a-z]{2,3}$/)).min(1).max(6) }).strict(),
} as const;

export const closedValue = z.object({ v: z.boolean(), reason: z.string().trim().max(200).optional() }).strict();

export function isFactKey(key: string): key is FactKey {
  return (FACT_KEYS as readonly string[]).includes(key);
}

export function validateFactValue(key: string, qualifier: string, value: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!isFactKey(key)) return { ok: false, error: "Unknown fact" };
  if (key === JUMUAH_KEY) {
    if (!/^[1-6]$/.test(qualifier)) return { ok: false, error: "Jumu'ah needs a jamā'ah number from 1 to 6" };
    const parsed = jumuahValue.safeParse(value);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "Enter a valid Jumu'ah time" };
  }
  if (qualifier !== "") return { ok: false, error: "This fact has no qualifier" };
  if (isAmenityKey(key)) {
    const parsed = amenityValue.safeParse(value);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "Choose yes or no" };
  }
  if (key === CLOSED_KEY) {
    const parsed = closedValue.safeParse(value);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "Not a valid closure" };
  }
  if (key in infoValues) {
    const parsed = infoValues[key as keyof typeof infoValues].safeParse(value);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "Not a valid value" };
  }
  const schema = key === ASR_MADHAB_KEY ? madhabValue : iqamahValue;
  const parsed = schema.safeParse(value);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "Enter a valid time" };
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function valueHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function toMinutes(time: string): number {
  const [hours = "0", minutes = "0"] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export function fromMinutes(total: number): string {
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

export function formatTime12(time: string): string {
  const total = toMinutes(time);
  const hours = Math.floor(total / 60);
  const minutes = String(total % 60).padStart(2, "0");
  const suffix = hours >= 12 ? "PM" : "AM";
  return `${hours % 12 || 12}:${minutes} ${suffix}`;
}

/** The local HH:MM an iqamah value resolves to, given that day's adhan. */
export function resolveIqamah(value: IqamahValue, adhan: string): string {
  return "t" in value ? value.t : fromMinutes(toMinutes(adhan) + value.min);
}

export function describeValue(key: string, value: unknown): string {
  if (isAmenityKey(key) || key === CLOSED_KEY) {
    const parsed = amenityValue.or(closedValue).safeParse(value);
    return parsed.success ? (parsed.data.v ? "yes" : "no") : "—";
  }
  if (key.startsWith("info.")) {
    const v = (value as { v?: unknown } | null)?.v;
    return Array.isArray(v) ? v.map((code) => languageName(String(code))).join(", ") : typeof v === "string" ? v : "—";
  }
  if (key === ASR_MADHAB_KEY) {
    const parsed = madhabValue.safeParse(value);
    return parsed.success ? (parsed.data.v === "hanafi" ? "Hanafi Asr" : "Shafi'i Asr") : "—";
  }
  if (key === JUMUAH_KEY) {
    const parsed = jumuahValue.safeParse(value);
    if (!parsed.success) return "—";
    return parsed.data.khutbah
      ? `${formatTime12(parsed.data.t)} (khutbah ${formatTime12(parsed.data.khutbah)})`
      : formatTime12(parsed.data.t);
  }
  const parsed = iqamahValue.safeParse(value);
  if (!parsed.success) return "—";
  if ("t" in parsed.data) return formatTime12(parsed.data.t);
  return parsed.data.min === 0 ? "at adhan" : `${parsed.data.min} min after adhan`;
}

export function factLabel(key: string, qualifier = ""): string {
  if (key.startsWith("iqamah.")) {
    const prayer = key.slice("iqamah.".length);
    return `${prayer.charAt(0).toUpperCase()}${prayer.slice(1)}`;
  }
  if (key === JUMUAH_KEY) return `Jumu'ah ${ordinal(Number(qualifier) || 1)} jamā'ah`;
  if (key === ASR_MADHAB_KEY) return "Asr calculation";
  const amenity = AMENITIES.find((item) => item.key === key);
  if (amenity) return amenity.label;
  if (key === CLOSED_KEY) return "Closed";
  if (key === "info.phone") return "Phone";
  if (key === "info.website") return "Website";
  if (key === "info.languages") return "Languages";
  return key;
}

export function ordinal(value: number): string {
  const suffix = value === 1 ? "st" : value === 2 ? "nd" : value === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}
