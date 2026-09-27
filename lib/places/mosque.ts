import { TZDate } from "@date-fns/tz";
import { civilDate, type PrayerDay, type PrayerKey } from "@/lib/prayer/times";
import type { IqamahCell, NextRow } from "@/components/mw/prayer-table";
import { formatTime12, IQAMAH_PRAYERS, iqamahValue, jumuahValue, languageName, ordinal, resolveIqamah, type JumuahValue } from "@/lib/trust/facts";
import type { FactView } from "@/lib/trust/read";
import { relativeAge } from "@/lib/trust/summary";

export function localInstant(date: { year: number; month: number; day: number }, time: string, timeZone: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Date(new TZDate(date.year, date.month - 1, date.day, hours, minutes, 0, timeZone).getTime()).toISOString();
}

function people(count: number): string {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

export function statusFor(fact: FactView, now: number): Pick<IqamahCell, "status" | "tone"> {
  if (fact.challenger) return { status: `Change reported ${relativeAge(fact.challenger.createdAt, now)}`, tone: "warning" };
  const shown = fact.shown ?? fact.current;
  const confirmed = shown?.lastConfirmedAt ?? null;
  if (fact.state === "disputed") return { status: "Change reported", tone: "warning" };
  if (fact.state === "stale") return { status: `Needs check · last confirmed ${relativeAge(confirmed, now)}`, tone: "warning" };
  const rule = shown ? iqamahValue.safeParse(shown.value) : null;
  const ruleText = rule?.success && "rule" in rule.data ? `${rule.data.min} min after adhan · ` : "";
  if (fact.state === "verified") {
    return { status: `${ruleText || "Verified "}${ruleText ? "" : `${relativeAge(confirmed, now)} · `}${people(shown?.backers ?? 0)}`, tone: "ok" };
  }
  return { status: `${ruleText}Unverified · ${people(shown?.backers ?? 0)}`, tone: "muted" };
}

/** Iqamah cells for today's table, resolved against the calculated adhan. */
export function iqamahCells(facts: FactView[], day: PrayerDay, now: number): Partial<Record<PrayerKey, IqamahCell>> {
  const cells: Partial<Record<PrayerKey, IqamahCell>> = {};
  for (const prayer of IQAMAH_PRAYERS) {
    const fact = facts.find((item) => item.key === `iqamah.${prayer}`);
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
      label: formatTime12(time),
      at: localInstant(civilDate(new Date(row.at), day.timezone), time, day.timezone),
      ...statusFor(fact, now),
    };
  }
  return cells;
}

export function nextRows(day: PrayerDay, cells: Partial<Record<PrayerKey, IqamahCell>>, facts: FactView[], now: number): NextRow[] {
  return day.rows
    .filter((row) => row.key !== "sunrise")
    .map((row) => {
      const cell = cells[row.key];
      const fact = facts.find((item) => item.key === `iqamah.${row.key}`);
      const confirmed = fact?.shown?.lastConfirmedAt ?? null;
      return {
        key: row.key,
        label: row.label,
        adhan: row.adhan,
        adhanAt: row.at,
        iqamah: cell?.label,
        iqamahAt: cell?.at,
        meta: cell ? (fact?.state === "verified" ? `iqamah verified ${relativeAge(confirmed, now)}` : "iqamah unverified") : undefined,
      };
    });
}

export type JumuahCard = { qualifier: string; overline: string; time: string; detail: string | null; status: string };

export function jumuahCards(facts: FactView[]): JumuahCard[] {
  return facts
    .filter((fact) => fact.key === "jumuah.jamaah" && fact.shown)
    .map((fact) => {
      const parsed = jumuahValue.safeParse(fact.shown?.value);
      if (!parsed.success) return null;
      const value: JumuahValue = parsed.data;
      const detail = [
        value.khutbah ? `Khutbah ${formatTime12(value.khutbah)}` : null,
        value.lang?.length ? value.lang.map(languageName).join(", ") : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        qualifier: fact.qualifier,
        overline: `${ordinal(Number(fact.qualifier) || 1)} jamā'ah`.toUpperCase(),
        time: formatTime12(value.t),
        detail: detail || null,
        status: fact.state === "verified" ? `Verified · ${people(fact.shown?.backers ?? 0)}` : `Unverified · ${people(fact.shown?.backers ?? 0)}`,
      };
    })
    .filter((card): card is JumuahCard => card !== null)
    .sort((a, b) => Number(a.qualifier) - Number(b.qualifier));
}

export type TrustTone = "verified" | "partial" | "none" | "needs_check";

export function trustHeadline(state: string): { title: string; tone: TrustTone } {
  if (state === "verified") return { title: "Community verified", tone: "verified" };
  if (state === "partial") return { title: "Partly verified", tone: "partial" };
  if (state === "needs_check") return { title: "Needs a check", tone: "needs_check" };
  return { title: "Unverified", tone: "none" };
}

export type UpdateCurrent = { candidateId: string; value: unknown; score: number; state: FactView["state"]; backers: number };

/** Props for the Update timings dialog: current values, today's adhan, and the date window. */
export function updateData(input: {
  place: { id: string; slug: string; name: string };
  facts: FactView[];
  day: PrayerDay;
  trustLevel: number;
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
    jumuah: facts
      .filter((fact) => fact.key === "jumuah.jamaah")
      .map((fact) => ({ qualifier: fact.qualifier, current: current(fact) }))
      .sort((a, b) => Number(a.qualifier) - Number(b.qualifier)),
  };
}
