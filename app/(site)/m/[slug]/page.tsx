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
import { TimesCheck } from "@/components/mw/times-check";
import { placeHelpers } from "@/lib/hasanat";
import { reminderFor } from "@/lib/reminders";
import type { AmenityRow } from "@/lib/places/amenities";
import type { IqamahCell } from "@/components/mw/prayer-table";
import type { JumuahCard } from "@/lib/places/mosque";
import type { TimetableDay } from "@/lib/sources/timetable";
import type { PrayerDay } from "@/lib/prayer/times";
import { CalendarLink } from "@/components/mw/calendar-link";
import { CheckinButton } from "@/components/mw/checkin-button";
import { SaveButton, ShareButton } from "@/components/mw/place-header-actions";
import { defaultPrayer } from "@/lib/checkins";
import { parseEnrichment } from "@/lib/enrich/wikidata";
import { DirectionsLink } from "@/components/mw/directions-link";
import { currentUser, isModerator } from "@/lib/session";
import { placesContext } from "@/lib/places/context";
import { GOOGLE_PLACES_IN_USE, liveFields } from "@/lib/places/google";
import { ConfirmPlace } from "@/components/mw/confirm-place";
import { PhotoGrid } from "@/components/mw/photo-grid";
import { placePhotos } from "@/lib/media";
import { captchaRequired } from "@/lib/auth";
import { amenityRows, amenitySummary } from "@/lib/places/amenities";
import { AmenityList } from "@/components/mw/amenity-list";
import { getPrayerDay, parseAdhanAdjust } from "@/lib/prayer/times";
import { iqamahCells, jumuahCards, nextRows, timetableRows, trustHeadline } from "@/lib/places/mosque";
import { isNonProductionHost } from "@/lib/environment";
import { madhabOf, readNow } from "@/lib/places/present";
import { describeValue, factLabel, formatTime12, iqamahValue, madhabLabel, methodLabel, resolveIqamah } from "@/lib/trust/facts";
import { placeActivity, placeFacts, placeTrustStats } from "@/lib/trust/read";
import { coverTint } from "@/lib/utils";
import { LinkTimetable } from "@/components/mw/link-timetable";
import { MosqueTimetable } from "@/components/mw/mosque-timetable";
import { parseTimetable, PROVIDER_LABELS, timetableOn } from "@/lib/sources/timetable";
import { formatHm } from "@/lib/prayer/times";

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
    rows: loaded.day.rows.map((row) => ({ ...row, label: l.prayer(row.key, row.key === "dhuhr" && loaded.day.jumuah), adhan: l.adhan(row.adhan) })),
  };
  // The bare calculation for the location, before any community adhan adjustment: shown on its own, labelled.
  const calculatedRows = getPrayerDay({
    lat: place.lat,
    lng: place.lng,
    timeZone: place.timezone,
    method: place.calcMethod,
    madhab: madhabOf(place.asrMadhab),
    highLat: place.highLatRule,
    now,
  }).rows.map((row) => ({ key: row.key, label: l.prayer(row.key, row.key === "dhuhr" && loaded.day.jumuah), adhan: l.adhan(row.adhan) }));
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
  // The mosque's own published timetable (Mawaqit, Masjidal), shown apart from community-reported times.
  const timetable = parseTimetable(place.timetableJson);
  const ownDay = timetableOn(timetable, loaded.day.date);
  const jumuah = jumuahCards(facts, l);
  const hasIqamah = Object.keys(cells).length > 0 || jumuah.length > 0;
  const tint = coverTint(place.id);
  const rows: NextRow[] = ownDay && timetable
    ? timetableRows(loaded.day, ownDay, PROVIDER_LABELS[timetable.p], l)
    : hasIqamah
    ? nextRows(loaded.day, cells, facts, nowMs, l)
    : [];
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
  const enrichmentForLd = parseEnrichment(place.enrichmentJson);
  let base = "https://mosques.world";
  try {
    base = appEnv().PUBLIC_BASE_URL || base;
  } catch {
    base = process.env.PUBLIC_BASE_URL ?? base;
  }
  const placeUrl = `${base}${l.href(`/m/${place.slug}`)}`;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Mosque",
      "@id": `${placeUrl}#mosque`,
      name: place.name,
      ...(place.nameLocal ? { alternateName: place.nameLocal } : {}),
      url: placeUrl,
      ...(place.address ? { address: { "@type": "PostalAddress", streetAddress: place.address, addressLocality: place.locality ?? undefined, addressCountry: place.countryCode } } : {}),
      geo: { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng },
      hasMap: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
      isAccessibleForFree: true,
      publicAccess: true,
      ...(place.website ? { sameAs: [place.website] } : {}),
      ...(place.phone ? { telephone: place.phone } : {}),
      ...(enrichmentForLd?.wikidata ? { identifier: enrichmentForLd.wikidata } : {}),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: place.countryCode, item: `${base}${l.href(`/countries/${place.countryCode.toLowerCase()}`)}` },
        { "@type": "ListItem", position: 2, name: place.locality ?? place.citySlug, item: `${base}${l.href(`/cities/${place.countryCode.toLowerCase()}/${place.citySlug}`)}` },
        { "@type": "ListItem", position: 3, name: place.name, item: placeUrl },
      ],
    },
  ];
  const updateHref = l.href(`/m/${place.slug}/update`);
  const amenities = amenityRows(facts);
  const google = GOOGLE_PLACES_IN_USE && place.googlePlaceId ? await liveFields(placesContext(appEnv(), loaded.host), place.googlePlaceId).catch(() => null) : null;
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

  const path = `/m/${place.slug}`;
  const ownAdhan = Boolean(place.adhanAdjustJson);
  const candidates = Object.values(cells)
    .filter((cell): cell is NonNullable<typeof cell> => Boolean(cell) && !disputes.some((item) => item.factKey === cell?.factKey))
    .map((cell) => ({ candidateId: cell.candidateId, factKey: cell.factKey }));
  const helpers = await placeHelpers(database, place.id);
  const hasTimes = hasIqamah || Boolean(ownDay);
  // Only rows with a real jamā'ah time drive the "next prayer" card: never the calculated adhan.
  const nextJamaahRows = hasTimes ? rows.filter((row) => row.iqamah) : [];
  const cityHref = l.href(`/cities/${place.countryCode.toLowerCase()}/${place.citySlug}`);
  const cityName = place.locality ?? place.citySlug;
  const faq = faqItems({ l, name: place.name, address: place.address, cells, own: ownDay, jumuahDay: loaded.day.jumuah, jumuah, amenities, day: loaded.day });

  const content = (
    <article
      data-place-id={place.id}
      className="mx-auto grid max-w-[1120px] gap-8 px-4 pt-4 pb-32 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-16 lg:px-6 lg:pt-8 lg:pb-12"
    >
      <TrackView goal="mosque_view" props={{ country: place.countryCode }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([...jsonLd, faqJsonLd(faq)]) }} />
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            <li>
              <Link href={l.href(`/countries/${place.countryCode.toLowerCase()}`)} prefetch={false} className="hover:text-foreground">
                {place.countryCode}
              </Link>
            </li>
            <li aria-hidden="true">›</li>
            <li>
              <Link href={cityHref} prefetch={false} className="hover:text-foreground">
                {cityName}
              </Link>
            </li>
          </ol>
        </nav>
        <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-tight lg:text-[32px]">{place.name}</h1>
        {place.nameLocal ? (
          <p className={`text-lg text-muted-foreground ${/[؀-ۿ]/.test(place.nameLocal) ? "font-arabic" : ""}`}>{place.nameLocal}</p>
        ) : null}
        <p className="mt-1 text-[15px] text-muted-foreground">
          {summaryLine}
          {place.address ? ` · ${place.address}` : ""}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <DirectionsLink
            lat={place.lat}
            lng={place.lng}
            label={l.t("mosque.directions")}
            className="inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
          />
          <div className="ms-auto flex gap-1">
            <ShareButton title={place.name} path={path} />
            <SaveButton placeId={place.id} />
          </div>
        </div>
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
        {place.accessNotes ? <p className="mt-3 text-sm">{l.t("mosque.access", { notes: place.accessNotes })}</p> : null}

        <section id="times" className="mt-8 scroll-mt-24 border-t border-border pt-6" aria-labelledby="times-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 id="times-heading" className="text-[22px] font-extrabold tracking-tight">
                {l.t("mosque.jamaahToday")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {l.date(day.date)} · {l.hijri(day)}
              </p>
            </div>
            <UpdateLink href={updateHref} className="shrink-0 text-sm font-bold underline">
              {l.t("mosque.update")}
            </UpdateLink>
          </div>
          {ownDay && timetable ? (
            <MosqueTimetable
              day={ownDay}
              nowLocal={formatHm(now, place.timezone)}
              jumuahToday={loaded.day.jumuah}
              sourceUrl={timetable.url}
              labels={{
                title: l.t("source.title"),
                via: l.t("source.via", { provider: PROVIDER_LABELS[timetable.p], age: l.relative(timetable.at, nowMs) }),
                prayer: l.t("table.prayer"),
                adhan: l.t("table.adhan"),
                iqamah: l.t("table.iqamah"),
                jumuah: ownDay.j?.length ? l.t("source.jumuah", { times: ownDay.j.map((time) => l.time(time)).join(" · ") }) : null,
                prayers: { fajr: l.prayer("fajr"), dhuhr: l.prayer("dhuhr", loaded.day.jumuah), asr: l.prayer("asr"), maghrib: l.prayer("maghrib"), isha: l.prayer("isha") },
                time: (hm) => l.time(hm),
              }}
            />
          ) : null}
          {ownDay ? (
            <h3 className="mt-6 mb-2 text-sm font-bold tracking-wide text-muted-foreground uppercase" data-testid="community-heading">
              {l.t("source.community")}
            </h3>
          ) : null}
          {hasIqamah || (ownAdhan && !ownDay) ? (
            <div className="overflow-hidden rounded-2xl border border-border">
              <PrayerTable
                day={day}
                initialNow={now.toISOString()}
                showAdhan={ownAdhan}
                extras={{ iqamah: cells, addHref: updateHref, jumuahNote: jumuah.length > 0 ? l.t("mosque.jumuahToday") : undefined }}
                labels={tableLabels(l)}
              />
              {disputes.map((item) => (
                <DisputeBanner key={item.factKey} item={item} />
              ))}
            </div>
          ) : null}
          {hasIqamah && !closed ? (
            <TimesCheck mode="confirm" candidates={candidates} placeName={place.name} path={path} updateHref={updateHref} reminder={reminderFor("confirm", place.slug)} helpers={helpers} />
          ) : null}
          {ownAdhan && !ownDay ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {l.t("mosque.calcNote", { method: methodLabel(place.calcMethod), madhab: madhabLabel(place.asrMadhab), zone: place.timezone })}
              {l.t("mosque.adhanCommunity")}
            </p>
          ) : null}
          {!hasTimes && !closed ? (
            <div className={ownAdhan ? "mt-4" : undefined}>
            <TimesCheck mode="add" candidates={[]} placeName={place.name} path={path} updateHref={updateHref} reminder={reminderFor("add", place.slug)} helpers={helpers} />
            </div>
          ) : null}
          {hasIqamah ? (
            <p className="mt-3 text-xs text-muted-foreground">
              {l.t("mosque.communityNote")}
              <Link href={l.href(`/m/${place.slug}/history`)} className="font-semibold text-foreground underline">
                {l.t("mosque.history")}
              </Link>
            </p>
          ) : null}
          {!ownDay ? (
            <LinkTimetable
              placeId={place.id}
              labels={{ title: l.t("source.linkTitle"), hint: l.t("source.linkHint"), button: l.t("source.linkButton"), linked: l.t("source.linked") }}
            />
          ) : null}
          {!hasTimes ? <WaitlistForm placeId={place.id} /> : null}
        </section>

        <section className="mt-8 rounded-3xl bg-muted p-4 sm:p-5" aria-labelledby="calculated-heading" data-testid="calculated-times">
          <h2 id="calculated-heading" className="font-bold">
            {l.t("mosque.calculatedTitle")}
          </h2>
          <table className="mt-2 w-full text-sm">
            <caption className="sr-only">{l.t("mosque.calculatedTitle")}</caption>
            <tbody>
              {calculatedRows.map((row) => (
                <tr key={row.key} className="border-t border-border first:border-t-0" data-calculated={row.key}>
                  <th scope="row" className="py-2 text-start font-semibold">
                    {row.label}
                  </th>
                  <td className="tabular py-2 text-end font-semibold">{row.adhan}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            {l.t("mosque.calculatedNote", { method: `${methodLabel(place.calcMethod)}, ${madhabLabel(place.asrMadhab)} Asr` })}
{" "}
            <UpdateLink href={`${updateHref}?tab=adhan`} className="font-semibold text-foreground underline">
              {l.t("mosque.adhanDiffers")}
            </UpdateLink>
            {" · "}
            <Link href={l.href(`/m/${place.slug}/timetable`)} className="font-semibold text-foreground underline">
              {l.t("mosque.monthly")}
            </Link>
            {" · "}
            <CalendarLink path={`/m/${place.slug}/calendar.ics`} label={l.t("mosque.calendar")} scope="place" />
          </p>
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
                  <li key={item.id} className="rounded-2xl border border-border p-4" data-special={item.kind}>
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
          <UpdateLink href={`${updateHref}?tab=amenities`} className="mt-5 inline-flex h-12 items-center rounded-xl border border-foreground px-5 text-[15px] font-semibold">
            {l.t(amenities.length > 0 ? "mosque.suggestEdit" : "mosque.addFacilities")}
          </UpdateLink>
        </section>

        <section className="mt-8 border-t border-border pt-8 text-sm">
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
        </section>

        <section className="mt-8 border-t border-border pt-8" aria-labelledby="faq-heading">
          <h2 id="faq-heading" className="text-xl font-bold">
            {l.t("mosque.faq")}
          </h2>
          <dl className="mt-4 divide-y divide-border" data-testid="faq">
            {faq.map((item) => (
              <div key={item.q} className="py-3">
                <dt className="font-semibold">{item.q}</dt>
                <dd className="mt-1 text-[15px] text-muted-foreground">{item.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm">
            <Link href={l.href(`/m/${place.slug}/steward`)} className="font-semibold underline">
              {l.t("mosque.involved")}
            </Link>
            {" · "}
            {l.t("mosque.missing")}{" "}
            <UpdateLink href={updateHref} className="font-semibold underline">
              {l.t("mosque.suggestEdit")}
            </UpdateLink>
          </p>
          {specials.length === 0 && !eidTime ? (
            <p className="mt-3 text-sm">
              <Link href={l.href(`/m/${place.slug}/special`)} className="font-semibold underline">
                {l.t("mosque.addSpecial")}
              </Link>
            </p>
          ) : null}
        </section>
      </div>
      <aside className="flex flex-col gap-6">
        <div className="z-10 hidden h-fit rounded-3xl border border-border bg-card p-5 shadow-card lg:sticky lg:top-24 lg:block">
          {nextJamaahRows.length > 0 ? (
            <Countdown rows={nextJamaahRows} initialNow={now.toISOString()} labels={tableLabels(l)} showAdhan={ownAdhan || Boolean(ownDay)} />
          ) : (
            <div>
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{l.t("countdown.next")}</p>
              <p className="mt-1 text-lg font-bold">{l.t("mosque.notAddedTitle")}</p>
              <UpdateLink href={updateHref} className="mt-3 inline-flex h-11 items-center rounded-xl bg-secondary px-4 text-sm font-semibold text-secondary-foreground">
                {l.t("mosque.addIqamah")}
              </UpdateLink>
            </div>
          )}
        </div>
        {!closed ? (
          <div className="flex flex-col lg:-mt-2">
            <CheckinButton placeId={place.id} placeName={place.name} defaultPrayer={defaultPrayer(day, now)} jumuah={day.jumuah} today={day.date} />
          </div>
        ) : null}
        <div className="overflow-hidden rounded-3xl border border-border">
          <MiniMap lat={place.lat} lng={place.lng} label={l.t("mosque.map")} />
        </div>
        <section>
          <h2 className="mb-4 text-lg font-bold">{l.t("mosque.activity")}</h2>
          <ActivityFeed items={activity} now={nowMs} />
        </section>
        <div className="flex justify-center">
          <ReportProblem
            placeId={place.id}
            facts={["fajr", "dhuhr", "asr", "maghrib", "isha"].map((prayer) => ({ key: `iqamah.${prayer}`, label: `${factLabel(`iqamah.${prayer}`)} iqamah` }))}
          />
        </div>
      </aside>
      {!closed ? <MobileActionBar rows={nextJamaahRows} initialNow={now.toISOString()} placeId={place.id} addHref={hasTimes ? undefined : updateHref} /> : null}
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
    fixed: l.t("table.fixed"),
    afterAdhan: l.t("table.afterAdhan"),
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

/**
 * Plain questions with one-sentence answers, written from the same data as the page: what people ask
 * search engines and assistants ("What time is Jumu'ah at …?"), answered without the calculated adhan.
 */
function faqItems(input: {
  l: Translator;
  name: string;
  address: string | null;
  cells: Partial<Record<string, IqamahCell>>;
  own: TimetableDay | null | undefined;
  jumuahDay: boolean;
  jumuah: JumuahCard[];
  amenities: AmenityRow[];
  day: PrayerDay;
}): Array<{ q: string; a: string }> {
  const { l, name } = input;
  const prayers = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
  const times = prayers
    .map((prayer) => {
      const own = input.own?.i?.[prayer];
      const label = own ? l.time(own) : input.cells[prayer]?.label;
      return label ? `${l.prayer(prayer)} ${label}` : null;
    })
    .filter(Boolean)
    .join(", ");
  const items = [{ q: l.t("faq.iqamahQ", { name }), a: times ? l.t("faq.iqamahA", { name, times }) : l.t("faq.iqamahNone", { name }) }];
  const jumuahTimes = input.own?.j?.length ? input.own.j.map((time) => l.time(time)) : input.jumuah.map((card) => card.time);
  if (jumuahTimes.length > 0) items.push({ q: l.t("faq.jumuahQ", { name }), a: l.t("faq.jumuahA", { name, times: jumuahTimes.join(", ") }) });
  if (input.address) items.push({ q: l.t("faq.whereQ", { name }), a: l.t("faq.whereA", { name, address: input.address }) });
  const women = input.amenities.find((row) => row.key === "amenity.women_section");
  if (women) items.push({ q: l.t("faq.womenQ", { name }), a: l.t(women.available ? "faq.womenYes" : "faq.womenNo", { name }) });
  return items;
}

/** FAQPage structured data for the same questions shown on the page. */
function faqJsonLd(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
  };
}
