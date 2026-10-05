import type { PrayerDay, PrayerKey } from "@/lib/prayer/times";
import { formatTime12 } from "@/lib/trust/facts";
import { relativeAge } from "@/lib/trust/summary";
import { DEFAULT_LOCALE, direction, localePath, uses12h, type Locale } from "./config";
import { ar } from "./messages/ar";
import { bn } from "./messages/bn";
import { en, type MessageKey, type Messages } from "./messages/en";
import { fr } from "./messages/fr";
import { id } from "./messages/id";
import { ms } from "./messages/ms";
import { tr } from "./messages/tr";
import { ur } from "./messages/ur";

const CATALOGS: Record<Locale, Messages> = { en, ar, ur, bn, id, ms, tr, fr };

type Vars = Record<string, string | number>;

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export type Translator = ReturnType<typeof translator>;

/**
 * Everything a server component needs to render in `locale`. English output matches the strings the
 * site used before Phase 8 exactly, so unprefixed pages are unchanged.
 */
export function translator(locale: Locale = DEFAULT_LOCALE) {
  const messages = CATALOGS[locale];
  const plurals = new Intl.PluralRules(locale);
  // Latin digits everywhere keep times tabular and easy to compare with the board.
  const numbering = `${locale}-u-nu-latn`;

  function t(key: MessageKey, vars?: Vars): string {
    const value = messages[key] ?? en[key];
    if (typeof value === "string") return fill(value, vars);
    return fill(value.other, vars);
  }

  function plural(key: MessageKey, n: number, vars?: Vars): string {
    const value = messages[key] ?? en[key];
    if (typeof value === "string") return fill(value, { n, ...vars });
    const forms = value as Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
    // Arabic "zero" is only picked for an explicit 0.
    const category = n === 0 && forms.zero ? "zero" : plurals.select(n);
    return fill(forms[category] ?? forms.other, { n, ...vars });
  }

  /** A local "HH:MM" as people read it in this language (12h or 24h). */
  function time(hm: string): string {
    if (locale === DEFAULT_LOCALE) return formatTime12(hm);
    const [hours = 0, minutes = 0] = hm.split(":").map(Number);
    const hour12 = uses12h(locale);
    return new Intl.DateTimeFormat(numbering, { hour: hour12 ? "numeric" : "2-digit", minute: "2-digit", hour12, timeZone: "UTC" }).format(
      new Date(Date.UTC(2000, 0, 1, hours, minutes)),
    );
  }

  /** Adhan times use the same clock style as iqamah times, so one list never mixes "16:35" and "5:00 PM". */
  function adhan(hm: string): string {
    return time(hm);
  }

  function prayer(key: PrayerKey, jumuah = false): string {
    if (key === "dhuhr" && jumuah) return t("prayer.jumuah");
    return t(`prayer.${key}`);
  }

  function relative(at: number | null, now: number): string {
    if (locale === DEFAULT_LOCALE) return relativeAge(at, now);
    if (at === null) return t("status.never");
    const format = new Intl.RelativeTimeFormat(numbering, { numeric: "auto" });
    const minutes = Math.max(0, Math.round((now - at) / 60000));
    if (minutes < 60) return format.format(-Math.max(minutes, 0), "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 24) return format.format(-hours, "hour");
    return format.format(-Math.round(hours / 24), "day");
  }

  function duration(minutes: number): string {
    if (minutes < 60) return t("duration.minutes", { n: minutes });
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? t("duration.hours", { h }) : t("duration.hoursMinutes", { h, m });
  }

  /** "2026-11-17" as a long local date; English keeps the ISO date the page always showed. */
  function date(iso: string): string {
    if (locale === DEFAULT_LOCALE) return iso;
    const [year = 2000, month = 1, day = 1] = iso.split("-").map(Number);
    return new Intl.DateTimeFormat(numbering, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
      new Date(Date.UTC(year, month - 1, day)),
    );
  }

  function hijri(day: Pick<PrayerDay, "date" | "hijri">): string {
    if (locale === DEFAULT_LOCALE) return day.hijri;
    const [year = 2000, month = 1, dayOfMonth = 1] = day.date.split("-").map(Number);
    try {
      return new Intl.DateTimeFormat(`${locale}-u-ca-islamic-umalqura-nu-latn`, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(Date.UTC(year, month - 1, dayOfMonth, 12)),
      );
    } catch {
      return day.hijri;
    }
  }

  return {
    locale,
    dir: direction(locale),
    t,
    plural,
    time,
    adhan,
    prayer,
    relative,
    duration,
    date,
    hijri,
    href: (path: string) => localePath(locale, path),
  };
}
