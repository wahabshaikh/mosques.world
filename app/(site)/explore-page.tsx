import { headers } from "next/headers";
import { ExploreView } from "@/components/mw/explore-view";
import { appEnv } from "@/lib/db/client";
import { placesInBbox } from "@/lib/db/queries";
import { getPrayerDay, nextAdhanLabel } from "@/lib/prayer/times";
import { phase2Enabled, phase3Enabled } from "@/lib/phase";
import { parseNeeds } from "@/lib/places/amenities";
import { asSort, isNonProductionHost, madhabOf, readNow, sortCards, toCard } from "@/lib/places/present";
import { resolveExploreView } from "@/lib/places/view";

export async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const headerList = await headers();
  const host = headerList.get("host")?.split(":")[0] ?? "";
  const one = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const view = resolveExploreView({
    where: one("where"),
    lat: one("lat"),
    lng: one("lng"),
    z: one("z"),
    kind: one("kind"),
    bbox: one("bbox"),
    headerLat: headerList.get("x-mw-latitude"),
    headerLng: headerList.get("x-mw-longitude"),
  });
  const now = readNow(headerList.get("x-mw-now"), isNonProductionHost(host));
  const community = await phase2Enabled();
  const sort = community ? asSort(one("sort")) : "distance";
  const verifiedOnly = community && one("verified") === "1";
  const amenitiesOn = community && (await phase3Enabled());
  const needs = amenitiesOn ? parseNeeds(params.needs) : [];
  const places = await placesInBbox(view.bbox, view.kind, { lat: view.lat, lng: view.lng }, { verifiedOnly, needs });
  const cards = sortCards(
    places.map((place) => toCard(place, now)),
    sort,
  ).slice(0, 60);
  const anchor = places[0];
  const subline = anchor
    ? (() => {
        const day = getPrayerDay({
          lat: anchor.lat,
          lng: anchor.lng,
          timeZone: anchor.timezone,
          method: anchor.calcMethod,
          madhab: madhabOf(anchor.asrMadhab),
          highLat: anchor.highLatRule,
          now,
        });
        const next = nextAdhanLabel(day);
        return `${view.where} · ${day.hijri} · next ${next.label} ${next.time} adhan`;
      })()
    : `${view.where} · no places in this view yet`;

  return (
    <ExploreView
      places={cards}
      where={view.where}
      lat={view.lat}
      lng={view.lng}
      zoom={view.zoom}
      kind={view.kind}
      subline={subline}
      showGeoPrompt={view.source !== "url"}
      turnstileSiteKey={appEnv().TURNSTILE_SITE_KEY}
      sort={sort}
      verifiedOnly={verifiedOnly}
      community={community}
      needs={needs}
      amenities={amenitiesOn}
    />
  );
}
