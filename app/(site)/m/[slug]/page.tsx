import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Countdown, PrayerTable } from "@/components/mw/prayer-table";
import { TrackView } from "@/components/mw/track-view";
import { WaitlistForm } from "@/components/mw/waitlist-form";
import { placeBySlug } from "@/lib/db/queries";
import { getPrayerDay, nextAdhanLabel } from "@/lib/prayer/times";
import { isNonProductionHost, madhabOf, readNow } from "@/lib/places/present";
import { coverTint } from "@/lib/utils";
import { appEnv } from "@/lib/db/client";

export const dynamic = "force-dynamic";

type Params = { slug: string };

async function load(slug: string) {
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const place = await placeBySlug(slug);
  if (!place) return null;
  const now = readNow(headerList.get("x-mw-now"), isNonProductionHost(host));
  const day = getPrayerDay({
    lat: place.lat,
    lng: place.lng,
    timeZone: place.timezone,
    method: place.calcMethod,
    madhab: madhabOf(place.asrMadhab),
    highLat: place.highLatRule,
    now,
  });
  return { place, day, now, host };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await load(slug);
  if (!loaded) return { title: "Mosque" };
  const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
  return {
    title: loaded.place.name,
    description: `Today's adhan times at ${loaded.place.name}. Iqamah times are not yet added.`,
    alternates: { canonical: `/m/${loaded.place.slug}` },
    openGraph: { images: [`${base}/og/m/${loaded.place.slug}`] },
  };
}

export default async function MosquePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const loaded = await load(slug);
  if (!loaded) notFound();
  const { place, day, now } = loaded;
  const tint = coverTint(place.id);
  const next = nextAdhanLabel(day);
  const nextRow = day.rows.find((row) => row.key === day.nextKey) ?? day.rows[0];
  let base = "https://mosques.world";
  try {
    base = appEnv().PUBLIC_BASE_URL || base;
  } catch {
    base = process.env.PUBLIC_BASE_URL ?? base;
  }
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Mosque",
    name: place.name,
    url: `${base}/m/${place.slug}`,
    address: place.address,
    geo: { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng },
  };
  const maps = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`;
  const apple = `https://maps.apple.com/?daddr=${place.lat},${place.lng}`;

  return (
    <article className="mx-auto grid max-w-[1120px] gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:px-6">
      <TrackView goal="mosque_view" props={{ country: place.countryCode }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/cities/${place.countryCode.toLowerCase()}/${place.citySlug}`} className="hover:text-foreground">
            {place.locality ?? place.citySlug}
          </Link>
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{place.name}</h1>
        {place.nameLocal ? <p className="text-lg text-muted-foreground">{place.nameLocal}</p> : null}
        <p className="mt-2 text-sm text-muted-foreground">
          {place.kind === "prayer_room" ? "Prayer room" : "Mosque"}
          {place.address ? ` · ${place.address}` : ""}
        </p>
        <div
          className="mt-6 flex aspect-[16/7] items-end rounded-2xl p-6 text-sm font-semibold"
          style={{ background: tint.bg, color: "#1f1d1a" }}
        >
          Photo coming later · illustration
        </div>
        <section className="mt-8 rounded-2xl border border-border p-4">
          <h2 className="text-lg font-bold">Iqamah times not yet added</h2>
          <p className="mt-1 text-sm text-muted-foreground">Be the first, once accounts open. Adhan times below are calculated.</p>
          <WaitlistForm placeId={place.id} />
        </section>
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-xl font-bold">Today</h2>
            <p className="text-sm text-muted-foreground">
              {day.date} · {day.hijri}
            </p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border">
            <PrayerTable day={day} initialNow={now.toISOString()} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Adhan times are calculated with {place.calcMethod}, {place.asrMadhab} asr, in {place.timezone}. They are not the mosque&apos;s iqamah.
          </p>
        </section>
        <section className="mt-8 text-sm">
          <h2 className="text-xl font-bold">From OpenStreetMap</h2>
          <dl className="mt-3 space-y-2">
            {place.address ? (
              <div>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{place.address}</dd>
              </div>
            ) : null}
            {place.website ? (
              <div>
                <dt className="text-muted-foreground">Website</dt>
                <dd>
                  <a href={place.website} className="underline">
                    {place.website}
                  </a>
                </dd>
              </div>
            ) : null}
            {place.phone ? (
              <div>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{place.phone}</dd>
              </div>
            ) : null}
            {place.wheelchair ? (
              <div>
                <dt className="text-muted-foreground">Wheelchair</dt>
                <dd>{place.wheelchair} · from OpenStreetMap</dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>
      <aside className="h-fit rounded-2xl border border-border p-4 shadow-[0_6px_20px_rgba(31,29,26,.12)] lg:sticky lg:top-24">
        {nextRow ? <Countdown at={nextRow.at} label={next.label} /> : null}
        <div className="mt-4 flex flex-col gap-2">
          <a
            href={maps}
            data-testid="directions"
            className="inline-flex h-11 items-center justify-center rounded-[12px] bg-primary font-semibold text-primary-foreground"
          >
            Get directions
          </a>
          <a href={apple} className="text-center text-sm underline">
            Apple Maps
          </a>
        </div>
        <iframe
          title="Map"
          className="mt-4 h-40 w-full rounded-xl border-0"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${place.lng - 0.01}%2C${place.lat - 0.01}%2C${place.lng + 0.01}%2C${place.lat + 0.01}&layer=mapnik&marker=${place.lat}%2C${place.lng}`}
        />
        <p className="mt-2 text-xs text-muted-foreground">© OpenStreetMap contributors</p>
      </aside>
    </article>
  );
}
