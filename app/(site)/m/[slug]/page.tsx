import type { Metadata } from "next";
import { headers } from "next/headers";
import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Countdown, PrayerTable, type NextRow, type TableLabels } from "@/components/mw/prayer-table";
import { MiniMap } from "@/components/mw/mini-map";
import { DisputeBanner, ReportProblem, UpdateLink, ViewerProvider, type DisputeItem } from "@/components/mw/place-actions";
import { ActivityFeed, JumuahCards, TrustSummary } from "@/components/mw/place-trust";
import { TrackView } from "@/components/mw/track-view";
import { WaitlistForm } from "@/components/mw/waitlist-form";
import { appEnv } from "@/lib/db/client";
import { resolvePlaceSlug } from "@/lib/db/queries";
import { languageAlternates, localePath } from "@/lib/i18n/config";
import type { Translator } from "@/lib/i18n";
import { getTranslator } from "@/lib/i18n/server";
import { clientText } from "@/lib/i18n/client-messages";
import { stewardCount } from "@/lib/stewards";
import { eidSeason, specialDates, upcomingSpecial } from "@/lib/special";
import { MobileActionBar } from "@/components/mw/mobile-action-bar";
import { CalendarLink } from "@/components/mw/calendar-link";
import { CheckinButton } from "@/components/mw/checkin-button";
import { SaveButton, ShareButton } from "@/components/mw/place-header-actions";
import { defaultPrayer } from "@/lib/checkins";
import { parseEnrichment } from "@/lib/enrich/wikidata";
import { DirectionsLink } from "@/components/mw/directions-link";
import { currentUser, isModerator } from "@/lib/session";
import { placesContext } from "@/lib/places/context";
import { liveFields } from "@/lib/places/google";
import { ConfirmPlace } from "@/components/mw/confirm-place";
import { PhotoGrid } from "@/components/mw/photo-grid";
import { placePhotos } from "@/lib/media";
import { captchaRequired } from "@/lib/auth";
import { amenityRows, amenitySummary } from "@/lib/places/amenities";
import { AmenityList } from "@/components/mw/amenity-list";
import { getPrayerDay, nextAdhanLabel, parseAdhanAdjust } from "@/lib/prayer/times";
import { iqamahCells, jumuahCards, nextRows, trustHeadline } from "@/lib/places/mosque";
import { isNonProductionHost } from "@/lib/environment";
import { madhabOf, readNow } from "@/lib/places/present";
import { describeValue, factLabel, formatTime12, iqamahValue, madhabLabel, methodLabel, resolveIqamah } from "@/lib/trust/facts";
import { placeActivity, placeFacts, placeTrustStats } from "@/lib/trust/read";
import { coverTint } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Params = { slug: string };

async function load(slug: string) {
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const resolved = await resolvePlaceSlug(slug);
  if (!resolved) return null;
  if ("redirect" in resolved) permanentRedirect((await getTranslator()).href(`/m/${resolved.redirect}`));
  const place = resolved.place;
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
  return { place, day, now, host };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await load(slug);
  const l = await getTranslator();
  if (!loaded) return { title: l.t("mosque.mosque") };
  const base = process.env.PUBLIC_BASE_URL ?? "https://mosques.world";
  const hasIqamah = Boolean(loaded.place.iqamahSummaryJson);
  const path = `/m/${loaded.place.slug}`;
  const languages = languageAlternates(path);
  return {
    title: loaded.place.name,
    description: l.t(hasIqamah ? "mosque.metaWith" : "mosque.metaWithout", { name: loaded.place.name }),
    alternates: { canonical: localePath(l.locale, path), ...(languages ? { languages } : {}) },
    openGraph: { images: [`${base}/og/m/${loaded.place.slug}`] },
  };
}

export default async function MosquePage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { slug } = await params;
  const loaded = await load(slug);
  if (!loaded) notFound();
  const { place, now } = loaded;
  const l = await getTranslator();
  const english = l.locale === "en";
  // Row labels and clock style in the page's language, for display only: anything that does time arithmetic reads loaded.day.
  const day = {
    ...loaded.day,
    rows: loaded.day.rows.map((row) => ({ ...row, label: english ? row.label : l.prayer(row.key, row.key === "dhuhr" && loaded.day.jumuah), adhan: l.adhan(row.adhan) })),
  };
  const labels = english ? undefined : tableLabels(l);
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
  const stewards = await stewardCount(appEnv().DB, place.id);
  const specials = await upcomingSpecial(appEnv().DB, place.id, day.date);
  const eidTime = eidSeason(now, place.timezone);
  const database = appEnv().DB;
  const [facts, activity, stats] = await Promise.all([
    placeFacts(database, place.id, day.date),
    placeActivity(database, place.id),
    placeTrustStats(database, place.id, nowMs),
  ]);
  const cells = iqamahCells(facts, loaded.day, nowMs, l);
  const jumuah = jumuahCards(facts, l);
  const hasIqamah = Object.keys(cells).length > 0 || jumuah.length > 0;
  const tint = coverTint(place.id);
  const rows: NextRow[] = hasIqamah
    ? nextRows(loaded.day, cells, facts, nowMs, l)
    : (() => {
        const next = nextAdhanLabel(day);
        const row = day.rows.find((item) => item.key === day.nextKey) ?? day.rows[0];
        return row ? [{ key: row.key, label: english ? next.label : row.label, adhan: row.adhan, adhanAt: row.at }] : [];
      })();
  const disputes: DisputeItem[] = facts.flatMap((fact) => {
    if (!fact.challenger || !fact.current || !fact.key.startsWith("iqamah.")) return [];
    const adhan = loaded.day.rows.find((row) => `iqamah.${row.key}` === fact.key)?.adhan ?? "00:00";
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
  const headline = trustHeadline(place.verificationState, l);
  const trustSentence = stats && stats.recentConfirmers > 0 ? l.plural("trust.confirmedBy", stats.recentConfirmers) : l.t("trust.fromCommunity");
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
  const updateHref = l.href(`/m/${place.slug}/update`);
  const amenities = amenityRows(facts);
  const google = place.googlePlaceId ? await liveFields(placesContext(appEnv(), loaded.host), place.googlePlaceId).catch(() => null) : null;
  const closed = place.status === "closed";
  const enrichment = parseEnrichment(place.enrichmentJson);
  const photos = await placePhotos(appEnv().DB, place.id, 5);
  const photoCount = photos.length < 5 ? photos.length : ((await appEnv().DB.prepare(`SELECT COUNT(*) AS n FROM photo WHERE place_id = ? AND status = 'approved' AND purpose IN ('place', 'evidence')`).bind(place.id).first<{ n: number }>())?.n ?? photos.length);
  const summaryLine = [
    l.t(place.kind === "prayer_room" ? "mosque.prayerRoom" : "mosque.mosque"),
    jumuah.length > 0 ? l.plural("mosque.jumuahCount", jumuah.length) : null,
    ...amenitySummary(amenities),
  ]
    .filter(Boolean)
    .join(" · ");

  const content = (
    <article
      data-place-id={place.id}
      className={`mx-auto grid max-w-[1120px] gap-8 px-4 py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16 lg:px-6 ${"pb-28 lg:pb-8"}`}
    >
      <TrackView goal="mosque_view" props={{ country: place.countryCode }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">
          <Link href={l.href(`/cities/${place.countryCode.toLowerCase()}/${place.citySlug}`)} prefetch={false} className="hover:text-foreground">
            {place.locality ?? place.citySlug}
          </Link>
        </p>
        <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <h1 className="min-w-0 text-3xl font-bold tracking-tight">{place.name}</h1>
          <div className="-ms-3 flex shrink-0 gap-1 sm:-me-3 sm:ms-0">
            <ShareButton title={place.name} path={`/m/${place.slug}`} />
            <SaveButton placeId={place.id} />
          </div>
        </div>
        {place.nameLocal ? (
          <p className={`text-lg text-muted-foreground ${/[\u0600-\u06FF]/.test(place.nameLocal) ? "font-arabic" : ""}`}>{place.nameLocal}</p>
        ) : null}
        <p className="mt-2 text-sm text-muted-foreground">
          {summaryLine}
          {place.address ? ` · ${place.address}` : ""}
        </p>
        {justAdded ? (
          <p role="status" className="mt-4 rounded-2xl bg-primary-soft px-4 py-3 text-sm font-semibold text-primary">
            {l.t("mosque.justAdded")}
          </p>
        ) : null}
        {place.status === "pending" ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm">
            <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-bold text-background">{l.t("mosque.new")}</span>
            <span className="flex-1">{l.t("mosque.pending")}</span>
            {viewerCanConfirm ? <ConfirmPlace placeId={place.id} /> : null}
          </div>
        ) : null}
        {closed ? (
          <p role="status" className="mt-4 rounded-2xl bg-muted px-4 py-3 text-sm font-semibold">
            {l.t("mosque.closed")}
          </p>
        ) : null}
        {place.accessNotes ? <p className="mt-2 text-sm">{l.t("mosque.access", { notes: place.accessNotes })}</p> : null}
        <section className="mt-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{l.t("mosque.today")}</h2>
              <p className="text-sm text-muted-foreground">
                {l.date(day.date)} · {l.hijri(day)}
              </p>
            </div>
            <UpdateLink href={updateHref} className="text-sm font-bold underline">
              {l.t("mosque.update")}
            </UpdateLink>
          </div>
          {!(hasIqamah) ? (
            <section className="mb-4 flex flex-col gap-3 rounded-2xl bg-muted p-4 sm:flex-row sm:items-center" aria-labelledby="no-iqamah">
              <div className="flex-1">
                <h3 id="no-iqamah" className="font-bold">
                  {l.t("mosque.notAddedTitle")}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {l.t("mosque.beFirst")} {l.t("mosque.adhanCalculated")}
                </p>
              </div>
              <UpdateLink href={updateHref} className="inline-flex h-11 shrink-0 items-center justify-center rounded-[12px] bg-secondary px-4 text-sm font-semibold text-secondary-foreground">
                {l.t("mosque.addIqamah")}
              </UpdateLink>
            </section>
          ) : null}
          <div className="overflow-hidden rounded-2xl border border-input">
            <PrayerTable
              day={day}
              initialNow={now.toISOString()}
              // With nothing set yet, one "Add iqamah times" button above the table beats an "Add" on every row.
              extras={{ iqamah: cells, addHref: hasIqamah ? updateHref : undefined, jumuahNote: jumuah.length > 0 ? l.t("mosque.jumuahToday") : undefined }}
              labels={labels}
            />
            {disputes.map((item) => (
              <DisputeBanner key={item.factKey} item={item} />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {l.t("mosque.calcNote", { method: methodLabel(place.calcMethod), madhab: madhabLabel(place.asrMadhab), zone: place.timezone })}
            {place.adhanAdjustJson ? l.t("mosque.adhanCommunity") : null}
            {l.t("mosque.communityNote")}
            <Link href={l.href(`/m/${place.slug}/history`)} className="font-semibold text-foreground underline">
              {l.t("mosque.history")}
            </Link>
            <>
              {" · "}
              <UpdateLink href={`${updateHref}?tab=adhan`} className="font-semibold text-foreground underline">
                {l.t("mosque.adhanDiffers")}
              </UpdateLink>
            </>
            <>
              {" · "}
              <Link href={l.href(`/m/${place.slug}/timetable`)} className="font-semibold text-foreground underline">
                {l.t("mosque.monthly")}
              </Link>
              {" · "}
              <CalendarLink path={`/m/${place.slug}/calendar.ics`} label={l.t("mosque.calendar")} scope="place" />
            </>
          </p>
          {!(hasIqamah) ? <WaitlistForm placeId={place.id} /> : null}
        </section>

        {hasIqamah ? (
          <div className="mt-8 flex flex-col gap-6">
            <TrustSummary
              title={headline.title}
              tone={headline.tone}
              sentence={trustSentence}
              // One person always "agrees" with themselves; a percentage only means something once others have voted.
              agreement={stats && stats.contributors >= 2 ? stats.agreement : null}
              lastCheck={place.lastVerifiedAt}
            />
            <p className="border-b border-border pb-6 text-[15px] font-semibold">
              {l.plural("trust.keptBy", stats?.contributors ?? 0)}
              {stewards > 0 ? (
                <span className="mt-1 flex items-center gap-1.5 text-primary" data-testid="steward-badge">
                  <ShieldCheck className="size-4" aria-hidden="true" /> {l.plural("trust.stewards", stewards)}
                </span>
              ) : null}
            </p>
          </div>
        ) : null}

        {jumuah.length > 0 ? (
          <section className="mt-8 border-t border-border pt-8">
            <h2 className="mb-4 text-xl font-bold">{l.t("mosque.jumuah")}</h2>
            <JumuahCards cards={jumuah} />
          </section>
        ) : null}

        {(specials.length > 0 || eidTime) ? (
          <section id="special" className="mt-8 scroll-mt-24 border-t border-border pt-8" aria-labelledby="special-heading">
            <h2 id="special-heading" className="mb-4 text-xl font-bold">
              {l.t("mosque.special")}
            </h2>
            {specials.length === 0 ? (
              <p className="text-sm text-muted-foreground">{l.t("mosque.noEid")}</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {specials.map((item) => (
                  <li key={item.id} className="rounded-2xl border border-input p-4" data-special={item.kind}>
                    <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{item.label}</p>
                    <p className="mt-1 font-semibold">{specialDates(item)}</p>
                    <ul className="mt-1 text-sm">
                      {item.lines.map((line) => (
                        <li key={line} className="tabular">
                          {line}
                        </li>
                      ))}
                    </ul>
                    {item.notes ? <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p> : null}
                    {item.author ? <p className="mt-2 text-xs text-muted-foreground">{l.t("mosque.addedBy", { user: item.author })}</p> : null}
                  </li>
                ))}
              </ul>
            )}
            <Link href={l.href(`/m/${place.slug}/special`)} className="mt-4 inline-block text-sm font-semibold underline">
              {l.t("mosque.addSpecial")}
            </Link>
          </section>
        ) : null}
        {specials.length === 0 && !eidTime ? (
          <p className="mt-6 text-sm">
            <Link href={l.href(`/m/${place.slug}/special`)} className="font-semibold underline">
              {l.t("mosque.addSpecial")}
            </Link>
          </p>
        ) : null}

        <PhotoGrid
          photos={photos}
          total={photoCount}
          tint={tint}
          slug={place.slug}
          placeId={place.id}
          canAdd={!closed}
          commons={enrichment?.image ?? null}
          turnstileSiteKey={captchaRequired(appEnv(), loaded.host) ? appEnv().TURNSTILE_SITE_KEY : undefined}
          text={english ? undefined : clientText(l.locale)}
        />


        <section className="mt-8 border-t border-border pt-8" aria-labelledby="offers">
          <h2 id="offers" className="mb-5 text-xl font-bold">
            {l.t("mosque.offers")}
          </h2>
          {amenities.length > 0 ? (
            <AmenityList rows={amenities} />
          ) : (
            <p className="text-sm text-muted-foreground">{l.t("mosque.noFacilities")}</p>
          )}
          <UpdateLink href={`${updateHref}?tab=amenities`} className="mt-5 inline-flex h-12 items-center rounded-[10px] border border-foreground px-5 text-[15px] font-semibold">
            {l.t(amenities.length > 0 ? "mosque.suggestEdit" : "mosque.addFacilities")}
          </UpdateLink>
        </section>

        <section className="mt-8 text-sm">
          <h2 className="text-xl font-bold">{l.t(enrichment ? "mosque.about" : "mosque.fromOsm")}</h2>
          {enrichment?.wikipedia ? (
            <div className="mt-3" data-testid="wikipedia-summary">
              <p className="text-[15px] leading-6">{enrichment.wikipedia.extract}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                <a href={enrichment.wikipedia.url} className="underline" rel="noopener">
                  {l.t("mosque.fromWikipedia")}
                </a>
              </p>
            </div>
          ) : null}
          {enrichment?.inception ? <p className="mt-3">{l.t("mosque.founded", { year: enrichment.inception })}</p> : null}
          <dl className="mt-3 space-y-2">
            {place.address ? (
              <div>
                <dt className="text-muted-foreground">{l.t("mosque.address")}</dt>
                <dd>{place.address}</dd>
              </div>
            ) : null}
            {place.website ? (
              <div>
                <dt className="text-muted-foreground">{l.t("mosque.website")}</dt>
                <dd>
                  <a href={place.website} className="underline" rel="nofollow noopener">
                    {displayUrl(place.website)}
                  </a>
                </dd>
              </div>
            ) : null}
            {place.phone ? (
              <div>
                <dt className="text-muted-foreground">{l.t("mosque.phone")}</dt>
                <dd>{place.phone}</dd>
              </div>
            ) : null}
            {place.wheelchair ? (
              <div>
                <dt className="text-muted-foreground">{l.t("mosque.wheelchair")}</dt>
                <dd>{l.t("mosque.wheelchairOsm", { value: place.wheelchair })}</dd>
              </div>
            ) : null}
          </dl>
          {enrichment ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {l.t("mosque.sources")} ·{" "}
              <a href={`https://www.wikidata.org/wiki/${enrichment.wikidata}`} className="underline" rel="noopener">
                {enrichment.wikidata}
              </a>
            </p>
          ) : null}
          {google && (google.phone || google.website || google.hours.length > 0) ? (
            <div className="mt-6" data-testid="google-fields">
              <h3 className="font-bold">{l.t("mosque.fromGoogle")}</h3>
              <dl className="mt-2 space-y-2">
                {google.phone ? (
                  <div>
                    <dt className="text-muted-foreground">{l.t("mosque.phone")}</dt>
                    <dd>{google.phone}</dd>
                  </div>
                ) : null}
                {google.website ? (
                  <div>
                    <dt className="text-muted-foreground">{l.t("mosque.website")}</dt>
                    <dd>
                      <a href={google.website} className="underline" rel="nofollow noopener">
                        {google.website}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {google.hours.length > 0 ? (
                  <div>
                    <dt className="text-muted-foreground">{l.t("mosque.hours")}</dt>
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
              <p className="mt-2 text-xs text-muted-foreground">{l.t("mosque.poweredByGoogle")}</p>
            </div>
          ) : null}
          <p className="mt-6">
            <Link href={l.href(`/m/${place.slug}/steward`)} className="font-semibold underline">
              {l.t("mosque.involved")}
            </Link>
          </p>
          <p className="mt-6">
            {l.t("mosque.missing")}{" "}
            <UpdateLink href={updateHref} className="font-semibold underline">
              {l.t("mosque.suggestEdit")}
            </UpdateLink>
          </p>
        </section>
      </div>
      <aside className="flex flex-col gap-6">
        <div className="z-10 h-fit rounded-2xl border border-input bg-card p-5 shadow-[0_6px_20px_rgba(31,29,26,.12)] lg:sticky lg:top-24">
          <Countdown rows={rows} initialNow={now.toISOString()} labels={labels} />
          <div className="mt-4 flex flex-col gap-2">
            <DirectionsLink
              lat={place.lat}
              lng={place.lng}
              label={l.t("mosque.directions")}
              className="inline-flex h-12 items-center justify-center rounded-[12px] bg-primary font-bold text-primary-foreground"
            />
            {!closed ? (
              <CheckinButton placeId={place.id} placeName={place.name} defaultPrayer={defaultPrayer(day, now)} jumuah={day.jumuah} today={day.date} />
            ) : null}
          </div>
        </div>
        <div className="flex justify-center">
          <ReportProblem
            placeId={place.id}
            facts={["fajr", "dhuhr", "asr", "maghrib", "isha"].map((prayer) => ({ key: `iqamah.${prayer}`, label: `${factLabel(`iqamah.${prayer}`)} iqamah` }))}
          />
        </div>
        <div className="overflow-hidden rounded-2xl border border-input">
          <MiniMap lat={place.lat} lng={place.lng} label={l.t("mosque.map")} />
        </div>
        <section>
          <h2 className="mb-4 text-lg font-bold">{l.t("mosque.activity")}</h2>
          <ActivityFeed items={activity} now={nowMs} />
        </section>
      </aside>
      {!closed ? <MobileActionBar rows={rows} initialNow={now.toISOString()} placeId={place.id} /> : null}
    </article>
  );

  return <ViewerProvider placeId={place.id}>{content}</ViewerProvider>;
}

function tableLabels(l: Translator): TableLabels {
  return {
    caption: l.t("table.caption"),
    prayer: l.t("table.prayer"),
    adhan: l.t("table.adhan"),
    iqamah: l.t("table.iqamah"),
    community: l.t("table.community"),
    next: l.t("table.next"),
    notAdded: l.t("table.notAdded"),
    noJamaah: l.t("table.noJamaah"),
    add: l.t("table.add"),
    nextPrayer: l.t("countdown.next"),
    inTime: l.t("countdown.in"),
    adhanIqamah: l.t("countdown.adhanIqamah"),
    calculated: l.t("countdown.calculated"),
    iqamahWord: l.t("countdown.iqamah"),
    minutes: l.t("duration.minutes"),
    hours: l.t("duration.hours"),
    hoursMinutes: l.t("duration.hoursMinutes"),
  };
}

/** "http://www.example.org/" → "example.org", for links people read rather than copy. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}
