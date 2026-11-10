import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { usesEmailSink } from "@/lib/email/send";
import { donationHref, setProForTest } from "@/lib/masjid-pro";
import { jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const input = z.object({
  placeId: z.string().min(1).max(64),
  active: z.boolean(),
  notice: z.string().max(180).nullable().optional(),
  donationUrl: z.string().max(500).nullable().optional(),
  donationLabel: z.string().max(32).nullable().optional(),
});

/**
 * Preview and localhost only: turns Masjid Pro on or off for a mosque without Polar,
 * so the lobby screen and widget can be tested. 404 wherever the email sink is off.
 */
export async function POST(request: Request) {
  const env = appEnv();
  if (!usesEmailSink(env, new URL(request.url).hostname)) return jsonError("Not found.", 404);
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Bad Masjid Pro fixture.", 400);
  const place = await env.DB.prepare(`SELECT id FROM place WHERE id = ? AND status IN ('active', 'closed')`).bind(parsed.data.placeId).first();
  if (!place) return jsonError("That place was not found.", 404);
  let donationUrl: string | null = null;
  if (parsed.data.donationUrl) {
    donationUrl = donationHref(parsed.data.donationUrl);
    if (!donationUrl) return jsonError("The donation link has to be an https address on the public web.", 400);
  }
  await setProForTest(env.DB, {
    placeId: parsed.data.placeId,
    active: parsed.data.active,
    notice: parsed.data.notice ?? null,
    donationUrl,
    donationLabel: parsed.data.donationLabel ?? null,
    now: Date.now(),
  });
  return Response.json({ ok: true, active: parsed.data.active });
}
