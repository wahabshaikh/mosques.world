import { headers } from "next/headers";
import { ExploreView } from "@/components/mw/explore-view";
import { appEnv } from "@/lib/db/client";
import { placesInBbox } from "@/lib/db/queries";
import { getPrayerDay, nextAdhanLabel, parseAdhanAdjust } from "@/lib/prayer/times";
import { enrichEnabled, osmEnabled, phase2Enabled, phase3Enabled } from "@/lib/phase";
import { geocodeWhere } from "@/lib/geocode";
import { formatTime12 } from "@/lib/trust/facts";
import { areaNeedsFill } from "@/lib/osm-fill";
import { parseNeeds } from "@/lib/places/amenities";
import { isNonProductionHost } from "@/lib/environment";
import { asSort, madhabOf, readNow, sortCards, toCard } from "@/lib/places/present";
import { resolveExploreView } from "@/lib/places/view";
import { areaTimes } from "@/lib/places/area-times";

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
  const osm = await osmEnabled();
  // A shared link like /search?where=Karachi has no coordinates: look the place up instead of
  // silently showing the visitor's own area under someone else's label.
  const where = one("where")?.trim();
  const hasPoint = Number.isFinite(Number(one("lat") ?? "x")) && Number.isFinite(Number(one("lng") ?? "x"));
  const found = osm && where && !hasPoint ? await geocodeWhere(where, { cache: appEnv().CACHE }).catch(() => null) : null;
  const view = resolveExploreView({
    where: found?.label ?? one("where"),
    lat: found?.lat != null ? String(found.lat) : one("lat"),
    lng: found?.lng != null ? String(found.lng) : one("lng"),
    z: found ? String(zoomForArea(found.bbox)) : one("z"),
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
  const photos = await enrichEnabled();
  const places = await placesInBbox(view.bbox, view.kind, { lat: view.lat, lng: view.lng }, { verifiedOnly, needs });
  const needsFill = osm
    ? await areaNeedsFill(appEnv().DB, view.bbox, Date.now()).catch((error: unknown) => {
        console.error("Area fill check failed", error);
        return false;
      })
    : false;
  const cards = sortCards(
    places.map((place) => toCard(place, now, { photos })),
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
          adjust: parseAdhanAdjust(anchor.adhanAdjustJson),
          now,
        });
        const next = nextAdhanLabel(day);
        return `${view.where} · ${day.hijri} · next ${next.label} adhan ${formatTime12(next.time)}`;
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
      fillBbox={needsFill ? view.bbox : null}
      osm={osm}
      areaTimes={places.length === 0 ? areaTimes(view.lat, view.lng, now) : null}
    />
  );
}

/** Map zoom that roughly fits a geocoded area (a country needs ~5, a city ~11). */
function zoomForArea(bbox: { west: number; east: number; south: number; north: number } | null | undefined): number {
  if (!bbox) return 12;
  const span = Math.max(bbox.east - bbox.west, bbox.north - bbox.south);
  if (span > 20) return 4;
  if (span > 8) return 5;
  if (span > 3) return 7;
  if (span > 1) return 9;
  if (span > 0.3) return 11;
  return 13;
}
