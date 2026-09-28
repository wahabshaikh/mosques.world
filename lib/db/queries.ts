import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { HighLatRule, AsrMadhab } from "@/lib/prayer/times";
import { haversineKm, type Bbox } from "@/lib/geo/distance";
import { needMasks, type NeedSlug } from "@/lib/places/amenities";
import { ftsMatch } from "@/lib/places/view";
import { appEnv, db } from "./client";
import { calcDefault, city, place, type PlaceRow } from "./schema";

export type DirectoryPlace = PlaceRow & { highLatRule: HighLatRule; distanceKm: number | null };

function asMadhab(value: string): AsrMadhab {
  return value === "hanafi" ? "hanafi" : "shafi";
}

function asHighLat(value: string | null): HighLatRule {
  if (value === "middleofthenight" || value === "seventhofthenight" || value === "twilightangle") {
    return value;
  }
  return "twilightangle";
}

function withMeta(row: PlaceRow, highLat: string | null, origin?: { lat: number; lng: number }): DirectoryPlace {
  return {
    ...row,
    asrMadhab: asMadhab(row.asrMadhab),
    highLatRule: asHighLat(highLat),
    distanceKm: origin ? haversineKm(origin.lat, origin.lng, row.lat, row.lng) : null,
  };
}

export async function placesInBbox(
  bbox: Bbox,
  kind: "all" | "mosque" | "prayer_room",
  origin: { lat: number; lng: number },
  options: { verifiedOnly?: boolean; needs?: NeedSlug[] } = {},
): Promise<DirectoryPlace[]> {
  const filters = [
    eq(place.status, "active"),
    gte(place.lat, bbox.south),
    lte(place.lat, bbox.north),
    gte(place.lng, bbox.west),
    lte(place.lng, bbox.east),
  ];
  if (kind !== "all") filters.push(eq(place.kind, kind));
  if (options.verifiedOnly) filters.push(inArray(place.verificationState, ["verified", "partial"]));
  if (options.needs?.length) {
    const masks = needMasks(options.needs);
    if (masks.all) filters.push(sql`(${place.amenityBits} & ${masks.all}) = ${masks.all}`);
    for (const mask of masks.any) filters.push(sql`(${place.amenityBits} & ${mask}) != 0`);
  }
  const rows = await db()
    .select({ place, highLat: calcDefault.highLatRule })
    .from(place)
    .leftJoin(calcDefault, eq(place.countryCode, calcDefault.countryCode))
    .where(and(...filters))
    .limit(500);
  return rows
    .map((row) => withMeta(row.place, row.highLat, origin))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

export async function placeBySlug(slug: string): Promise<DirectoryPlace | null> {
  const rows = await db()
    .select({ place, highLat: calcDefault.highLatRule })
    .from(place)
    .leftJoin(calcDefault, eq(place.countryCode, calcDefault.countryCode))
    .where(eq(place.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row || row.place.status === "hidden") return null;
  return withMeta(row.place, row.highLat);
}

export async function placesInCity(countryCode: string, citySlug: string): Promise<DirectoryPlace[]> {
  const rows = await db()
    .select({ place, highLat: calcDefault.highLatRule })
    .from(place)
    .leftJoin(calcDefault, eq(place.countryCode, calcDefault.countryCode))
    .where(
      and(
        eq(place.countryCode, countryCode.toUpperCase()),
        eq(place.citySlug, citySlug),
        eq(place.status, "active"),
      ),
    )
    .orderBy(asc(place.name))
    .limit(500);
  return rows.map((row) => withMeta(row.place, row.highLat));
}

export async function cityBySlug(countryCode: string, citySlug: string) {
  const rows = await db()
    .select()
    .from(city)
    .where(and(eq(city.countryCode, countryCode.toUpperCase()), eq(city.citySlug, citySlug)))
    .limit(1);
  return rows[0] ?? null;
}

export async function citiesInCountry(countryCode: string) {
  return db()
    .select()
    .from(city)
    .where(eq(city.countryCode, countryCode.toUpperCase()))
    .orderBy(asc(city.name));
}

export async function allCities() {
  return db().select().from(city).orderBy(asc(city.countryCode), asc(city.name));
}

export async function suggestPlaces(
  match: string,
): Promise<Array<{ label: string; lat: number; lng: number; kind: "city" | "place"; country?: string }>> {
  const like = `%${match.replaceAll("%", "")}%`;
  const cities = await db()
    .select()
    .from(city)
    .where(sql`lower(${city.name}) like lower(${like}) OR lower(${city.citySlug}) like lower(${like})`)
    .limit(6);
  const named = cities.map((row) => ({
    label: row.name,
    lat: row.lat,
    lng: row.lng,
    kind: "city" as const,
    country: row.countryCode,
  }));
  if (!match) return named;
  const ftsRows = await appFts(match);
  return [...named, ...ftsRows].slice(0, 8);
}

async function appFts(match: string) {
  const query = ftsMatch(match);
  if (!query) return [];
  const database = appEnv().DB;
  const result = await database
    .prepare(
      `SELECT place.name, place.locality, place.lat, place.lng
       FROM place_fts JOIN place ON place.rowid = place_fts.rowid
       WHERE place_fts MATCH ? AND place.status = 'active'
       LIMIT 6`,
    )
    .bind(query)
    .all<{ name: string; locality: string | null; lat: number; lng: number }>();
  return (result.results ?? []).map((row) => ({
    label: row.locality ? `${row.name}, ${row.locality}` : row.name,
    lat: row.lat,
    lng: row.lng,
    kind: "place" as const,
  }));
}

export async function sitemapEntries(): Promise<Array<{ path: string }>> {
  const database = appEnv().DB;
  const places = await database
    .prepare(`SELECT slug FROM place WHERE status = 'active' ORDER BY slug`)
    .all<{ slug: string }>();
  const cities = await database
    .prepare(`SELECT country_code, city_slug FROM city ORDER BY country_code, city_slug`)
    .all<{ country_code: string; city_slug: string }>();
  return [
    { path: "/" },
    { path: "/search" },
    { path: "/about" },
    { path: "/guidelines" },
    { path: "/privacy" },
    { path: "/terms" },
    { path: "/attribution" },
    ...(cities.results ?? []).flatMap((row) => [
      { path: `/countries/${row.country_code.toLowerCase()}` },
      { path: `/cities/${row.country_code.toLowerCase()}/${row.city_slug}` },
    ]),
    ...(places.results ?? []).map((row) => ({ path: `/m/${row.slug}` })),
  ];
}

/**
 * Where a /m/:slug request should go: the place itself, or a 308 target for renamed slugs and
 * merged places (spec 4.2 slugs, P3 merge). Follows at most three hops.
 */
export async function resolvePlaceSlug(slug: string): Promise<{ place: DirectoryPlace } | { redirect: string } | null> {
  let current = slug;
  for (let hop = 0; hop < 3; hop += 1) {
    const found = await placeBySlug(current);
    if (found && found.status === "merged" && found.mergedIntoId) {
      const target = await appEnv().DB.prepare(`SELECT slug FROM place WHERE id = ?`).bind(found.mergedIntoId).first<{ slug: string }>();
      if (!target) return null;
      current = target.slug;
      continue;
    }
    if (found) return current === slug ? { place: found } : { redirect: current };
    const history = await appEnv()
      .DB.prepare(`SELECT place.slug FROM place_slug_history JOIN place ON place.id = place_slug_history.place_id WHERE place_slug_history.old_slug = ?`)
      .bind(current)
      .first<{ slug: string }>();
    if (!history) return null;
    current = history.slug;
  }
  return current === slug ? null : { redirect: current };
}
