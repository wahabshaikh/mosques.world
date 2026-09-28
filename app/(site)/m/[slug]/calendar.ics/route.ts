import { appEnv } from "@/lib/db/client";
import { placeBySlug } from "@/lib/db/queries";
import { calendar, placeEvents } from "@/lib/ics";
import { isNonProductionHost, readNow } from "@/lib/places/present";
import { phase7EnabledFor } from "@/lib/phase";
import { monthValues } from "@/lib/timetable";

export const dynamic = "force-dynamic";

const DAYS = 30;

/** 30 rolling days of iqamah events for one mosque (spec P7), in the mosque's time zone. */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await phase7EnabledFor(request))) return new Response("Not found", { status: 404 });
  const { slug } = await params;
  const place = await placeBySlug(slug);
  if (!place || place.status !== "active") return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const now = readNow(request.headers.get("x-mw-now"), isNonProductionHost(url.hostname)).getTime();
  const base = isNonProductionHost(url.hostname) ? url.origin : appEnv().PUBLIC_BASE_URL || "https://mosques.world";
  const first = new Date(now).toISOString().slice(0, 7);
  const second = new Date(now + DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);
  const timetable = new Map<string, string>();
  for (const month of new Set([first, second])) {
    for (const [key, value] of await monthValues(appEnv().DB, place.id, month)) timetable.set(key, value.time);
  }
  const body = calendar({ name: `${place.name} iqamah`, groups: [{ timeZone: place.timezone, events: placeEvents(place, now, DAYS, base, timetable) }], now, days: DAYS });
  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `inline; filename="${place.slug}.ics"`,
      "cache-control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
