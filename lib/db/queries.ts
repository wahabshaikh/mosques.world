import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import type { HighLatRule, AsrMadhab } from "@/lib/prayer/times";
import { haversineKm, type Bbox } from "@/lib/geo/distance";
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
): Promise<DirectoryPlace[]> {
  const filters = [
    eq(place.status, "active"),
    gte(place.lat, bbox.south),
    lte(place.lat, bbox.north),
    gte(place.lng, bbox.west),
    lte(place.lng, bbox.east),
  ];
  if (kind !== "all") filters.push(eq(place.kind, kind));
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

export async function suggestPlaces(match: string): Promise<Array<{ label: string; lat: number; lng: number; kind: "city" | "place" }>> {
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
