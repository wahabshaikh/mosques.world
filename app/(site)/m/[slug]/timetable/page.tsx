import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { TrackView } from "@/components/mw/track-view";
import { appEnv } from "@/lib/db/client";
import { resolvePlaceSlug } from "@/lib/db/queries";
import { isNonProductionHost } from "@/lib/environment";
import { madhabOf, readNow } from "@/lib/places/present";
import { phase7Enabled } from "@/lib/phase";
import { civilDate, formatHijri, getPrayerDay, parseAdhanAdjust } from "@/lib/prayer/times";
import { daysIn, monthValues } from "@/lib/timetable";
import { formatTime12, IQAMAH_PRAYERS } from "@/lib/trust/facts";
import { iqamahToday, parseSummary } from "@/lib/trust/summary";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { slug: string };
type Search = Record<string, string | string[] | undefined>;

const LABELS = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" } as const;

function shift(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2000, (index ?? 1) - 1 + by, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 2000, (index ?? 1) - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolvePlaceSlug(slug);
  const name = resolved && "place" in resolved ? resolved.place.name : "Mosque";
  return { title: `${name} monthly timetable`, description: `Adhan and iqamah times for every day of the month at ${name}.`, alternates: { canonical: `/m/${slug}/timetable` } };
}

/** The whole month: calculated adhan and the iqamah for each date (spec P7). */
export default async function TimetablePage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  if (!(await phase7Enabled())) notFound();
  const { slug } = await params;
  const resolved = await resolvePlaceSlug(slug);
  if (!resolved) notFound();
  if ("redirect" in resolved) permanentRedirect(`/m/${resolved.redirect}/timetable`);
  const place = resolved.place;
  if (place.status !== "active" && place.status !== "closed") notFound();
  const headerList = await headers();
  const now = readNow(headerList.get("x-mw-now"), isNonProductionHost(headerList.get("host")?.split(":")[0] ?? ""));
  const civil = civilDate(now, place.timezone);
  const thisMonth = `${civil.year}-${String(civil.month).padStart(2, "0")}`;
  const today = `${thisMonth}-${String(civil.day).padStart(2, "0")}`;
  const requested = (await searchParams).month;
  const month = typeof requested === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : thisMonth;
  const database = appEnv().DB;
  const [dated, provenance] = await Promise.all([
    monthValues(database, place.id, month),
    database
      .prepare(
        `SELECT timetable.created_at, timetable.source_photo_id, user.username FROM timetable JOIN user ON user.id = timetable.created_by
         WHERE timetable.place_id = ? AND timetable.month = ? ORDER BY timetable.created_at DESC LIMIT 1`,
      )
      .bind(place.id, month)
      .first<{ created_at: number; source_photo_id: string | null; username: string | null }>(),
  ]);
  const standing = parseSummary(place.iqamahSummaryJson);
  if (standing) delete standing.tt;
  const days = daysIn(month).map((date) => {
    const [year, index, day] = date.split("-").map(Number);
    const noon = new Date(Date.UTC(year ?? 2000, (index ?? 1) - 1, day ?? 1, 12));
    const prayerDay = getPrayerDay({
      lat: place.lat,
      lng: place.lng,
      timeZone: place.timezone,
      method: place.calcMethod,
      madhab: madhabOf(place.asrMadhab),
      highLat: place.highLatRule,
      adjust: parseAdhanAdjust(place.adhanAdjustJson),
      now: noon,
    });
    const regular = iqamahToday(standing, prayerDay);
    return {
      date,
      weekday: noon.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
      hijri: formatHijri(noon, place.timezone),
      friday: prayerDay.jumuah,
      cells: IQAMAH_PRAYERS.map((prayer) => {
        const adhan = prayerDay.rows.find((row) => row.key === prayer)?.adhan ?? "00:00";
        const board = dated.get(`${date}|${prayer}`);
        return {
          prayer,
          adhan: formatTime12(adhan),
          iqamah: board ? formatTime12(board.time) : (regular[prayer]?.label ?? null),
          source: board ? "timetable" : regular[prayer] ? "standing" : null,
        };
      }),
    };
  });
  const fromBoard = dated.size;
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-8 lg:px-6">
      <TrackView goal="timetable_view" props={{ month }} />
      <Link href={`/m/${place.slug}`} className="text-sm text-muted-foreground hover:text-foreground">
        ← {place.name}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{monthLabel(month)}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {fromBoard > 0
              ? `${fromBoard} iqamah times from the mosque's timetable${provenance?.username ? `, imported by @${provenance.username}` : ""}. Other iqamahs are the mosque's usual times.`
              : "Iqamah times are the mosque's usual times. Adhan times are calculated."}
          </p>
        </div>
        <nav aria-label="Month" className="flex items-center gap-2">
          <Link href={`/m/${place.slug}/timetable?month=${shift(month, -1)}`} className="rounded-full border border-input px-4 py-2 text-sm font-semibold">
            ← {monthLabel(shift(month, -1)).split(" ")[0]}
          </Link>
          <Link href={`/m/${place.slug}/timetable?month=${shift(month, 1)}`} className="rounded-full border border-input px-4 py-2 text-sm font-semibold">
            {monthLabel(shift(month, 1)).split(" ")[0]} →
          </Link>
          <Link href={`/m/${place.slug}/timetable/import?month=${month}`} className="rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground">
            Import this month
          </Link>
        </nav>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[720px] text-start text-sm tabular" data-testid="timetable">
          <caption className="sr-only">
            Adhan and iqamah times for {place.name}, {monthLabel(month)}
          </caption>
          <thead className="bg-muted text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th scope="col" className="px-3 py-2">
                Date
              </th>
              {IQAMAH_PRAYERS.map((prayer) => (
                <th key={prayer} scope="col" className="px-3 py-2">
                  {LABELS[prayer]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date} data-date={day.date} className={cn("border-t border-border", day.date === today && "bg-primary-soft")}>
                <th scope="row" className="px-3 py-2 font-semibold whitespace-nowrap">
                  {day.weekday} {Number(day.date.slice(8))}
                  <span className="block text-xs font-normal text-muted-foreground">{day.hijri}</span>
                </th>
                {day.cells.map((cell) => (
                  <td key={cell.prayer} className="px-3 py-2" data-prayer={cell.prayer} data-source={cell.source ?? "none"}>
                    <span className="block font-bold">{cell.iqamah ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">
                      {cell.prayer === "dhuhr" && day.friday ? "Jumu'ah · " : ""}adhan {cell.adhan}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Bold times are iqamah (congregation). Adhan times are calculated ({place.calcMethod}, {place.asrMadhab} Asr). Always check the board
        on special days.
      </p>
    </div>
  );
}
