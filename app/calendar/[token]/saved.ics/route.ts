import { appEnv } from "@/lib/db/client";
import { savedPlaces } from "@/lib/db/queries";
import { calendar, placeEvents, readFeedToken } from "@/lib/ics";
import { secretOf } from "@/lib/notify";
import { isNonProductionHost } from "@/lib/environment";
import { readNow } from "@/lib/places/present";
import { phase7EnabledFor } from "@/lib/phase";

export const dynamic = "force-dynamic";

const DAYS = 14;

/** A person's saved mosques as one calendar feed (spec P7); the signed token stands in for sign-in. */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!(await phase7EnabledFor(request))) return new Response("Not found", { status: 404 });
  const { token } = await params;
  const url = new URL(request.url);
  const env = appEnv();
  const userId = await readFeedToken(secretOf(env, url.hostname), decodeURIComponent(token));
  if (!userId) return new Response("Not found", { status: 404 });
  const now = readNow(request.headers.get("x-mw-now"), isNonProductionHost(url.hostname)).getTime();
  const base = isNonProductionHost(url.hostname) ? url.origin : env.PUBLIC_BASE_URL || "https://mosques.world";
  const places = (await savedPlaces(userId)).filter((place) => place.status === "active").slice(0, 20);
  const zones = new Map<string, ReturnType<typeof placeEvents>>();
  for (const place of places) zones.set(place.timezone, [...(zones.get(place.timezone) ?? []), ...placeEvents(place, now, DAYS, base)]);
  const body = calendar({ name: "My mosques · iqamah", groups: [...zones].map(([timeZone, events]) => ({ timeZone, events })), now, days: DAYS });
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=3600" } });
}
