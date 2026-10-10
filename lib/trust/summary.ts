import type { PrayerDay } from "@/lib/prayer/times";
import { formatTime12, iqamahValue, IQAMAH_PRAYERS, jumuahValue, resolveIqamah, toMinutes, type IqamahPrayer, type JumuahValue } from "./facts";
import type { FactState } from "./engine";

/** One fact as denormalised onto `place.iqamah_summary_json` for cards and pins. */
export type SummaryEntry = {
  /** Current value. */
  v: unknown;
  /** Local date the current value applies from. */
  from: string;
  /** Value that applies before `from` (a dated change that has not started yet). */
  prev: unknown | null;
  s: FactState;
  /** Distinct people confirming the current value. */
  n: number;
  /** Last confirmation (unix ms). */
  at: number | null;
  /** Open challenger, when someone reported a change. */
  c?: { v: unknown; n: number } | null;
};

export type PlaceSummary = {
  iqamah: Partial<Record<IqamahPrayer, SummaryEntry>>;
  jumuah: Array<SummaryEntry & { q: string }>;
  /** Monthly-timetable iqamahs for the next ~2 weeks: date → prayer → HH:MM (spec P7). */
  tt?: Record<string, Partial<Record<IqamahPrayer, string>>>;
};

export function parseSummary(json: string | null | undefined): PlaceSummary | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as Partial<PlaceSummary>;
    return { iqamah: parsed.iqamah ?? {}, jumuah: parsed.jumuah ?? [], ...(parsed.tt ? { tt: parsed.tt } : {}) };
  } catch {
    return null;
  }
}

/** The value of a summary entry on a given local date. */
export function valueOn(entry: SummaryEntry, date: string): unknown | null {
  return entry.from <= date ? entry.v : entry.prev;
}

export type IqamahToday = {
  prayer: IqamahPrayer;
  time: string;
  label: string;
  state: FactState;
  people: number;
  at: number | null;
  challenger: string | null;
};

const LABELS: Record<IqamahPrayer, string> = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

/** Resolves today's iqamah times against the calculated adhan for that day. */
export function iqamahToday(summary: PlaceSummary | null, day: PrayerDay): Partial<Record<IqamahPrayer, IqamahToday>> {
  const result: Partial<Record<IqamahPrayer, IqamahToday>> = {};
  if (!summary) return result;
  for (const prayer of IQAMAH_PRAYERS) {
    const entry = summary.iqamah[prayer];
    const adhan = day.rows.find((row) => row.key === prayer)?.adhan;
    const dated = summary.tt?.[day.date]?.[prayer];
    if (dated && adhan) {
      // A monthly timetable's value for this exact date wins over the standing iqamah.
      result[prayer] = { prayer, time: dated, label: formatTime12(dated), state: entry?.s ?? "unverified", people: entry?.n ?? 0, at: entry?.at ?? null, challenger: null };
      continue;
    }
    if (!entry || !adhan) continue;
    const parsed = iqamahValue.safeParse(valueOn(entry, day.date));
    if (!parsed.success) continue;
    const time = resolveIqamah(parsed.data, adhan);
    const challenger = entry.c ? iqamahValue.safeParse(entry.c.v) : null;
    result[prayer] = {
      prayer,
      time,
      label: formatTime12(time),
      state: entry.s,
      people: entry.n,
      at: entry.at,
      challenger: challenger?.success ? formatTime12(resolveIqamah(challenger.data, adhan)) : null,
    };
  }
  return result;
}

export function jumuahToday(summary: PlaceSummary | null, date: string): Array<{ q: string; value: JumuahValue; state: FactState; people: number }> {
  if (!summary) return [];
  return summary.jumuah
    .map((entry) => {
      const parsed = jumuahValue.safeParse(valueOn(entry, date));
      return parsed.success ? { q: entry.q, value: parsed.data, state: entry.s, people: entry.n } : null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => Number(a.q) - Number(b.q));
}

export type NextJamaah = {
  prayer: IqamahPrayer;
  label: string;
  time: string;
  kind: "iqamah" | "adhan";
  /** Minutes after local midnight (tomorrow's Fajr is +1440). */
  minutes: number;
};

/** The next congregation: iqamah when known, else the adhan (spec P2 explore upgrades). */
export function nextJamaah(summary: PlaceSummary | null, day: PrayerDay, nowLocal: string): NextJamaah {
  const today = iqamahToday(summary, day);
  const now = toMinutes(nowLocal);
  const options = IQAMAH_PRAYERS.map((prayer) => {
    const iqamah = today[prayer];
    const adhan = day.rows.find((row) => row.key === prayer)?.adhan ?? "00:00";
    const time = iqamah?.time ?? adhan;
    const label = prayer === "dhuhr" && day.jumuah ? "Jumu'ah" : LABELS[prayer];
    return { prayer, label, time, kind: iqamah ? ("iqamah" as const) : ("adhan" as const), minutes: toMinutes(time) };
  });
  const upcoming = options.find((option) => option.minutes > now);
  if (upcoming) return upcoming;
  const fajr = options[0] ?? { prayer: "fajr" as const, label: "Fajr", time: "00:00", kind: "adhan" as const, minutes: 0 };
  return { ...fajr, label: "Fajr", minutes: fajr.minutes + 1440 };
}

/**
 * The next prayer this mosque has an iqamah for, skipping prayers with none (never the calculated adhan).
 * After the last one today it is tomorrow's first known iqamah, assuming today's time.
 */
export function nextIqamah(summary: PlaceSummary | null, day: PrayerDay, nowLocal: string): NextJamaah | null {
  const today = iqamahToday(summary, day);
  const now = toMinutes(nowLocal);
  const options = IQAMAH_PRAYERS.flatMap((prayer) => {
    const iqamah = today[prayer];
    if (!iqamah) return [];
    const label = prayer === "dhuhr" && day.jumuah ? "Jumu'ah" : LABELS[prayer];
    return [{ prayer, label, time: iqamah.time, kind: "iqamah" as const, minutes: toMinutes(iqamah.time) }];
  });
  const upcoming = options.find((option) => option.minutes > now);
  if (upcoming) return upcoming;
  const first = options[0];
  return first ? { ...first, label: LABELS[first.prayer], minutes: first.minutes + 1440 } : null;
}

export function hasOpenChange(summary: PlaceSummary | null): boolean {
  if (!summary) return false;
  return Object.values(summary.iqamah).some((entry) => entry?.c) || summary.jumuah.some((entry) => entry.c);
}

export function relativeAge(at: number | null, now: number): string {
  if (at === null) return "never";
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 60) return minutes <= 1 ? "just now" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

export function shortAge(at: number | null, now: number): string {
  if (at === null) return "—";
  const minutes = Math.max(0, (now - at) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}
