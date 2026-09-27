import { TZDate } from "@date-fns/tz";
import {
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PrayerTimes,
  type CalculationParameters,
} from "adhan";

export const PRAYER_KEYS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
export type PrayerKey = (typeof PRAYER_KEYS)[number];

export type CalcMethodKey = keyof typeof CalculationMethod;
export type AsrMadhab = "shafi" | "hanafi";
export type HighLatRule = "twilightangle" | "middleofthenight" | "seventhofthenight";

export type PrayerRow = {
  key: PrayerKey;
  label: string;
  adhan: string;
  at: string;
};

export type PrayerDay = {
  date: string;
  hijri: string;
  timezone: string;
  rows: PrayerRow[];
  nextKey: PrayerKey;
  jumuah: boolean;
};

const HIGH_LAT: Record<HighLatRule, (typeof HighLatitudeRule)[keyof typeof HighLatitudeRule]> = {
  twilightangle: HighLatitudeRule.TwilightAngle,
  middleofthenight: HighLatitudeRule.MiddleOfTheNight,
  seventhofthenight: HighLatitudeRule.SeventhOfTheNight,
};

export function prayerLabel(key: PrayerKey, jumuah: boolean): string {
  switch (key) {
    case "fajr":
      return "Fajr";
    case "sunrise":
      return "Sunrise";
    case "dhuhr":
      return jumuah ? "Jumu'ah" : "Dhuhr";
    case "asr":
      return "Asr";
    case "maghrib":
      return "Maghrib";
    case "isha":
      return "Isha";
    default: {
      const neverKey: never = key;
      return neverKey;
    }
  }
}

export function parametersFor(
  method: string,
  madhab: AsrMadhab,
  highLat: HighLatRule,
): CalculationParameters {
  const known = method in CalculationMethod ? (method as CalcMethodKey) : "MuslimWorldLeague";
  const params = CalculationMethod[known]();
  params.madhab = madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = HIGH_LAT[highLat];
  return params;
}

export function civilDate(instant: Date, timeZone: string): { year: number; month: number; day: number } {
  const zoned = new TZDate(instant, timeZone);
  return { year: zoned.getFullYear(), month: zoned.getMonth() + 1, day: zoned.getDate() };
}

function adhanDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function formatHm(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function formatHijri(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone,
      calendar: "islamic-umalqura",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(instant);
  } catch {
    return "";
  }
}

function isFriday(instant: Date, timeZone: string): boolean {
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short" }).format(instant);
  return weekday === "Fri";
}

function addDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

const SALAH: PrayerKey[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

export function getPrayerDay(input: {
  lat: number;
  lng: number;
  timeZone: string;
  method: string;
  madhab: AsrMadhab;
  highLat: HighLatRule;
  now?: Date;
}): PrayerDay {
  const now = input.now ?? new Date();
  const civil = civilDate(now, input.timeZone);
  const params = parametersFor(input.method, input.madhab, input.highLat);
  const coordinates = new Coordinates(input.lat, input.lng);
  const today = new PrayerTimes(coordinates, adhanDate(civil.year, civil.month, civil.day), params);
  const tomorrowCivil = addDays(civil.year, civil.month, civil.day, 1);
  const tomorrow = new PrayerTimes(
    coordinates,
    adhanDate(tomorrowCivil.year, tomorrowCivil.month, tomorrowCivil.day),
    params,
  );

  const times: Record<PrayerKey, Date> = {
    fajr: today.fajr,
    sunrise: today.sunrise,
    dhuhr: today.dhuhr,
    asr: today.asr,
    maghrib: today.maghrib,
    isha: today.isha,
  };

  const jumuah = isFriday(today.dhuhr, input.timeZone);
  const rows: PrayerRow[] = PRAYER_KEYS.map((key) => ({
    key,
    label: prayerLabel(key, jumuah),
    adhan: formatHm(times[key], input.timeZone),
    at: times[key].toISOString(),
  }));

  let nextKey: PrayerKey = "fajr";
  const upcoming = SALAH.find((key) => times[key].getTime() > now.getTime());
  if (upcoming) {
    nextKey = upcoming;
  } else {
    nextKey = "fajr";
    const fajrRow = rows[0];
    if (fajrRow) {
      fajrRow.adhan = formatHm(tomorrow.fajr, input.timeZone);
      fajrRow.at = tomorrow.fajr.toISOString();
      fajrRow.label = "Fajr";
    }
  }

  return {
    date: `${civil.year}-${String(civil.month).padStart(2, "0")}-${String(civil.day).padStart(2, "0")}`,
    hijri: formatHijri(adhanDate(civil.year, civil.month, civil.day), input.timeZone),
    timezone: input.timeZone,
    rows,
    nextKey,
    jumuah,
  };
}

export function nextAdhanLabel(day: PrayerDay): { label: string; time: string } {
  const row = day.rows.find((item) => item.key === day.nextKey) ?? day.rows[0];
  return { label: row?.label ?? "Fajr", time: row?.adhan ?? "" };
}
