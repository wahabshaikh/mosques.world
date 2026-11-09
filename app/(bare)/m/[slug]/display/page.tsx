import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { LobbyBoard } from "@/components/mw/lobby-board";
import { TrackView } from "@/components/mw/track-view";
import { appEnv } from "@/lib/db/client";
import { placeBySlug, resolvePlaceSlug } from "@/lib/db/queries";
import { isNonProductionHost } from "@/lib/environment";
import { uses12h } from "@/lib/i18n/config";
import { getTranslator } from "@/lib/i18n/server";
import { nextCongregation, readPublicBoard } from "@/lib/masjid-pro";
import { iqamahCells } from "@/lib/places/mosque";
import { madhabOf, readNow } from "@/lib/places/present";
import { getPrayerDay, parseAdhanAdjust } from "@/lib/prayer/times";
import { placeFacts } from "@/lib/trust/read";

export const dynamic = "force-dynamic";

async function load(slug: string) {
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const resolved = await resolvePlaceSlug(slug);
  if (!resolved) return null;
  if ("redirect" in resolved) return { redirect: resolved.redirect };
  const place = resolved.place;
  if (place.status !== "active" && place.status !== "closed") return null;
  const l = await getTranslator();
  const now = readNow(headerList.get("x-mw-now"), isNonProductionHost(host));
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
  const board = await readPublicBoard(appEnv().DB, place.id, now.getTime());
  const iqamahAt: Partial<Record<string, string>> = {};
  for (const [key, cell] of Object.entries(cells)) if (cell?.at) iqamahAt[key] = cell.at;
  const next = nextCongregation(day.rows, iqamahAt, now.getTime());
  return { place, day, cells, board, next, now, l };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const place = await placeBySlug((await params).slug).catch(() => null);
  return { title: place ? `${place.name} lobby` : "Lobby display", robots: { index: false, follow: false } };
}

export default async function LobbyDisplayPage({ params }: { params: Promise<{ slug: string }> }) {
  const loaded = await load((await params).slug);
  if (!loaded) notFound();
  if ("redirect" in loaded) permanentRedirect(`/m/${loaded.redirect}/display`);
  const { place, day, cells, board, next, now, l } = loaded;
  const rows = day.rows.map((row) => ({
    key: row.key,
    label: l.prayer(row.key, row.key === "dhuhr" && day.jumuah),
    adhan: l.time(row.adhan),
    iqamah: row.key === "sunrise" ? null : (cells[row.key]?.label ?? null),
    next: row.key === next?.key,
  }));
  return (
    <>
      <TrackView goal="pro_display_view" />
      <LobbyBoard
        name={place.name}
        locality={place.locality}
        dateLabel={l.date(day.date)}
        hijri={l.hijri(day)}
        timeZone={place.timezone}
        initialIso={now.toISOString()}
        hour12={uses12h(l.locale)}
        reloadAt={next?.at ?? null}
        rows={rows}
        adhanLabel={l.t("display.adhan")}
        prayerHeading={l.t("table.prayer")}
        iqamahLabel={l.t("display.iqamah")}
        nextLabel={l.t("display.next")}
        emptyIqamah={l.t("display.noIqamah")}
        notice={board?.notice ?? null}
        noticeLabel={l.t("mosque.committeeNotice")}
        donationUrl={board?.donationUrl ?? null}
        donationLabel={board?.donationLabel || l.t("display.donate")}
        published={l.t("display.published")}
        entitled={Boolean(board)}
        preview={l.t("display.preview")}
        previewHref={l.href("/for-mosques")}
        forCommittees={l.t("display.forCommittees")}
      />
    </>
  );
}
