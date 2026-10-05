import { clearKeyCache, keyFrom, lookupKey, touchKey } from "@/lib/api-keys";
import { placeById, resolvePlaceSlug, type DirectoryPlace } from "@/lib/db/queries";
import { amenityRows } from "@/lib/places/amenities";
import { iqamahCells, localInstant } from "@/lib/places/mosque";
import { madhabOf } from "@/lib/places/present";
import { formatHm, getPrayerDay, type PrayerDay, parseAdhanAdjust } from "@/lib/prayer/times";
import { iqamahValue, jumuahValue } from "@/lib/trust/facts";
import type { FactView } from "@/lib/trust/read";

/**
 * Public read API (spec P8): keyed, rate-limited, CORS-open JSON. Times come from the same code as
 * the mosque page (`getPrayerDay` + `iqamahCells`), so the API and the page always agree.
 */

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, X-API-Key",
  "Access-Control-Max-Age": "86400",
};

export function apiError(message: string, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error: message, docs: "/developers" }, { status, headers: { ...CORS, ...headers } });
}

type GuardEnv = { DB: D1Database; RL_API?: RateLimit };

/** Checks the key and the per-key rate limit; returns the headers to add to the response, or an error. */
export async function guardKey(request: Request, env: GuardEnv, now = Date.now()): Promise<{ headers: Record<string, string> } | { response: Response }> {
  if (request.method === "OPTIONS") return { response: new Response(null, { status: 204, headers: CORS }) };
  const key = keyFrom(request);
  if (!key) return { response: apiError("An API key is required. Send it as `Authorization: Bearer <key>`.", 401) };
  const row = await lookupKey(env.DB, key, now);
  if (!row || row.revoked_at !== null) return { response: apiError("That API key is not valid.", 401) };
  if (env.RL_API) {
    const { success } = await env.RL_API.limit({ key: row.id });
    if (!success) return { response: apiError(`Rate limit reached (${row.rate_limit} requests a minute).`, 429, { "Retry-After": "60" }) };
  }
  await touchKey(env.DB, row, now);
  return { headers: { ...CORS, "X-RateLimit-Limit": String(row.rate_limit), "Cache-Control": "private, max-age=60" } };
}

export { clearKeyCache };

export function placeUrl(base: string, slug: string) {
  return `${base}/m/${slug}`;
}

/** A place as a GeoJSON Feature ([lng, lat], RFC 7946). */
export function placeFeature(place: DirectoryPlace, base: string) {
  return {
    type: "Feature" as const,
    id: place.id,
    geometry: { type: "Point" as const, coordinates: [round(place.lng), round(place.lat)] },
    properties: {
      id: place.id,
      slug: place.slug,
      name: place.name,
      name_local: place.nameLocal,
      kind: place.kind,
      status: place.status,
      address: place.address,
      locality: place.locality,
      country: place.countryCode,
      timezone: place.timezone,
      verification: place.verificationState,
      last_verified_at: iso(place.lastVerifiedAt),
      osm: place.osmType && place.osmId ? `${place.osmType}/${place.osmId}` : null,
      url: placeUrl(base, place.slug),
    },
  };
}

function round(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

function iso(at: number | null | undefined) {
  return at ? new Date(at).toISOString() : null;
}

/** Standing (undated) facts with how many people back each current value; no user data. */
export function placeDetail(place: DirectoryPlace, facts: FactView[], base: string) {
  const iqamah: Record<string, unknown> = {};
  for (const fact of facts) {
    if (!fact.key.startsWith("iqamah.") || !fact.current) continue;
    const parsed = iqamahValue.safeParse(fact.current.value);
    if (!parsed.success) continue;
    iqamah[fact.key.slice("iqamah.".length)] = {
      ...("t" in parsed.data ? { time: parsed.data.t } : { minutes_after_adhan: parsed.data.min }),
      state: fact.state,
      confirmations: fact.current.backers,
      last_confirmed_at: iso(fact.current.lastConfirmedAt),
      effective_from: fact.current.effectiveFrom,
    };
  }
  const jumuah = facts.flatMap((fact) => {
    if (fact.key !== "jumuah.jamaah" || !fact.current) return [];
    const parsed = jumuahValue.safeParse(fact.current.value);
    if (!parsed.success) return [];
    return [
      {
        jamaah: Number(fact.qualifier) || 1,
        time: parsed.data.t,
        khutbah: parsed.data.khutbah ?? null,
        languages: parsed.data.lang ?? [],
        state: fact.state,
        confirmations: fact.current.backers,
      },
    ];
  });
  jumuah.sort((a, b) => a.jamaah - b.jamaah);
  const amenities = Object.fromEntries(
    amenityRows(facts).map((row) => [row.key.slice("amenity.".length), { available: row.available, state: row.state, confirmations: row.confirms }]),
  );
  return {
    ...placeFeature(place, base).properties,
    lat: round(place.lat),
    lng: round(place.lng),
    calculation: { method: place.calcMethod, asr_madhab: place.asrMadhab, high_latitude_rule: place.highLatRule },
    iqamah,
    jumuah,
    amenities,
    website: place.website,
    phone: place.phone,
  };
}

export function prayerDayFor(place: DirectoryPlace, now: Date): PrayerDay {
  return getPrayerDay({
    lat: place.lat,
    lng: place.lng,
    timeZone: place.timezone,
    method: place.calcMethod,
    madhab: madhabOf(place.asrMadhab),
    highLat: place.highLatRule,
    adjust: parseAdhanAdjust(place.adhanAdjustJson),
    now,
  });
}

/** Midday on `date` in the place's zone, so every prayer of that day is the day's own. */
export function middayOf(date: string, timeZone: string): Date {
  const [year = 2000, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(localInstant({ year, month, day }, "12:00", timeZone));
}

/** A day's adhan and iqamah exactly as the mosque page shows them (24h local "HH:MM"). */
export function placeTimes(place: DirectoryPlace, facts: FactView[], day: PrayerDay, now: number, base: string) {
  const cells = iqamahCells(facts, day, now);
  return {
    place: { id: place.id, slug: place.slug, name: place.name, url: placeUrl(base, place.slug) },
    date: day.date,
    hijri: day.hijri,
    timezone: day.timezone,
    jumuah_day: day.jumuah,
    prayers: day.rows.map((row) => {
      const cell = cells[row.key];
      return {
        prayer: row.key,
        adhan: row.adhan,
        adhan_at: row.at,
        iqamah: cell ? formatHm(new Date(cell.at), day.timezone) : null,
        iqamah_at: cell?.at ?? null,
        iqamah_source: cell ? (cell.factKey.startsWith("timetable.") ? "timetable" : "community") : null,
        iqamah_status: cell ? (cell.tone === "ok" ? "verified" : cell.tone === "warning" ? "needs_check" : "unverified") : null,
      };
    }),
    jumuah: day.jumuah
      ? facts
          .flatMap((fact) => {
            const parsed = fact.key === "jumuah.jamaah" && fact.shown ? jumuahValue.safeParse(fact.shown.value) : null;
            return parsed?.success ? [{ jamaah: Number(fact.qualifier) || 1, time: parsed.data.t, khutbah: parsed.data.khutbah ?? null }] : [];
          })
          .sort((a, b) => a.jamaah - b.jamaah)
      : [],
  };
}

/** A place by id or slug (following merges and renames). */
export async function findPlace(idOrSlug: string): Promise<DirectoryPlace | null> {
  const byId = await placeById(idOrSlug);
  if (byId) return byId;
  let resolved = await resolvePlaceSlug(idOrSlug).catch(() => null);
  if (resolved && "redirect" in resolved) resolved = await resolvePlaceSlug(resolved.redirect).catch(() => null);
  const place = resolved && "place" in resolved ? resolved.place : null;
  return place && (place.status === "active" || place.status === "closed") ? place : null;
}

