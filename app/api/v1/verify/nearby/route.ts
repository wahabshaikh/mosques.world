import { appEnv } from "@/lib/db/client";
import { phase5EnabledFor } from "@/lib/phase";
import { apiUser, jsonError } from "@/lib/session";
import { locationInput, placesWithin } from "@/lib/verify";

export const dynamic = "force-dynamic";

/** "I'm here": places within 150 m of the position the device sent (used once, not stored). */
export async function POST(request: Request) {
  if (!(await phase5EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = locationInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("We couldn't read your location.", 400);
  const places = await placesWithin(appEnv().DB, parsed.data.lat, parsed.data.lng);
  return Response.json({ places }, { headers: { "cache-control": "private, no-store" } });
}
