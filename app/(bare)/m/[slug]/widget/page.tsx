import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { TrackView } from "@/components/mw/track-view";
import { appEnv } from "@/lib/db/client";
import { resolvePlaceSlug } from "@/lib/db/queries";
import { isNonProductionHost } from "@/lib/environment";
import { getTranslator } from "@/lib/i18n/server";
import { readPublicBoard } from "@/lib/masjid-pro";
import { iqamahCells } from "@/lib/places/mosque";
import { madhabOf, readNow } from "@/lib/places/present";
import { getPrayerDay, parseAdhanAdjust } from "@/lib/prayer/times";
import { placeFacts } from "@/lib/trust/read";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Prayer times", robots: { index: false, follow: false } };

export default async function WidgetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const resolved = await resolvePlaceSlug(slug);
  if (!resolved) notFound();
  if ("redirect" in resolved) permanentRedirect(`/m/${resolved.redirect}/widget`);
  const place = resolved.place;
  if (place.status !== "active" && place.status !== "closed") notFound();
  const l = await getTranslator();
  const now = readNow(headerList.get("x-mw-now"), isNonProductionHost(host));
  const board = await readPublicBoard(appEnv().DB, place.id, now.getTime());
  if (!board) {
    return (
      <article className="mx-auto flex min-h-[320px] max-w-[420px] flex-col justify-between bg-background p-6 text-foreground" data-testid="widget-locked">
        <div>
          <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{place.locality}</p>
          <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight">{place.name}</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{l.t("display.widgetLocked")}</p>
        </div>
        <Link href={l.href("/for-mosques")} className="mt-6 text-sm font-bold text-primary underline">
          {l.t("display.widgetCta")}
        </Link>
      </article>
    );
  }

  const day = getPrayerDay({
    lat: place.lat,
    lng: place.lng,
    timeZone: place.timezone,
    method: place.calcMethod,
    madhab: madhabOf(place.asrMadhab),
    highLat: place.highLatRule,
    adjust: parseAdhanAdjust(place.adhanAdjustJson),
    now,
  });
  const facts = await placeFacts(appEnv().DB, place.id, day.date);
  const cells = iqamahCells(facts, day, now.getTime(), l);
  return (
    <article className="mx-auto max-w-[420px] bg-background p-5 text-foreground" data-testid="widget-times">
      <TrackView goal="pro_widget_view" />
      <p className="text-xs font-bold tracking-[0.14em] text-primary uppercase">{place.locality}</p>
      <h1 className="mt-1 text-xl leading-tight font-extrabold tracking-tight">
        <a href={l.href(`/m/${place.slug}`)} target="_top" className="hover:underline">
          {place.name}
        </a>
      </h1>
      <p className="mt-1 text-xs text-muted-foreground">
        {l.date(day.date)}
        {day.hijri ? ` · ${l.hijri(day)}` : ""}
      </p>
      {board.notice ? (
        <p className="mt-4 border-s-2 border-primary ps-3 text-sm" data-testid="widget-notice">
          <span className="block text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">{l.t("mosque.committeeNotice")}</span>
          {board.notice}
        </p>
      ) : null}
      <table className="mt-4 w-full text-sm">
        <caption className="sr-only">{l.t("table.caption")}</caption>
        <thead>
          <tr className="text-[11px] font-bold tracking-[0.12em] text-muted-foreground uppercase">
            <th scope="col" className="py-1 text-start" />
            <th scope="col" className="py-1 text-end">
              {l.t("display.adhan")}
            </th>
            <th scope="col" className="py-1 text-end">
              {l.t("display.iqamah")}
            </th>
          </tr>
        </thead>
        <tbody>
          {day.rows.map((row) => (
            <tr key={row.key} className="border-t border-border">
              <th scope="row" className="py-2 text-start font-semibold">
                {l.prayer(row.key, row.key === "dhuhr" && day.jumuah)}
              </th>
              <td className="tabular py-2 text-end text-muted-foreground">{l.time(row.adhan)}</td>
              <td className="tabular py-2 text-end font-bold">{row.key === "sunrise" ? l.t("display.noIqamah") : (cells[row.key]?.label ?? l.t("display.noIqamah"))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        {board.donationUrl ? (
          <a href={board.donationUrl} className="font-bold text-foreground underline" rel="noopener noreferrer" target="_blank">
            {board.donationLabel || l.t("display.donate")}
          </a>
        ) : (
          <span>{l.t("display.published")}</span>
        )}
        <a href={l.href(`/m/${place.slug}`)} target="_top" className="font-semibold">
          mosques.world
        </a>
      </p>
    </article>
  );
}
