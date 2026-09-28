import tzLookup from "tz-lookup";
import { z } from "zod";
import { bboxAround, haversineKm } from "@/lib/geo/distance";
import { encodeGeohash } from "@/lib/geo/geohash";
import { ulid } from "@/lib/id";
import { placeSlug, slugify, uniqueSlug } from "@/lib/slug";
import { AMENITY_KEYS, IQAMAH_PRAYERS } from "@/lib/trust/facts";

/** Duplicate check radius (spec P3: ≤ 150 m + trigram name similarity). */
export const DUPLICATE_RADIUS_M = 150;

function trigrams(value: string): Set<string> {
  const text = `  ${slugify(value).replaceAll("-", " ")} `;
  const grams = new Set<string>();
  for (let index = 0; index < text.length - 2; index += 1) grams.add(text.slice(index, index + 3));
  return grams;
}

/** Trigram (Jaccard) similarity of two names, 0–1, ignoring case, accents and punctuation. */
export function nameSimilarity(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared += 1;
  return Math.round((shared / (left.size + right.size - shared)) * 100) / 100;
}

export type NearbyPlace = { id: string; slug: string; name: string; locality: string | null; distanceM: number; similarity: number };

export async function nearbyPlaces(db: D1Database, input: { lat: number; lng: number; name: string }, radiusM = DUPLICATE_RADIUS_M): Promise<NearbyPlace[]> {
  const box = bboxAround(input.lat, input.lng, radiusM / 1000);
  const rows = await db
    .prepare(
      `SELECT id, slug, name, locality, lat, lng FROM place
       WHERE status IN ('active', 'pending') AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? LIMIT 50`,
    )
    .bind(box.south, box.north, box.west, box.east)
    .all<{ id: string; slug: string; name: string; locality: string | null; lat: number; lng: number }>();
  return (rows.results ?? [])
    .map((row) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      locality: row.locality,
      distanceM: Math.round(haversineKm(input.lat, input.lng, row.lat, row.lng) * 1000),
      similarity: nameSimilarity(input.name, row.name),
    }))
    .filter((row) => row.distanceM <= radiusM)
    .sort((a, b) => b.similarity - a.similarity || a.distanceM - b.distanceM);
}

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const newPlaceInput = z.object({
  name: z.string().trim().min(2, "Add the place's name.").max(120),
  kind: z.enum(["mosque", "prayer_room", "musalla", "eidgah"]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().trim().max(200).nullish().transform((value) => value || null),
  locality: z.string().trim().max(80).nullish().transform((value) => value || null),
  region: z.string().trim().max(80).nullish().transform((value) => value || null),
  country: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .nullish()
    .transform((value) => value?.toUpperCase() ?? null),
  accessNotes: z.string().trim().max(200).nullish().transform((value) => value || null),
  googlePlaceId: z.string().max(200).nullish().transform((value) => value || null),
  iqamah: z.partialRecord(z.enum(IQAMAH_PRAYERS), hm).default({}),
  amenities: z.partialRecord(z.enum(AMENITY_KEYS as [string, ...string[]]), z.boolean()).default({}),
  /** Nearby places the person said this is not; recorded for moderators. */
  notDuplicateOf: z.array(z.string().max(40)).max(10).default([]),
});
export type NewPlace = z.infer<typeof newPlaceInput>;

async function nearestCity(db: D1Database, lat: number, lng: number) {
  const box = bboxAround(lat, lng, 60);
  const rows = await db
    .prepare(`SELECT country_code, city_slug, name, lat, lng FROM city WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`)
    .bind(box.south, box.north, box.west, box.east)
    .all<{ country_code: string; city_slug: string; name: string; lat: number; lng: number }>();
  return (rows.results ?? []).sort((a, b) => haversineKm(lat, lng, a.lat, a.lng) - haversineKm(lat, lng, b.lat, b.lng))[0] ?? null;
}

export class PlaceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/**
 * Creates a place from the add form (flow F4). Location metadata is derived here: timezone from
 * the coordinates, calculation defaults from the country, city from the nearest known city.
 * New accounts' places start `pending` (visible to them and trusted members until confirmed).
 */
export async function createPlace(
  db: D1Database,
  input: NewPlace,
  actor: { id: string; trustLevel: number },
  now: number,
): Promise<{ id: string; slug: string; status: "active" | "pending"; timezone: string }> {
  const city = await nearestCity(db, input.lat, input.lng);
  const country = input.country ?? city?.country_code ?? null;
  if (!country) throw new PlaceError("We couldn't tell which country this is in. Pick the place from the search results.", 400);
  if (input.googlePlaceId) {
    const known = await db.prepare(`SELECT slug FROM place WHERE google_place_id = ?`).bind(input.googlePlaceId).first<{ slug: string }>();
    if (known) throw new PlaceError(`This place is already listed at /m/${known.slug}.`, 409);
  }
  const timezone = tzLookup(input.lat, input.lng);
  const defaults = await db
    .prepare(`SELECT calc_method, asr_madhab FROM calc_default WHERE country_code = ?`)
    .bind(country)
    .first<{ calc_method: string; asr_madhab: string }>();
  const sameCountryCity = city && city.country_code === country ? city : null;
  const citySlug = sameCountryCity?.city_slug ?? (slugify(input.locality ?? input.region ?? country) || "other");
  const locality = input.locality ?? sameCountryCity?.name ?? null;
  const base = placeSlug(input.name, locality) || "place";
  const taken = await db
    .prepare(`SELECT slug FROM place WHERE slug = ? OR slug LIKE ? UNION SELECT old_slug FROM place_slug_history WHERE old_slug = ? OR old_slug LIKE ?`)
    .bind(base, `${base}-%`, base, `${base}-%`)
    .all<{ slug: string }>();
  const slug = uniqueSlug(base, new Set((taken.results ?? []).map((row) => row.slug)));
  const id = ulid(now);
  const status = actor.trustLevel >= 1 ? "active" : "pending";

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO place (id, slug, name, kind, status, lat, lng, geohash6, address, locality, region, country_code, city_slug,
           timezone, calc_method, asr_madhab, google_place_id, google_latlng_fetched_at, created_by, access_notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        slug,
        input.name,
        input.kind,
        status,
        input.lat,
        input.lng,
        encodeGeohash(input.lat, input.lng),
        input.address,
        locality,
        input.region,
        country,
        citySlug,
        timezone,
        defaults?.calc_method ?? "MuslimWorldLeague",
        defaults?.asr_madhab ?? "shafi",
        input.googlePlaceId,
        input.googlePlaceId ? now : null,
        actor.id,
        input.accessNotes,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO city (country_code, city_slug, name, lat, lng, place_count) VALUES (?, ?, ?, ?, ?, 0)
         ON CONFLICT (country_code, city_slug) DO NOTHING`,
      )
      .bind(country, citySlug, locality ?? input.region ?? country, input.lat, input.lng),
    db
      .prepare(`INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at) VALUES (?, ?, ?, 'place_added', ?, ?)`)
      .bind(ulid(now), actor.id, id, JSON.stringify({ kind: input.kind, name: input.name }), now),
  ];
  for (const otherId of input.notDuplicateOf) {
    statements.push(
      db
        .prepare(
          `INSERT INTO place_duplicate_candidate (a_id, b_id, distance_m, name_similarity, status, created_at)
           SELECT ?, place.id, 0, 0, 'open', ? FROM place WHERE place.id = ? ON CONFLICT DO NOTHING`,
        )
        .bind(id, now, otherId),
    );
  }
  await db.batch(statements);
  if (input.notDuplicateOf.length) {
    const near = await nearbyPlaces(db, { lat: input.lat, lng: input.lng, name: input.name });
    for (const place of near.filter((item) => input.notDuplicateOf.includes(item.id))) {
      await db
        .prepare(`UPDATE place_duplicate_candidate SET distance_m = ?, name_similarity = ? WHERE a_id = ? AND b_id = ?`)
        .bind(place.distanceM, place.similarity, id, place.id)
        .run();
    }
  }
  return { id, slug, status, timezone };
}
