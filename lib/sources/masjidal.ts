import { cleanDay, dateRange, normaliseHm, type TimetableDay } from "./timetable";

/**
 * Masjidal's public time API (the one its website widgets read): adhan ("salah") and iqamah per day for
 * a masjid id. Rows come back in date order for the requested range, so they are matched by position.
 */
type MasjidalRow = Record<string, string | undefined>;
export type MasjidalBody = { status?: string; message?: unknown; data?: { salah?: MasjidalRow[]; iqamah?: MasjidalRow[] } | unknown[] };

export function masjidalDays(body: MasjidalBody, start: string, count: number): Record<string, TimetableDay> {
  if (body.status !== "success" || !body.data || Array.isArray(body.data)) return {};
  const { salah = [], iqamah = [] } = body.data;
  const days: Record<string, TimetableDay> = {};
  dateRange(start, count).forEach((date, index) => {
    const adhan = salah[index];
    const jamaah = iqamah[index];
    const pick = (row: MasjidalRow | undefined) =>
      row
        ? {
            fajr: normaliseHm(row.fajr) ?? undefined,
            dhuhr: normaliseHm(row.zuhr ?? row.dhuhr) ?? undefined,
            asr: normaliseHm(row.asr) ?? undefined,
            maghrib: normaliseHm(row.maghrib) ?? undefined,
            isha: normaliseHm(row.isha) ?? undefined,
          }
        : undefined;
    const isFriday = new Date(`${date}T12:00:00Z`).getUTCDay() === 5;
    const jumuah = isFriday && jamaah ? [jamaah.jummah1, jamaah.jummah2, jamaah.jummah3].map(normaliseHm).filter((time): time is string => time !== null) : [];
    const cleaned = cleanDay({ a: pick(adhan), i: pick(jamaah), ...(jumuah.length ? { j: jumuah } : {}) });
    if (cleaned.a || cleaned.i) days[date] = cleaned;
  });
  return days;
}

export async function fetchMasjidal(id: string, start: string, count: number, fetcher: typeof fetch = fetch): Promise<Record<string, TimetableDay>> {
  const [end] = dateRange(start, count).slice(-1);
  const response = await fetcher(
    `https://masjidal.com/api/v1/time/range?masjid_id=${encodeURIComponent(id)}&from_date=${start}&to_date=${end}`,
    { headers: { "user-agent": "mosques.world (https://mosques.world/attribution)", accept: "application/json" } },
  );
  const body = (await response.json().catch(() => null)) as MasjidalBody | null;
  if (!response.ok || !body || body.status !== "success") throw new Error("Masjidal doesn't know that masjid id.");
  const days = masjidalDays(body, start, count);
  if (Object.keys(days).length === 0) throw new Error("That Masjidal timetable is empty.");
  return days;
}
