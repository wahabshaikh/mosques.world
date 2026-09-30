import { scheduleUserStats } from "@/lib/profile/stats";
import { isNonProductionHost } from "@/lib/environment";
import { placesInBbox } from "@/lib/db/queries";
import { firstIssue } from "@/lib/account";
import { appEnv } from "@/lib/db/client";
import { createPlace, newPlaceInput, PlaceError } from "@/lib/places/create";
import { parseNeeds } from "@/lib/places/amenities";
import { civilDate } from "@/lib/prayer/times";
import { writeAllowed } from "@/lib/ratelimit";
import { actorOf, apiUser, jsonError } from "@/lib/session";
import { submitValue } from "@/lib/trust/store";
import { phase2EnabledFor, phase3EnabledFor } from "@/lib/phase";
import { toCard } from "@/lib/places/present";
import { parseBbox } from "@/lib/places/view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const bbox = parseBbox(url.searchParams.get("bbox") ?? undefined);
  if (!bbox) return Response.json({ error: "bbox is required" }, { status: 400 });
  const kindParam = url.searchParams.get("kind");
  const kind = kindParam === "mosque" || kindParam === "prayer_room" ? kindParam : "all";
  const origin = {
    lat: (bbox.south + bbox.north) / 2,
    lng: (bbox.west + bbox.east) / 2,
  };
  const community = await phase2EnabledFor(request);
  const needs = (await phase3EnabledFor(request)) ? parseNeeds(url.searchParams.get("needs") ?? undefined) : [];
  const verifiedOnly = community && url.searchParams.get("verified") === "1";
  const places = await placesInBbox(bbox, kind, origin, { needs, verifiedOnly });
  const now = new Date();
  const features = places.slice(0, 500).map((place) => {
    const card = toCard(place, now);
    return {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [place.lng, place.lat] },
      properties: {
        id: place.id,
        slug: place.slug,
        name: place.name,
        kind: place.kind,
        nextLabel: card.nextLabel,
        nextTime: card.nextTime,
        nextKind: card.nextKind,
        verification: card.verification,
        changeReported: card.changeReported,
      },
    };
  });
  return Response.json(
    { type: "FeatureCollection", features },
    { headers: { "cache-control": "public, s-maxage=60" } },
  );
}

/** Adds a mosque or prayer space (flow F4), with the creator's initial times and amenities as candidates. */
export async function POST(request: Request) {
  if (!(await phase3EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const parsed = newPlaceInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(firstIssue(parsed.error), 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const now = Date.now();
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM place WHERE created_by = ? AND created_at > ?`)
    .bind(user.id, now - 24 * 60 * 60 * 1000)
    .first<{ n: number }>();
  const cap = user.trustLevel === 0 ? 3 : user.trustLevel === 1 ? 20 : 100;
  if ((recent?.n ?? 0) >= cap) return jsonError(`You can add ${cap} places a day. Thank you — try again tomorrow.`, 429);
  try {
    const created = await createPlace(env.DB, parsed.data, user, now);
    const today = civilDate(new Date(now), created.timezone);
    const effectiveFrom = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
    const actor = actorOf(user);
    const values: Array<{ key: string; value: unknown }> = [
      ...Object.entries(parsed.data.iqamah).map(([prayer, time]) => ({ key: `iqamah.${prayer}`, value: { t: time } })),
      ...Object.entries(parsed.data.amenities).map(([key, v]) => ({ key, value: { v } })),
    ];
    for (const item of values) {
      await submitValue(env.DB, { actor, placeId: created.id, key: item.key, qualifier: "", value: item.value, effectiveFrom, source: "observed", now });
    }
    await scheduleUserStats(env, user.id, isNonProductionHost(new URL(request.url).hostname)).catch(() => undefined);
    return Response.json({ slug: created.slug, status: created.status, id: created.id });
  } catch (error) {
    if (error instanceof PlaceError) return jsonError(error.message, error.status);
    throw error;
  }
}
