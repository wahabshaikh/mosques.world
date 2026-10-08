import { CalendarCheck, ExternalLink } from "lucide-react";
import { IQAMAH_PRAYERS, toMinutes, type IqamahPrayer } from "@/lib/trust/facts";
import type { TimetableDay } from "@/lib/sources/timetable";
import { cn } from "@/lib/utils";

/**
 * Today's times as the mosque itself publishes them (Mawaqit, Masjidal). Kept visually apart from the
 * community table: solid green, with the source credited next to the times (a condition of reusing them).
 */
export function MosqueTimetable({
  day,
  nowLocal,
  jumuahToday,
  labels,
  sourceUrl,
}: {
  day: TimetableDay;
  /** "HH:MM" now, where the mosque is. */
  nowLocal: string;
  jumuahToday: boolean;
  labels: {
    title: string;
    via: string;
    prayer: string;
    adhan: string;
    iqamah: string;
    jumuah: string | null;
    prayers: Record<IqamahPrayer, string>;
    time: (hm: string) => string;
  };
  sourceUrl: string;
}) {
  const now = toMinutes(nowLocal);
  const rows = IQAMAH_PRAYERS.filter((prayer) => day.a?.[prayer] || day.i?.[prayer]);
  const next = rows.find((prayer) => toMinutes(day.i?.[prayer] ?? day.a?.[prayer] ?? "00:00") > now);
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border-2 border-primary" aria-labelledby="mosque-timetable" data-testid="mosque-timetable">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-primary px-4 py-3 text-primary-foreground">
        <h3 id="mosque-timetable" className="inline-flex items-center gap-2 font-bold">
          <CalendarCheck className="size-4" aria-hidden="true" /> {labels.title}
        </h3>
        <a href={sourceUrl} rel="nofollow noopener" target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-primary-foreground/90 underline">
          {labels.via} <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-primary-soft text-start text-xs tracking-wide text-muted-foreground uppercase">
            <th className="px-4 py-2 text-start font-bold">{labels.prayer}</th>
            <th className="px-3 py-2 text-start font-bold">{labels.adhan}</th>
            <th className="px-3 py-2 text-start font-bold">{labels.iqamah}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((prayer) => {
            const friday = prayer === "dhuhr" && jumuahToday && labels.jumuah;
            return (
              <tr key={prayer} className={cn("border-t border-border", prayer === next && "bg-primary-soft")} data-source-prayer={prayer}>
                <th scope="row" className="px-4 py-2.5 text-start font-bold">
                  {labels.prayers[prayer]}
                </th>
                <td className="tabular px-3 py-2.5 text-muted-foreground">{day.a?.[prayer] ? labels.time(day.a[prayer]!) : "—"}</td>
                <td className="tabular px-3 py-2.5 text-base font-extrabold text-primary">
                  {friday ? labels.jumuah : day.i?.[prayer] ? labels.time(day.i[prayer]!) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
