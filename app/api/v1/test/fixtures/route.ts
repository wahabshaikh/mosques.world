import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { usesEmailSink } from "@/lib/email/send";
import { refreshPlaceSummary } from "@/lib/trust/store";

export const dynamic = "force-dynamic";

const input = z.object({
  user: z
    .object({
      email: z.string().email(),
      trustLevel: z.number().int().min(0).max(3).optional(),
      role: z.enum(["user", "moderator", "admin"]).optional(),
      ageDays: z.number().min(0).max(3650).optional(),
    })
    .optional(),
  resetPlace: z.string().optional(),
  places: z
    .object({
      autocomplete: z.array(z.object({ placeId: z.string(), label: z.string(), secondary: z.string().nullable() })),
      details: z.array(z.record(z.string(), z.unknown())),
    })
    .optional(),
  deletePlace: z.string().optional(),
  /** Returns a person's raw check-in rows, so tests can assert what is (and isn't) stored. */
  checkinsOf: z.string().email().optional(),
  /** Returns a person's votes (with geo_verified) for quick-verify assertions. */
  votesOf: z.string().email().optional(),
});

/** Preview/local only (same gate as the email sink): E2E fixtures for trust levels and clean places. */
export async function POST(request: Request) {
  const env = appEnv();
  if (!usesEmailSink(env, new URL(request.url).hostname)) return Response.json({ error: "Not found" }, { status: 404 });
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad fixture" }, { status: 400 });
  const database = env.DB;
  const now = Date.now();
  const { user, resetPlace, places, deletePlace, checkinsOf, votesOf } = parsed.data;
  if (places) {
    await env.CACHE.put("test:places:autocomplete", JSON.stringify(places.autocomplete), { expirationTtl: 3600 });
    for (const details of places.details) {
      await env.CACHE.put(`test:places:details:${String(details.placeId)}`, JSON.stringify(details), { expirationTtl: 3600 });
    }
  }
  if (deletePlace) {
    // Removes places a test created (by Google place id) so the add flow can be re-run.
    const rows = await database.prepare(`SELECT id FROM place WHERE google_place_id = ?`).bind(deletePlace).all<{ id: string }>();
    for (const row of rows.results ?? []) {
      await database.batch([
        database.prepare(`DELETE FROM vote WHERE candidate_id IN (SELECT fact_candidate.id FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id WHERE fact.place_id = ?)`).bind(row.id),
        database.prepare(`DELETE FROM fact_candidate WHERE fact_id IN (SELECT id FROM fact WHERE place_id = ?)`).bind(row.id),
        database.prepare(`DELETE FROM fact WHERE place_id = ?`).bind(row.id),
        database.prepare(`DELETE FROM activity WHERE place_id = ?`).bind(row.id),
        database.prepare(`DELETE FROM place_duplicate_candidate WHERE a_id = ? OR b_id = ?`).bind(row.id, row.id),
        database.prepare(`DELETE FROM photo WHERE place_id = ?`).bind(row.id),
        database.prepare(`DELETE FROM place_slug_history WHERE place_id = ?`).bind(row.id),
        database.prepare(`DELETE FROM report WHERE place_id = ?`).bind(row.id),
        database.prepare(`DELETE FROM checkin WHERE place_id = ?`).bind(row.id),
        database.prepare(`DELETE FROM saved_place WHERE place_id = ?`).bind(row.id),
        database.prepare(`DELETE FROM user_place_stat WHERE place_id = ?`).bind(row.id),
        database.prepare(`UPDATE place SET merged_into_id = NULL WHERE merged_into_id = ?`).bind(row.id),
        database.prepare(`DELETE FROM place WHERE id = ?`).bind(row.id),
      ]);
    }
  }
  if (user) {
    const row = await database.prepare(`SELECT id, created_at FROM user WHERE email = ?`).bind(user.email.toLowerCase()).first<{ id: string; created_at: number }>();
    if (!row) return Response.json({ error: "No such user" }, { status: 404 });
    if (user.trustLevel !== undefined) {
      await database.prepare(`UPDATE user SET trust_level = ?, trust_override = ? WHERE id = ?`).bind(user.trustLevel, user.trustLevel, row.id).run();
    }
    if (user.role) await database.prepare(`UPDATE user SET role = ? WHERE id = ?`).bind(user.role, row.id).run();
    if (user.ageDays !== undefined) {
      await database.prepare(`UPDATE user SET created_at = ? WHERE id = ?`).bind(now - user.ageDays * 86_400_000, row.id).run();
    }
  }
  if (resetPlace) {
    const place = await database.prepare(`SELECT id FROM place WHERE slug = ?`).bind(resetPlace).first<{ id: string }>();
    if (!place) return Response.json({ error: "No such place" }, { status: 404 });
    await database.batch([
      database.prepare(`DELETE FROM vote WHERE candidate_id IN (SELECT fact_candidate.id FROM fact_candidate JOIN fact ON fact.id = fact_candidate.fact_id WHERE fact.place_id = ?)`).bind(place.id),
      database.prepare(`UPDATE fact SET current_candidate_id = NULL WHERE place_id = ?`).bind(place.id),
      database.prepare(`DELETE FROM report WHERE place_id = ?`).bind(place.id),
      database.prepare(`DELETE FROM fact_candidate WHERE fact_id IN (SELECT id FROM fact WHERE place_id = ?)`).bind(place.id),
      database.prepare(`DELETE FROM fact WHERE place_id = ?`).bind(place.id),
      database.prepare(`DELETE FROM activity WHERE place_id = ?`).bind(place.id),
    ]);
    await refreshPlaceSummary(database, place.id, now);
  }
  if (votesOf) {
    const rows = await database
      .prepare(
        `SELECT vote.polarity, vote.geo_verified, vote.weight, fact.key FROM vote JOIN user ON user.id = vote.user_id
         JOIN fact_candidate ON fact_candidate.id = vote.candidate_id JOIN fact ON fact.id = fact_candidate.fact_id
         WHERE user.email = ? ORDER BY vote.created_at`,
      )
      .bind(votesOf.toLowerCase())
      .all();
    return Response.json({ ok: true, votes: rows.results ?? [] });
  }
  if (checkinsOf) {
    const rows = await database
      .prepare(`SELECT checkin.* FROM checkin JOIN user ON user.id = checkin.user_id WHERE user.email = ? ORDER BY checkin.created_at`)
      .bind(checkinsOf.toLowerCase())
      .all();
    return Response.json({ ok: true, checkins: rows.results ?? [] });
  }
  return Response.json({ ok: true });
}
