import { appEnv } from "@/lib/db/client";
import { suggestMosques, suggestPlaces } from "@/lib/db/queries";
import { MOSQUE_WORDS, searchAreas, searchMosques } from "@/lib/geocode";
import { geocodeDecision } from "@/lib/places/view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ suggestions: [] });
  const env = appEnv();
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const key = `geocode:${ip}`;
  const current = Number((await env.CACHE.get(key)) ?? "0");
  const decision = geocodeDecision(current, Boolean(env.TURNSTILE_SECRET_KEY), 200);
  if (decision === "block") {
    return Response.json({ error: "Too many searches. Try again shortly." }, { status: 429 });
  }
  if (decision === "challenge") {
    const token = url.searchParams.get("turnstile");
    if (!token || !(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY ?? ""))) {
      return Response.json({ error: "Confirm you are not a bot.", challenge: true }, { status: 403 });
    }
  }
  await env.CACHE.put(key, String(current + 1), { expirationTtl: 60 * 60 });

  // Free: Photon for cities and regions (with coordinates, so no details call), mosques from OpenStreetMap
  // near the map, and our own listed mosques. Google Places is not used here.
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const near = url.searchParams.has("lat") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  const [areas, listed, osm] = await Promise.all([
    searchAreas(q, { cache: env.CACHE }),
    suggestMosques(q).catch(() => []),
    searchMosques(q, near, { cache: env.CACHE }).catch(() => []),
  ]);
  // If Photon is down or knows nothing, our own city list still answers.
  const cities = areas.length > 0 ? areas.slice(0, 5).map((area) => ({ ...area, kind: "city" as const })) : (await suggestPlaces(q)).filter((item) => item.kind === "city");
  const mosques = [...listed.map((item) => ({ ...item, kind: "mosque" as const })), ...(await listedSlugs(env.DB, osm))];
  const unique = mosques.filter((item, index) => mosques.findIndex((other) => (other.slug && other.slug === item.slug) || other.label === item.label) === index).slice(0, 6);
  // "Masjid al-…" or "… mosque" is looking for a mosque; "Karachi" is looking for an area.
  const suggestions = MOSQUE_WORDS.test(q) ? [...unique, ...cities.slice(0, 3)] : [...cities, ...unique];
  return Response.json({ suggestions });
}

/** OpenStreetMap mosques, pointing at their page when we already list them (else at their location). */
async function listedSlugs(database: D1Database, hits: Awaited<ReturnType<typeof searchMosques>>) {
  if (hits.length === 0) return [];
  const rows = await database
    .prepare(`SELECT slug, osm_type, osm_id FROM place WHERE status = 'active' AND (${hits.map(() => "(osm_type = ? AND osm_id = ?)").join(" OR ")})`)
    .bind(...hits.flatMap((hit) => [hit.osmType, hit.osmId]))
    .all<{ slug: string; osm_type: string; osm_id: number }>()
    .catch(() => ({ results: [] as Array<{ slug: string; osm_type: string; osm_id: number }> }));
  return hits.map((hit) => {
    const slug = rows.results?.find((row) => row.osm_type === hit.osmType && row.osm_id === hit.osmId)?.slug;
    return { label: hit.label, lat: hit.lat, lng: hit.lng, kind: "mosque" as const, ...(slug ? { slug } : {}) };
  });
}

async function verifyTurnstile(token: string, secret: string) {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { success?: boolean };
  return Boolean(body.success);
}
