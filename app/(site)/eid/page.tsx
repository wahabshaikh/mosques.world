import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TrackView } from "@/components/mw/track-view";
import { appEnv } from "@/lib/db/client";
import { formatDistance } from "@/lib/geo/distance";
import { isNonProductionHost, readNow } from "@/lib/places/present";
import { phase7Enabled } from "@/lib/phase";
import { eidNear, specialDates } from "@/lib/special";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eid prayers near you", description: "Eid al-Fitr and Eid al-Adha jamā'ah times at mosques and parks near you." };

const LONDON = { lat: 51.5074, lng: -0.1278 };

/** Seasonal explore mode (spec P7): upcoming Eid jamā'ahs near the visitor, soonest and nearest first. */
export default async function EidPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!(await phase7Enabled())) notFound();
  const params = await searchParams;
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const number = (value: unknown) => (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null);
  const lat = number(params.lat) ?? number(headerList.get("x-mw-latitude")) ?? LONDON.lat;
  const lng = number(params.lng) ?? number(headerList.get("x-mw-longitude")) ?? LONDON.lng;
  const now = readNow(headerList.get("x-mw-now"), isNonProductionHost(host));
  const today = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const items = await eidNear(appEnv().DB, { lat, lng, today });
  return (
    <div className="mx-auto max-w-[800px] px-4 py-10 lg:px-6">
      <TrackView goal="eid_search" props={{ results: String(items.length) }} />
      <h1 className="text-3xl font-bold tracking-tight">Eid prayers near you</h1>
      <p className="mt-2 text-muted-foreground">Jamā&apos;ah times the community has added for mosques and prayer grounds within 30 km.</p>
      {items.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-input p-8 text-center">
          <p className="font-semibold">No Eid times nearby yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Know your mosque&apos;s Eid times? Add them from its page.</p>
          <Link href="/" className="mt-4 inline-flex h-11 items-center rounded-[12px] bg-primary px-5 font-bold text-primary-foreground">
            Find your mosque
          </Link>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="rounded-2xl border border-input p-4" data-eid={item.placeSlug}>
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/m/${item.placeSlug}#special`} className="font-bold hover:underline">
                  {item.placeName}
                </Link>
                <span className="text-sm whitespace-nowrap text-muted-foreground">{formatDistance(item.distanceKm)}</span>
              </div>
              <p className="text-sm text-muted-foreground">
                {item.label} · {specialDates(item)}
                {item.locality ? ` · ${item.locality}` : ""}
              </p>
              <ul className="mt-2 text-sm">
                {item.lines.map((line) => (
                  <li key={line} className="tabular font-semibold">
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
