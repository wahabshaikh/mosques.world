import { appEnv } from "@/lib/db/client";
import { suggestMosques, suggestPlaces } from "@/lib/db/queries";
import { searchAreas } from "@/lib/geocode";
import { googleAutocomplete } from "@/lib/places/autocomplete";
import { osmEnabledFor } from "@/lib/phase";
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
  const osm = await osmEnabledFor(request);
  const decision = geocodeDecision(current, Boolean(env.TURNSTILE_SECRET_KEY), osm ? 200 : 20);
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

  if (osm) {
    // Free: Photon for cities and regions (with coordinates, so no details call), plus our own mosques.
    const [areas, mosques] = await Promise.all([searchAreas(q, { cache: env.CACHE }), suggestMosques(q).catch(() => [])]);
    // If Photon is down or knows nothing, our own city list still answers.
    const cities = areas.length > 0 ? areas.slice(0, 5).map((area) => ({ ...area, kind: "city" as const })) : (await suggestPlaces(q)).filter((item) => item.kind === "city");
    return Response.json({ suggestions: [...cities, ...mosques] });
  }
  if (env.GOOGLE_MAPS_API_KEY) {
    const google = await googleAutocomplete(q, env.GOOGLE_MAPS_API_KEY);
    if (google.length > 0) return Response.json({ suggestions: google });
  }
  const suggestions = await suggestPlaces(q);
  return Response.json({ suggestions });
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
