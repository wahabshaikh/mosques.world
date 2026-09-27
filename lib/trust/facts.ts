import { z } from "zod";

export const IQAMAH_PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export type IqamahPrayer = (typeof IQAMAH_PRAYERS)[number];
export const IQAMAH_KEYS = IQAMAH_PRAYERS.map((prayer) => `iqamah.${prayer}` as const);
export type IqamahKey = (typeof IQAMAH_KEYS)[number];
export const JUMUAH_KEY = "jumuah.jamaah";
export const ASR_MADHAB_KEY = "asr_madhab";
export const FACT_KEYS = [...IQAMAH_KEYS, JUMUAH_KEY, ASR_MADHAB_KEY] as const;
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
