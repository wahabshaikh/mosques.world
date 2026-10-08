import { IQAMAH_PRAYERS, type IqamahPrayer } from "@/lib/trust/facts";

/**
 * A mosque's own published timetable (Mawaqit, Masjidal), as denormalised onto `place.timetable_json`.
 * These are the times the mosque itself announces, so they are shown apart from community-reported
 * iqamah and from the calculated adhan.
 */
export type TimetableProvider = "mawaqit" | "masjidal";

export type TimetableDay = {
  /** Adhan, HH:MM local. */
  a?: Partial<Record<IqamahPrayer, string>>;
  /** Iqamah, HH:MM local. */
  i?: Partial<Record<IqamahPrayer, string>>;
  /** Jumu'ah times, HH:MM local. */
  j?: string[];
};

export type Timetable = {
  p: TimetableProvider;
  url: string;
  /** When it was fetched (unix ms). */
  at: number;
  days: Record<string, TimetableDay>;
};

export const PROVIDER_LABELS: Record<TimetableProvider, string> = { mawaqit: "Mawaqit", masjidal: "Masjidal" };

/** Days of timetable kept on the place row; the nightly refresh keeps the window rolling. */
export const TIMETABLE_DAYS = 14;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "6:05" or "06:05:00" → "06:05"; anything else → null. */
export function normaliseHm(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = /^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?\s*$/i.exec(value);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  const hm = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  return HM.test(hm) ? hm : null;
}

export function addMinutes(hm: string, minutes: number): string {
  const [hours = 0, mins = 0] = hm.split(":").map(Number);
  const total = (((hours * 60 + mins + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Local dates from `start` (YYYY-MM-DD), `count` days long. */
export function dateRange(start: string, count: number): string[] {
  const [year = 1970, month = 1, day = 1] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, offset) => new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10));
}

/** Reads `place.timetable_json`, ignoring anything malformed. */
export function parseTimetable(json: string | null | undefined): Timetable | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<Timetable>;
    if ((parsed.p !== "mawaqit" && parsed.p !== "masjidal") || typeof parsed.url !== "string" || typeof parsed.at !== "number" || !parsed.days) return null;
    return parsed as Timetable;
  } catch {
    return null;
  }
}

/** The timetable's entry for a local date, when it has any iqamah or adhan for it. */
export function timetableOn(timetable: Timetable | null, date: string): TimetableDay | null {
  const day = timetable?.days[date];
  if (!day) return null;
  const hasTimes = IQAMAH_PRAYERS.some((prayer) => day.i?.[prayer] || day.a?.[prayer]);
  return hasTimes ? day : null;
}

/** Keeps only well-formed HH:MM values, so a provider's odd entry never reaches a card. */
export function cleanDay(day: TimetableDay): TimetableDay {
  const pick = (times: TimetableDay["a"]) => {
    const out: Partial<Record<IqamahPrayer, string>> = {};
    for (const prayer of IQAMAH_PRAYERS) {
      const value = times?.[prayer];
      if (value && HM.test(value)) out[prayer] = value;
    }
    return Object.keys(out).length > 0 ? out : undefined;
  };
  const a = pick(day.a);
  const i = pick(day.i);
  const j = day.j?.filter((time) => HM.test(time));
  return { ...(a ? { a } : {}), ...(i ? { i } : {}), ...(j?.length ? { j } : {}) };
}

export type SourceRef = { provider: TimetableProvider; externalId: string; url: string };

/**
 * Recognises a Mawaqit or Masjidal link (a pasted URL or an OpenStreetMap `website` tag).
 * Mawaqit: mawaqit.net/<lang>/<slug> or mawaqit.net/<lang>/m/<slug>. Masjidal: any URL with masjid_id=.
 */
export function detectSource(input: string | null | undefined): SourceRef | null {
  if (!input) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "mawaqit.net") {
    const parts = url.pathname.split("/").filter(Boolean);
    const rest = /^[a-z]{2}$/i.test(parts[0] ?? "") ? parts.slice(1) : parts;
    const slug = rest[0] === "m" || rest[0] === "w" ? rest[1] : rest[0];
    if (!slug || !/^[a-z0-9][a-z0-9-]{1,150}$/i.test(slug) || RESERVED_MAWAQIT.has(slug.toLowerCase())) return null;
    return { provider: "mawaqit", externalId: slug.toLowerCase(), url: `https://mawaqit.net/en/${slug.toLowerCase()}` };
  }
  if (host.endsWith("masjidal.com") || host.endsWith("mymasjidal.com")) {
    const id = url.searchParams.get("masjid_id") ?? url.searchParams.get("masjidId");
    if (!id || !/^[A-Za-z0-9]{4,32}$/.test(id)) return null;
    return { provider: "masjidal", externalId: id, url: `https://masjidal.com/widget/simple/v3/?masjid_id=${id}` };
  }
  return null;
}

const RESERVED_MAWAQIT = new Set(["backoffice", "api", "login", "register", "search", "faq", "contact", "about", "privacy", "cgu"]);
