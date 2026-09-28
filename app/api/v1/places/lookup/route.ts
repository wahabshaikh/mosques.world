import { appEnv } from "@/lib/db/client";
import { placesContext, placesDailyCap } from "@/lib/places/context";
import { autocompletePlaces, takeLookup } from "@/lib/places/google";
import { phase3EnabledFor } from "@/lib/phase";
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
  if (!context.mocks && context.apiKey && !(await takeLookup(env.CACHE, guarded.user.id, placesDailyCap(env)))) {
    return jsonError("Search is busy right now. Add the place manually on the map instead.", 429, { manual: true });
  }
  return Response.json({ suggestions: await autocompletePlaces(context, q, session), available: Boolean(context.apiKey || context.mocks) });
}
