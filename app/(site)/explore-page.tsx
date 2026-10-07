import { headers } from "next/headers";
import { ExploreView } from "@/components/mw/explore-view";
import { appEnv } from "@/lib/db/client";
import { placesInBbox } from "@/lib/db/queries";
import { getPrayerDay, nextAdhanLabel, parseAdhanAdjust } from "@/lib/prayer/times";
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
  // A shared link like /search?where=Karachi has no coordinates: look the place up instead of
  // silently showing the visitor's own area under someone else's label.
  const where = one("where")?.trim();
  const hasPoint = Number.isFinite(Number(one("lat") ?? "x")) && Number.isFinite(Number(one("lng") ?? "x"));
  const found = where && !hasPoint ? await geocodeWhere(where, { cache: appEnv().CACHE }).catch(() => null) : null;
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
  const sort = asSort(one("sort"));
  const verifiedOnly = one("verified") === "1";
  const needs = parseNeeds(params.needs);
  const places = await placesInBbox(view.bbox, view.kind, { lat: view.lat, lng: view.lng }, { verifiedOnly, needs });
  const needsFill = await areaNeedsFill(appEnv().DB, view.bbox, Date.now()).catch((error: unknown) => {
    console.error("Area fill check failed", error);
    return false;
  });
  const cards = sortCards(
    places.map((place) => toCard(place, now, { photos: true })),
    sort,
  ).slice(0, 60);
  const anchor = places[0];
  let nextPrayer: { label: string; time: string } | null = null;
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
        nextPrayer = { label: next.label, time: formatTime12(next.time) };
        return `${view.where} · ${day.hijri}`;
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
      nextPrayer={nextPrayer}
      showGeoPrompt={view.source !== "url"}
      turnstileSiteKey={appEnv().TURNSTILE_SITE_KEY}
      sort={sort}
      verifiedOnly={verifiedOnly}
      needs={needs}
      fillBbox={needsFill ? view.bbox : null}
      areaTimes={places.length === 0 ? areaTimes(view.lat, view.lng, now, // The visitor's country only describes the area when the view is where they are, not a place they searched.
            await countryPreset(view.source !== "url" ? headerList.get("x-mw-country") : null)) : null}
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

/** The country's usual calculation (calc_default), for an area with no mosques to take it from. */
async function countryPreset(country: string | null): Promise<{ method: string; madhab: string } | null> {
  if (!country || !/^[A-Z]{2}$/i.test(country)) return null;
  const row = await appEnv()
    .DB.prepare(`SELECT calc_method, asr_madhab FROM calc_default WHERE country_code = ?`)
    .bind(country.toUpperCase())
    .first<{ calc_method: string; asr_madhab: string }>()
    .catch(() => null);
  return row ? { method: row.calc_method, madhab: row.asr_madhab } : null;
}
