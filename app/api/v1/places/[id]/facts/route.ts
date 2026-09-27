import { appEnv } from "@/lib/db/client";
import { civilDate } from "@/lib/prayer/times";
import { placeFacts } from "@/lib/trust/read";

export const dynamic = "force-dynamic";

/** Public JSON of a place's community facts (current value, displayed value, open challenger). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const database = appEnv().DB;
  const place = await database.prepare(`SELECT id, timezone FROM place WHERE id = ? AND status != 'hidden'`).bind(id).first<{ id: string; timezone: string }>();
  if (!place) return Response.json({ error: "Not found" }, { status: 404 });
  const today = civilDate(new Date(), place.timezone);
  const date = `${today.year}-${String(today.month).padStart(2, "0")}-${String(today.day).padStart(2, "0")}`;
  const facts = await placeFacts(database, place.id, date);
  return Response.json({ date, facts }, { headers: { "cache-control": "public, s-maxage=30" } });
}
