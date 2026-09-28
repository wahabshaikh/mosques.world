import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Countdown, PrayerTable, type NextRow } from "@/components/mw/prayer-table";
import { DisputeBanner, ReportProblem, UpdateLink, ViewerProvider, type DisputeItem } from "@/components/mw/place-actions";
import { ActivityFeed, JumuahCards, TrustSummary } from "@/components/mw/place-trust";
import { TrackView } from "@/components/mw/track-view";
import { WaitlistForm } from "@/components/mw/waitlist-form";
import { appEnv } from "@/lib/db/client";
import { resolvePlaceSlug } from "@/lib/db/queries";
import { phase2Enabled, phase3Enabled, phase4Enabled } from "@/lib/phase";
import { CheckinButton } from "@/components/mw/checkin-button";
import { SaveButton, ShareButton } from "@/components/mw/place-header-actions";
import { defaultPrayer } from "@/lib/checkins";
import { currentUser, isModerator } from "@/lib/session";
import { placesContext } from "@/lib/places/context";
import { liveFields } from "@/lib/places/google";
import { ConfirmPlace } from "@/components/mw/confirm-place";
import { PhotoGrid } from "@/components/mw/photo-grid";
import { placePhotos } from "@/lib/media";
import { captchaRequired } from "@/lib/auth";
import { amenityRows, amenitySummary } from "@/lib/places/amenities";
import { AmenityList } from "@/components/mw/amenity-list";
import { getPrayerDay, nextAdhanLabel } from "@/lib/prayer/times";
import { iqamahCells, jumuahCards, nextRows, trustHeadline } from "@/lib/places/mosque";
import { isNonProductionHost, madhabOf, readNow } from "@/lib/places/present";
import { describeValue, factLabel, formatTime12, iqamahValue, resolveIqamah } from "@/lib/trust/facts";
import { placeActivity, placeFacts, placeTrustStats } from "@/lib/trust/read";
import { coverTint } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { slug: string };

async function load(slug: string) {
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const resolved = await resolvePlaceSlug(slug);
  if (!resolved) return null;
  if ("redirect" in resolved) permanentRedirect(`/m/${resolved.redirect}`);
  const place = resolved.place;
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
  const hasIqamah = Boolean(loaded.place.iqamahSummaryJson);
  return {
    title: loaded.place.name,
    description: hasIqamah
      ? `Today's adhan and community-verified iqamah times at ${loaded.place.name}.`
      : `Today's adhan times at ${loaded.place.name}. Iqamah times are not yet added.`,
    alternates: { canonical: `/m/${loaded.place.slug}` },
    openGraph: { images: [`${base}/og/m/${loaded.place.slug}`] },
  };
}

export default async function MosquePage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const loaded = await load(slug);
  if (!loaded) notFound();
  const { place, day, now } = loaded;
  const justAdded = (await searchParams).added === "1";
  let viewerCanConfirm = false;
  if (place.status === "pending") {
    // New places from new accounts: visible to their creator and trusted members only (spec P3).
    const viewer = await currentUser();
    const allowed = viewer && (viewer.id === place.createdBy || viewer.trustLevel >= 2 || isModerator(viewer));
    if (!allowed) notFound();
    viewerCanConfirm = viewer.id !== place.createdBy && viewer.trustLevel >= 1;
  }
  const nowMs = now.getTime();
  const contributions = await phase2Enabled();
  const places = contributions && (await phase3Enabled());
  const profiles = places && (await phase4Enabled());
  const database = appEnv().DB;
  const [facts, activity, stats] = contributions
    ? await Promise.all([
        placeFacts(database, place.id, day.date),
        placeActivity(database, place.id),
        placeTrustStats(database, place.id, nowMs),
      ])
    : [[], [], null];
  const cells = iqamahCells(facts, day, nowMs);
  const jumuah = jumuahCards(facts);
  const hasIqamah = Object.keys(cells).length > 0 || jumuah.length > 0;
  const tint = coverTint(place.id);
  const rows: NextRow[] = hasIqamah
    ? nextRows(day, cells, facts, nowMs)
    : (() => {
        const next = nextAdhanLabel(day);
        const row = day.rows.find((item) => item.key === day.nextKey) ?? day.rows[0];
        return row ? [{ key: row.key, label: next.label, adhan: row.adhan, adhanAt: row.at }] : [];
      })();
  const disputes: DisputeItem[] = facts.flatMap((fact) => {
    if (!fact.challenger || !fact.current || !fact.key.startsWith("iqamah.")) return [];
    const adhan = day.rows.find((row) => `iqamah.${row.key}` === fact.key)?.adhan ?? "00:00";
    const label = (value: unknown) => {
      const parsed = iqamahValue.safeParse(value);
      return parsed.success ? formatTime12(resolveIqamah(parsed.data, adhan)) : describeValue(fact.key, value);
    };
    return [
      {
        factKey: fact.key,
        label: factLabel(fact.key),
        currentId: fact.current.candidateId,
        currentLabel: label(fact.current.value),
        challengerId: fact.challenger.candidateId,
        challengerLabel: label(fact.challenger.value),
        challengerPeople: fact.challenger.backers,
      },
    ];
  });
  const headline = trustHeadline(place.verificationState);
  const trustSentence =
    stats && stats.recentConfirmers > 0
      ? `Timings confirmed by ${stats.recentConfirmers} ${stats.recentConfirmers === 1 ? "person" : "people"} this month. Each time shows who checked it and when.`
      : "Iqamah times here come from the community. Confirm them when you see the board.";
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
  const updateHref = `/m/${place.slug}/update`;
  const amenities = places ? amenityRows(facts) : [];
  const google = places && place.googlePlaceId ? await liveFields(placesContext(appEnv(), loaded.host), place.googlePlaceId).catch(() => null) : null;
  const closed = place.status === "closed";
  const photos = places ? await placePhotos(appEnv().DB, place.id, 5) : [];
  const photoCount = photos.length < 5 ? photos.length : ((await appEnv().DB.prepare(`SELECT COUNT(*) AS n FROM photo WHERE place_id = ? AND status = 'approved' AND purpose IN ('place', 'evidence')`).bind(place.id).first<{ n: number }>())?.n ?? photos.length);
  const summaryLine = [
    place.kind === "prayer_room" ? "Prayer room" : "Mosque",
    jumuah.length > 0 ? `${jumuah.length} Jumu'ah jamā'ah${jumuah.length === 1 ? "" : "s"}` : null,
    ...amenitySummary(amenities),
  ]
    .filter(Boolean)
    .join(" · ");

  const content = (
    <article data-place-id={place.id} className="mx-auto grid max-w-[1120px] gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16 lg:px-6">
      <TrackView goal="mosque_view" props={{ country: place.countryCode }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">
          <Link href={`/cities/${place.countryCode.toLowerCase()}/${place.citySlug}`} className="hover:text-foreground">
            {place.locality ?? place.citySlug}
          </Link>
        </p>
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <h1 className="min-w-0 text-3xl font-bold tracking-tight">{place.name}</h1>
          {profiles ? (
            <div className="-ml-3 flex shrink-0 gap-1 sm:-mr-3 sm:ml-0">
              <ShareButton title={place.name} path={`/m/${place.slug}`} />
              <SaveButton placeId={place.id} />
            </div>
          ) : null}
        </div>
        {place.nameLocal ? <p className="text-lg text-muted-foreground">{place.nameLocal}</p> : null}
        <p className="mt-2 text-sm text-muted-foreground">
          {summaryLine}
          {place.address ? ` · ${place.address}` : ""}
        </p>
        {justAdded ? (
          <p role="status" className="mt-4 rounded-2xl bg-primary-soft px-4 py-3 text-sm font-semibold text-primary">
            You added this place. JazakAllahu khayran — add photos or times any time.
          </p>
        ) : null}
        {place.status === "pending" ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
            <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-background">New</span>
            <span className="flex-1">Waiting for a contributor to confirm it exists. It becomes public after 24 hours if nobody reports a problem.</span>
            {viewerCanConfirm ? <ConfirmPlace placeId={place.id} /> : null}
          </div>
        ) : null}
        {closed ? (
          <p role="status" className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm font-semibold">
            This place is reported closed.
          </p>
        ) : null}
        {place.accessNotes ? <p className="mt-2 text-sm">Access: {place.accessNotes}</p> : null}
        {places ? (
          <PhotoGrid
            photos={photos}
            total={photoCount}
            tint={tint}
            slug={place.slug}
            placeId={place.id}
            canAdd={!closed}
            turnstileSiteKey={captchaRequired(appEnv(), loaded.host) ? appEnv().TURNSTILE_SITE_KEY : undefined}
          />
        ) : (
          <div
            className="mt-6 flex aspect-[16/7] items-end rounded-2xl p-6 text-sm font-semibold"
            style={{ background: tint.bg, color: "#1f1d1a" }}
          >
            Photo coming later · illustration
          </div>
        )}

        {contributions && hasIqamah ? (
          <div className="mt-8 flex flex-col gap-6">
            <TrustSummary
              title={headline.title}
              tone={headline.tone}
              sentence={trustSentence}
              agreement={stats?.agreement ?? null}
              lastCheck={place.lastVerifiedAt}
            />
            <p className="border-b border-border pb-6 text-[15px] font-semibold">
              Kept up to date by {stats?.contributors ?? 0} {stats?.contributors === 1 ? "contributor" : "contributors"}
            </p>
          </div>
        ) : (
          <section className="mt-8 rounded-2xl border border-border p-4">
            <h2 className="text-lg font-bold">Iqamah times not yet added</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {contributions ? "Be the first: add them from the mosque's board." : "Be the first, once accounts open."} Adhan times below are
              calculated.
            </p>
            {contributions ? (
              <UpdateLink href={updateHref} className="mt-3 inline-flex h-11 items-center rounded-[12px] bg-secondary px-4 text-sm font-semibold text-secondary-foreground">
                Add iqamah times
              </UpdateLink>
            ) : null}
            <WaitlistForm placeId={place.id} />
          </section>
        )}

        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Today&apos;s prayer times</h2>
              <p className="text-sm text-muted-foreground">
                {day.date} · {day.hijri}
              </p>
            </div>
            {contributions ? (
              <UpdateLink href={updateHref} className="text-sm font-bold underline">
                Update timings
              </UpdateLink>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-2xl border border-input">
            <PrayerTable
              day={day}
              initialNow={now.toISOString()}
              extras={contributions ? { iqamah: cells, addHref: updateHref, jumuahNote: jumuah.length > 0 ? "Jumu'ah today · see below" : undefined } : undefined}
            />
            {disputes.map((item) => (
              <DisputeBanner key={item.factKey} item={item} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Adhan times are calculated with {place.calcMethod}, {place.asrMadhab} asr, in {place.timezone}. They are not the mosque&apos;s iqamah.
            {contributions ? " Iqamah times come from the mosque and are kept current by the community. " : null}
            {contributions ? (
              <Link href={`/m/${place.slug}/history`} className="font-semibold text-foreground underline">
                History of these times
              </Link>
            ) : null}
          </p>
        </section>

        {jumuah.length > 0 ? (
          <section className="mt-8 border-t border-border pt-8">
            <h2 className="mb-4 text-xl font-bold">Jumu&apos;ah</h2>
            <JumuahCards cards={jumuah} />
          </section>
        ) : null}

        {places ? (
          <section className="mt-8 border-t border-border pt-8" aria-labelledby="offers">
            <h2 id="offers" className="mb-5 text-xl font-bold">
              What this place offers
            </h2>
            {amenities.length > 0 ? (
              <AmenityList rows={amenities} />
            ) : (
              <p className="text-sm text-muted-foreground">No facilities added yet. Know if there&apos;s a women&apos;s section or wudhu area?</p>
            )}
            <UpdateLink href={`${updateHref}?tab=amenities`} className="mt-5 inline-flex h-12 items-center rounded-[10px] border border-foreground px-5 text-[15px] font-semibold">
              {amenities.length > 0 ? "Suggest an edit" : "Add facilities"}
            </UpdateLink>
          </section>
        ) : null}

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
          {google && (google.phone || google.website || google.hours.length > 0) ? (
            <div className="mt-6" data-testid="google-fields">
              <h3 className="font-bold">From Google</h3>
              <dl className="mt-2 space-y-2">
                {google.phone ? (
                  <div>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>{google.phone}</dd>
                  </div>
                ) : null}
                {google.website ? (
                  <div>
                    <dt className="text-muted-foreground">Website</dt>
                    <dd>
                      <a href={google.website} className="underline" rel="nofollow noopener">
                        {google.website}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {google.hours.length > 0 ? (
                  <div>
                    <dt className="text-muted-foreground">Opening hours</dt>
                    <dd>
                      <ul>
                        {google.hours.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">Powered by Google</p>
            </div>
          ) : null}
          {contributions ? (
            <p className="mt-6">
              Something missing?{" "}
              <UpdateLink href={updateHref} className="font-semibold underline">
                Suggest an edit
              </UpdateLink>
            </p>
          ) : null}
        </section>
      </div>
      <aside className="flex flex-col gap-6">
        <div className="h-fit rounded-2xl border border-input p-5 shadow-[0_6px_20px_rgba(31,29,26,.12)] lg:sticky lg:top-24">
          <Countdown rows={rows} initialNow={now.toISOString()} />
          <div className="mt-4 flex flex-col gap-2">
            <a
              href={maps}
              data-testid="directions"
              className="inline-flex h-12 items-center justify-center rounded-[12px] bg-primary font-bold text-primary-foreground"
            >
              Get directions
            </a>
            <a href={apple} className="text-center text-sm underline">
              Apple Maps
            </a>
            {profiles && !closed ? (
              <CheckinButton placeId={place.id} placeName={place.name} defaultPrayer={defaultPrayer(day, now)} jumuah={day.jumuah} today={day.date} />
            ) : null}
          </div>
        </div>
        {contributions ? (
          <div className="flex justify-center">
            <ReportProblem
              placeId={place.id}
              reasons={places}
              facts={["fajr", "dhuhr", "asr", "maghrib", "isha"].map((prayer) => ({ key: `iqamah.${prayer}`, label: `${factLabel(`iqamah.${prayer}`)} iqamah` }))}
            />
          </div>
        ) : null}
        <div className="overflow-hidden rounded-2xl border border-input">
          <iframe
            title="Map"
            className="h-48 w-full border-0"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${place.lng - 0.01}%2C${place.lat - 0.01}%2C${place.lng + 0.01}%2C${place.lat + 0.01}&layer=mapnik&marker=${place.lat}%2C${place.lng}`}
          />
          <p className="px-4 py-2 text-xs text-muted-foreground">© OpenStreetMap contributors</p>
        </div>
        {contributions ? (
          <section>
            <h2 className="mb-4 text-lg font-bold">Recent community activity</h2>
            <ActivityFeed items={activity} now={nowMs} />
          </section>
        ) : null}
      </aside>
    </article>
  );

  return contributions ? <ViewerProvider placeId={place.id}>{content}</ViewerProvider> : content;
}
