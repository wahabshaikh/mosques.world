import { CircleAlert } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UnsaveButton } from "@/components/mw/unsave-button";
import { savedPlaces } from "@/lib/db/queries";
import { isNonProductionHost } from "@/lib/environment";
import { readNow, toCard } from "@/lib/places/present";
import { enrichEnabled, phase4Enabled, phase5Enabled, phase7Enabled } from "@/lib/phase";
import { PlaceThumb } from "@/components/mw/place-row";
import { CalendarLink } from "@/components/mw/calendar-link";
import { appEnv } from "@/lib/db/client";
import { feedToken } from "@/lib/ics";
import { secretOf } from "@/lib/notify";
import { SavedWeek } from "@/components/mw/saved-week";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Saved places", robots: { index: false } };

/** Saved places with today's next iqamah and any "change reported" warning (spec 4.3 Saved). */
export default async function SavedPage() {
  if (!(await phase4Enabled())) notFound();
  const user = await requireUser("/saved");
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const now = readNow(headerList.get("x-mw-now"), isNonProductionHost(host));
  const photos = await enrichEnabled();
  const cards = (await savedPlaces(user.id)).map((place) => toCard(place, now, { photos }));
  const offline = await phase5Enabled();
  const feed = (await phase7Enabled()) ? `/calendar/${await feedToken(secretOf(appEnv(), host), user.id)}/saved.ics` : null;
  return (
    <div className="mx-auto max-w-[800px] px-4 py-10 lg:px-6">
      <h1 className="text-3xl font-bold tracking-tight">Saved</h1>
      <p className="mt-2 text-muted-foreground">Your mosques and today&apos;s next jamā&apos;ah.</p>
      {cards.length === 0 ? (
        <div className="mt-10 rounded-3xl border border-dashed border-input p-8 text-center">
          <p className="font-semibold">Nothing saved yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Tap Save on a mosque page to keep it here.</p>
          <Link href="/" className="mt-4 inline-flex h-11 items-center rounded-[12px] bg-primary px-5 font-bold text-primary-foreground">
            Find a mosque
          </Link>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col">
          {cards.map((card) => (
            <li key={card.id} className="flex items-center gap-4 border-b border-border py-4" data-saved={card.slug}>
              <PlaceThumb place={card} />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Link href={`/m/${card.slug}`} className="truncate font-bold hover:underline">
                  {card.name}
                </Link>
                <span className="truncate text-sm text-muted-foreground">{card.locality}</span>
                <span className="text-sm">
                  <strong>
                    {card.nextLabel} {card.nextTime}
                  </strong>{" "}
                  <span className="text-muted-foreground">
                    {card.nextKind === "iqamah" ? "iqamah" : "adhan"}
                    {card.minutesUntil !== null && card.minutesUntil >= 0 ? ` · in ${card.minutesUntil} min` : ""}
                  </span>
                </span>
                {card.changeReported ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-warning">
                    <CircleAlert className="size-3.5" aria-hidden="true" /> Change reported — check before you go
                  </span>
                ) : null}
              </span>
              <UnsaveButton placeId={card.id} name={card.name} />
            </li>
          ))}
        </ul>
      )}
      {offline && cards.length > 0 ? <SavedWeek /> : null}
      {feed && cards.length > 0 ? (
        <p className="mt-8 text-sm">
          <CalendarLink path={feed} label="Add your saved mosques' iqamah times to your calendar" scope="saved" />
        </p>
      ) : null}
    </div>
  );
}
