import { savedPlaces } from "@/lib/db/queries";
import { weekTimes } from "@/lib/offline";
import { isNonProductionHost, readNow } from "@/lib/places/present";
import { phase5EnabledFor } from "@/lib/phase";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Saved places with 7 days of times; the service worker keeps the last copy for offline use. */
export async function GET(request: Request) {
  if (!(await phase5EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request);
  if ("response" in guarded) return guarded.response;
  const host = new URL(request.url).hostname;
  const now = readNow(request.headers.get("x-mw-now"), isNonProductionHost(host));
  const places = (await savedPlaces(guarded.user.id)).slice(0, 50).map((place) => weekTimes(place, now));
  return Response.json({ generatedAt: now.toISOString(), places }, { headers: { "cache-control": "private, no-cache" } });
}
