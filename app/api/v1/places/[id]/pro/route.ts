import { appEnv } from "@/lib/db/client";
import { approvedSteward, boardInput, entitled, normalizeBoard, readPro, saveBoard } from "@/lib/masjid-pro";
import { readPolarConfig } from "@/lib/polar";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

async function placeRow(id: string) {
  return appEnv().DB.prepare(`SELECT id, slug, name FROM place WHERE id = ? AND status IN ('active', 'closed')`).bind(id).first<{ id: string; slug: string; name: string }>();
}

/** The committee's Masjid Pro state for one mosque. Stewards only. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiUser(request);
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  const place = await placeRow(id);
  if (!place) return jsonError("That place was not found.", 404);
  if (!(await approvedSteward(appEnv().DB, place.id, guarded.user.id))) return jsonError("Only a steward of this mosque can manage Masjid Pro.", 403);
  const now = Date.now();
  const pro = await readPro(appEnv().DB, place.id, now);
  const polar = readPolarConfig(appEnv());
  return Response.json({
    entitled: pro?.entitled ?? false,
    status: pro?.status ?? null,
    interval: pro?.interval ?? null,
    periodEnd: pro?.periodEnd ?? null,
    notice: pro?.notice ?? null,
    donationUrl: pro?.donationUrl ?? null,
    donationLabel: pro?.donationLabel ?? null,
    checkout: polar ? { month: Boolean(polar.products.month), year: Boolean(polar.products.year), server: polar.server } : null,
  });
}

/** Saves the notice and the donation link. The subscription has to be in force. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = boardInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Check the form and try again.", 400);
  const board = normalizeBoard(parsed.data);
  if (!board.ok) return jsonError(board.error, 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${guarded.user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const { id } = await params;
  const place = await placeRow(id);
  if (!place) return jsonError("That place was not found.", 404);
  if (!(await approvedSteward(env.DB, place.id, guarded.user.id))) return jsonError("Only a steward of this mosque can manage Masjid Pro.", 403);
  const now = Date.now();
  const pro = await readPro(env.DB, place.id, now);
  if (!pro || !entitled(pro.status, pro.periodEnd, now)) return jsonError("Masjid Pro is not active for this mosque.", 402);
  await saveBoard(env.DB, place.id, board.patch, now);
  return Response.json({ ok: true });
}
