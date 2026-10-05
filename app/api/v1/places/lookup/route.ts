import { appEnv } from "@/lib/db/client";
import { placesContext, placesDailyCap } from "@/lib/places/context";
import { autocompletePlaces, takeLookup } from "@/lib/places/google";
import { osmEnabledFor, phase3EnabledFor } from "@/lib/phase";
import { suggestMosques } from "@/lib/db/queries";
import { searchPlaces } from "@/lib/geocode";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Places Autocomplete for the add form (session token per search, capped per user and per day). */
export async function GET(request: Request) {
  if (!(await phase3EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request);
  if ("response" in guarded) return guarded.response;
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const session = url.searchParams.get("session") ?? crypto.randomUUID();
  if (q.length < 3) return Response.json({ suggestions: [] });
  const env = appEnv();
  const context = placesContext(env, url.hostname);
  // A Places fixture written by E2E (non-production only) takes precedence over the free search.
  const fixture = context.mocks && (await env.CACHE.get("test:places:autocomplete")) !== null;
  if (!fixture && (await osmEnabledFor(request))) {
    // Free: mosques already listed (so people open them instead of adding a duplicate), then Photon.
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    const near = Number.isFinite(lat) && Number.isFinite(lng) && url.searchParams.has("lat") ? { lat, lng } : null;
    const [listed, hits] = await Promise.all([suggestMosques(q).catch(() => []), searchPlaces(q, near, { cache: env.CACHE })]);
    return Response.json({
      suggestions: [
        ...listed.map((item) => ({ placeId: `mw:${item.slug}`, label: item.label, secondary: "Already on mosques.world", slug: item.slug })),
        ...hits,
      ],
      available: true,
    });
  }
  if (!context.mocks && context.apiKey && !(await takeLookup(env.CACHE, guarded.user.id, placesDailyCap(env)))) {
    return jsonError("Search is busy right now. Add the place manually on the map instead.", 429, { manual: true });
  }
  return Response.json({ suggestions: await autocompletePlaces(context, q, session), available: Boolean(context.apiKey || context.mocks) });
}
