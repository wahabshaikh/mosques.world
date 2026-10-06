import { appEnv } from "@/lib/db/client";
import { isNonProductionHost } from "@/lib/environment";
import { readNow } from "@/lib/places/present";
import { apiError, findPlace, guardKey, middayOf, placeTimes, prayerDayFor } from "@/lib/public-api";
import { placeFacts } from "@/lib/trust/read";

export const dynamic = "force-dynamic";

/** GET /api/v1/public/places/{id|slug}/times?date=YYYY-MM-DD — adhan and iqamah as the mosque page shows them. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = appEnv();
  const guarded = await guardKey(request, env);
  if ("response" in guarded) return guarded.response;
  const place = await findPlace((await params).id);
  if (!place || place.status === "pending" || place.status === "merged") return apiError("Place not found.", 404, guarded.headers);
  const url = new URL(request.url);
  const date = url.searchParams.get("date");
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return apiError("`date` is YYYY-MM-DD in the place's time zone.", 400, guarded.headers);
  // Without a date: "now", exactly like the page (after Isha the next Fajr is tomorrow's).
  const now = date ? middayOf(date, place.timezone) : readNow(request.headers.get("x-mw-now"), isNonProductionHost(url.hostname));
  const day = prayerDayFor(place, now);
  const facts = await placeFacts(env.DB, place.id, day.date);
  return Response.json(placeTimes(place, facts, day, now.getTime(), url.origin), { headers: guarded.headers });
}

export function OPTIONS(request: Request) {
  return guardKey(request, appEnv()).then((guarded) => ("response" in guarded ? guarded.response : new Response(null, { status: 204 })));
}
