import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { calcDefault, place } from "@/lib/db/schema";
import { getPrayerDay } from "@/lib/prayer/times";
import { madhabOf, readNow, isNonProductionHost } from "@/lib/places/present";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const rows = await db()
    .select({ place, highLat: calcDefault.highLatRule })
    .from(place)
    .leftJoin(calcDefault, eq(place.countryCode, calcDefault.countryCode))
    .where(eq(place.id, id))
    .limit(1);
  const slugRows =
    rows.length > 0
      ? rows
      : await db()
          .select({ place, highLat: calcDefault.highLatRule })
          .from(place)
          .leftJoin(calcDefault, eq(place.countryCode, calcDefault.countryCode))
          .where(eq(place.slug, id))
          .limit(1);
  const row = slugRows[0];
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  const url = new URL(request.url);
  const host = url.hostname;
  const now = readNow(url.searchParams.get("now"), isNonProductionHost(host));
  const high = row.highLat;
  const day = getPrayerDay({
    lat: row.place.lat,
    lng: row.place.lng,
    timeZone: row.place.timezone,
    method: row.place.calcMethod,
    madhab: madhabOf(row.place.asrMadhab),
    highLat: high === "middleofthenight" || high === "seventhofthenight" ? high : "twilightangle",
    now,
  });
  return Response.json(day);
}
