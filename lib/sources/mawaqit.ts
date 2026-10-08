import { IQAMAH_PRAYERS, type IqamahPrayer } from "@/lib/trust/facts";
import { addMinutes, cleanDay, dateRange, normaliseHm, type TimetableDay } from "./timetable";

/**
 * Mawaqit (mawaqit.net) publishes each mosque's page with its whole-year timetable embedded as
 * `confData`: `calendar` holds the adhan for every day (fajr, shuruq, dhuhr, asr, maghrib, isha) and
 * `iqamaCalendar` the iqamah, either as "+N" minutes after the adhan or a fixed "HH:MM". The page
 * is public; its search API needs an account token, so places are linked by their Mawaqit URL.
 */
export type MawaqitConf = {
  name?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  closed?: unknown;
  iqamaEnabled?: boolean;
  calendar?: Array<Record<string, string[]>>;
  iqamaCalendar?: Array<Record<string, string[]>>;
  fixedIqama?: unknown;
  jumua?: string | null;
  jumua2?: string | null;
  jumua3?: string | null;
};

/** The `confData = {…};` object from a Mawaqit mosque page. */
export function parseConfData(html: string): MawaqitConf | null {
  const start = html.search(/confData\s*=\s*\{/);
  if (start < 0) return null;
  const open = html.indexOf("{", start);
  // Walk to the matching brace (strings may contain braces), rather than trusting a regex on a 60 KB page.
  let depth = 0;
  let inString = false;
  for (let index = open; index < html.length; index += 1) {
    const char = html[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(open, index + 1)) as MawaqitConf;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const ADHAN_INDEX: Record<IqamahPrayer, number> = { fajr: 0, dhuhr: 2, asr: 3, maghrib: 4, isha: 5 };

/** Timetable days from `start` for `count` days, read from the year calendars. */
export function mawaqitDays(conf: MawaqitConf, start: string, count: number): Record<string, TimetableDay> {
  const days: Record<string, TimetableDay> = {};
  const jumuah = [conf.jumua, conf.jumua2, conf.jumua3].map(normaliseHm).filter((time): time is string => time !== null);
  const fixed = Array.isArray(conf.fixedIqama) ? conf.fixedIqama : null;
  for (const date of dateRange(start, count)) {
    const [, month = 1, dayOfMonth = 1] = date.split("-").map(Number);
    const adhanRow = conf.calendar?.[month - 1]?.[String(dayOfMonth)];
    const iqamahRow = conf.iqamaCalendar?.[month - 1]?.[String(dayOfMonth)];
    const a: TimetableDay["a"] = {};
    const i: TimetableDay["i"] = {};
    IQAMAH_PRAYERS.forEach((prayer, position) => {
      const adhan = normaliseHm(adhanRow?.[ADHAN_INDEX[prayer]]);
      if (adhan) a[prayer] = adhan;
      if (conf.iqamaEnabled === false) return;
      const pinned = normaliseHm(fixed?.[position]);
      const raw = pinned ?? iqamahRow?.[position];
      const offset = typeof raw === "string" ? /^\s*\+?\s*(\d{1,3})\s*$/.exec(raw) : null;
      if (offset && adhan) i[prayer] = addMinutes(adhan, Number(offset[1]));
      else if (normaliseHm(raw)) i[prayer] = normaliseHm(raw)!;
    });
    const isFriday = new Date(`${date}T12:00:00Z`).getUTCDay() === 5;
    const cleaned = cleanDay({ a, i, ...(isFriday && jumuah.length ? { j: jumuah } : {}) });
    if (cleaned.a || cleaned.i) days[date] = cleaned;
  }
  return days;
}

export async function fetchMawaqit(slug: string, fetcher: typeof fetch = fetch): Promise<MawaqitConf> {
  const response = await fetcher(`https://mawaqit.net/en/${encodeURIComponent(slug)}`, {
    headers: { "user-agent": "mosques.world (https://mosques.world/attribution)", accept: "text/html" },
    redirect: "follow",
  });
  if (response.status === 404) throw new Error("That Mawaqit page doesn't exist.");
  if (!response.ok) throw new Error(`Mawaqit answered ${response.status}.`);
  const conf = parseConfData(await response.text());
  if (!conf?.calendar?.length) throw new Error("That Mawaqit page has no timetable.");
  return conf;
}
