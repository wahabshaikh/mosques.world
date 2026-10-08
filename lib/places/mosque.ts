import { TZDate } from "@date-fns/tz";
import { civilDate, type PrayerDay, type PrayerKey } from "@/lib/prayer/times";
import type { IqamahCell, NextRow } from "@/components/mw/prayer-table";
import { ADHAN_METHOD_KEY, AMENITIES, ASR_MADHAB_KEY, IQAMAH_PRAYERS, iqamahValue, jumuahValue, languageName, ordinal, resolveIqamah, type IqamahPrayer, type JumuahValue } from "@/lib/trust/facts";
import type { TimetableDay } from "@/lib/sources/timetable";
import type { FactView } from "@/lib/trust/read";
import { translator, type Translator } from "@/lib/i18n";

export function localInstant(date: { year: number; month: number; day: number }, time: string, timeZone: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Date(new TZDate(date.year, date.month - 1, date.day, hours, minutes, 0, timeZone).getTime()).toISOString();
}

const ENGLISH = translator("en");

export function statusFor(fact: FactView, now: number, l: Translator = ENGLISH): Pick<IqamahCell, "status" | "tone"> {
  if (fact.challenger) return { status: l.t("status.changeReportedAgo", { age: l.relative(fact.challenger.createdAt, now) }), tone: "warning" };
  const shown = fact.shown ?? fact.current;
  const confirmed = shown?.lastConfirmedAt ?? null;
  if (fact.state === "disputed") return { status: l.t("status.changeReported"), tone: "warning" };
  if (fact.state === "stale") return { status: l.t("status.needsCheck", { age: l.relative(confirmed, now) }), tone: "warning" };
  const rule = shown ? iqamahValue.safeParse(shown.value) : null;
  const ruleText = rule?.success && "rule" in rule.data ? l.t("status.rule", { n: rule.data.min }) : "";
  const people = l.plural("status.people", shown?.backers ?? 0);
  if (fact.state === "verified") {
    return { status: ruleText ? `${ruleText}${people}` : l.t("status.verifiedAgo", { age: l.relative(confirmed, now), people }), tone: "ok" };
  }
  return { status: `${ruleText}${l.t("status.unverified", { people })}`, tone: "muted" };
}

/** Iqamah cells for today's table, resolved against the calculated adhan. */
export function iqamahCells(facts: FactView[], day: PrayerDay, now: number, l: Translator = ENGLISH): Partial<Record<PrayerKey, IqamahCell>> {
  const cells: Partial<Record<PrayerKey, IqamahCell>> = {};
  for (const prayer of IQAMAH_PRAYERS) {
    // Today's value from a monthly timetable wins over the standing iqamah (spec P7).
    const dated = facts.find((item) => item.key === `timetable.${prayer}` && item.qualifier === day.date && item.current);
    const fact = dated ?? facts.find((item) => item.key === `iqamah.${prayer}`);
    const row = day.rows.find((item) => item.key === prayer);
    const shown = fact?.shown;
    if (!fact || !row || !shown) continue;
    const parsed = iqamahValue.safeParse(shown.value);
    if (!parsed.success) continue;
    const time = resolveIqamah(parsed.data, row.adhan);
    cells[prayer] = {
      candidateId: shown.candidateId,
      factKey: fact.key,
      confirmable: fact.state !== "verified" && !fact.challenger && shown.candidateId === fact.current?.candidateId,
      label: l.time(time),
      at: localInstant(civilDate(new Date(row.at), day.timezone), time, day.timezone),
      ...statusFor(fact, now, l),
    };
  }
  return cells;
}

export function nextRows(day: PrayerDay, cells: Partial<Record<PrayerKey, IqamahCell>>, facts: FactView[], now: number, l: Translator = ENGLISH): NextRow[] {
  return day.rows
    .filter((row) => row.key !== "sunrise")
    .map((row) => {
      const cell = cells[row.key];
      const fact = facts.find((item) => item.factId && item.key === cell?.factKey) ?? facts.find((item) => item.key === `iqamah.${row.key}`);
      const confirmed = fact?.shown?.lastConfirmedAt ?? null;
      return {
        key: row.key,
        label: l.locale === "en" ? row.label : l.prayer(row.key, row.key === "dhuhr" && day.jumuah),
        adhan: l.adhan(row.adhan),
        adhanAt: row.at,
        iqamah: cell?.label,
        iqamahAt: cell?.at,
        meta: cell ? (fact?.state === "verified" ? l.t("meta.verified", { age: l.relative(confirmed, now) }) : l.t("meta.unverified")) : undefined,
      };
    });
}

/**
 * The "next prayer" rows from the mosque's own timetable: its adhan where it publishes one (else the
 * calculated adhan) and its iqamah, credited to the provider.
 */
export function timetableRows(day: PrayerDay, own: TimetableDay, provider: string, l: Translator = ENGLISH): NextRow[] {
  const [year = 1970, month = 1, date = 1] = day.date.split("-").map(Number);
  const at = (hm: string) => localInstant({ year, month, day: date }, hm, day.timezone);
  return day.rows
    .filter((row) => row.key !== "sunrise")
    .map((row) => {
      const key = row.key as IqamahPrayer;
      const adhan = own.a?.[key];
      const iqamah = row.key === "dhuhr" && day.jumuah && own.j?.[0] ? own.j[0] : own.i?.[key];
      return {
        key: row.key,
        label: l.locale === "en" ? row.label : l.prayer(row.key, row.key === "dhuhr" && day.jumuah),
        adhan: l.adhan(adhan ?? row.adhan),
        adhanAt: adhan ? at(adhan) : row.at,
        iqamah: iqamah ? l.time(iqamah) : undefined,
        iqamahAt: iqamah ? at(iqamah) : undefined,
        meta: l.t("source.meta", { provider }),
      };
    });
}

export type JumuahCard = { qualifier: string; overline: string; time: string; detail: string | null; status: string };

export function jumuahCards(facts: FactView[], l: Translator = ENGLISH): JumuahCard[] {
  return facts
    .filter((fact) => fact.key === "jumuah.jamaah" && fact.shown)
    .map((fact) => {
      const parsed = jumuahValue.safeParse(fact.shown?.value);
      if (!parsed.success) return null;
      const value: JumuahValue = parsed.data;
      const detail = [
        value.khutbah ? l.t("mosque.khutbah", { time: l.time(value.khutbah) }) : null,
        value.lang?.length ? value.lang.map(languageName).join(", ") : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        qualifier: fact.qualifier,
        overline: (l.locale === "en" ? `${ordinal(Number(fact.qualifier) || 1)} jamā'ah` : l.t("mosque.jamaah", { n: Number(fact.qualifier) || 1 })).toUpperCase(),
        time: l.time(value.t),
        detail: detail || null,
        status: l.t(fact.state === "verified" ? "status.verified" : "status.unverified", { people: l.plural("status.people", fact.shown?.backers ?? 0) }),
      };
    })
    .filter((card): card is JumuahCard => card !== null)
    .sort((a, b) => Number(a.qualifier) - Number(b.qualifier));
}

export type TrustTone = "verified" | "partial" | "none" | "needs_check";

export function trustHeadline(state: string, l: Translator = ENGLISH): { title: string; tone: TrustTone } {
  if (state === "verified") return { title: l.t("trust.verified"), tone: "verified" };
  if (state === "partial") return { title: l.t("trust.partial"), tone: "partial" };
  if (state === "needs_check") return { title: l.t("trust.needsCheck"), tone: "needs_check" };
  return { title: l.t("trust.none"), tone: "none" };
}

export type UpdateCurrent = { candidateId: string; value: unknown; score: number; state: FactView["state"]; backers: number };

/** Props for the Update timings dialog: current values, today's adhan, and the date window. */
export function updateData(input: {
  place: { id: string; slug: string; name: string; method?: string; madhab?: string };
  facts: FactView[];
  day: PrayerDay;
  /** Times before community adhan adjustments (defaults to `day`). */
  calculated?: PrayerDay;
  trustLevel: number;
  amenities?: boolean;
}) {
  const { facts, day } = input;
  const current = (fact: FactView | undefined): UpdateCurrent | null =>
    fact?.current
      ? { candidateId: fact.current.candidateId, value: fact.current.value, score: fact.current.score, state: fact.state, backers: fact.current.backers }
      : null;
  const [year = 1970, month = 1, date = 1] = day.date.split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
  return {
    placeId: input.place.id,
    slug: input.place.slug,
    placeName: input.place.name,
    today: day.date,
    tomorrow,
    // A first value applies today so it shows at once; changes to known times default to tomorrow.
    defaultFrom: facts.some((fact) => fact.current) ? tomorrow : day.date,
    trustLevel: input.trustLevel,
    dhuhrAdhan: day.rows.find((row) => row.key === "dhuhr")?.adhan ?? "13:00",
    prayers: IQAMAH_PRAYERS.map((prayer) => {
      const row = day.rows.find((item) => item.key === prayer);
      return {
        key: `iqamah.${prayer}`,
        label: `${prayer.charAt(0).toUpperCase()}${prayer.slice(1)}`,
        adhan: row?.adhan ?? "12:00",
        current: current(facts.find((fact) => fact.key === `iqamah.${prayer}`)),
      };
    }),
    amenities: input.amenities
      ? AMENITIES.map((amenity) => ({
          key: amenity.key as string,
          label: amenity.label,
          current: current(facts.find((fact) => fact.key === amenity.key)),
        }))
      : [],
    adhan: {
      method: { value: input.place.method ?? "MuslimWorldLeague", current: current(facts.find((fact) => fact.key === ADHAN_METHOD_KEY)) },
      madhab: { value: input.place.madhab ?? "shafi", current: current(facts.find((fact) => fact.key === ASR_MADHAB_KEY)) },
      prayers: IQAMAH_PRAYERS.map((prayer) => ({
        key: `adhan.${prayer}`,
        label: `${prayer.charAt(0).toUpperCase()}${prayer.slice(1)}`,
        calculated: (input.calculated ?? day).rows.find((item) => item.key === prayer)?.adhan ?? "12:00",
        current: current(facts.find((fact) => fact.key === `adhan.${prayer}`)),
      })),
    },
    jumuah: facts
      .filter((fact) => fact.key === "jumuah.jamaah")
      .map((fact) => ({ qualifier: fact.qualifier, current: current(fact) }))
      .sort((a, b) => Number(a.qualifier) - Number(b.qualifier)),
  };
}
