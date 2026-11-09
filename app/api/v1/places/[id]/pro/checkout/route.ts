import { appEnv } from "@/lib/db/client";
import { linkBase } from "@/lib/environment";
import { approvedSteward, checkoutInput } from "@/lib/masjid-pro";
import { createPolarCheckout, readPolarConfig } from "@/lib/polar";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Starts a Polar checkout for one mosque. The price lives on the Polar product, not in this request. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = checkoutInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Choose a month or a year.", 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${guarded.user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const { id } = await params;
  const place = await env.DB.prepare(`SELECT id, slug FROM place WHERE id = ? AND status IN ('active', 'closed')`).bind(id).first<{ id: string; slug: string }>();
  if (!place) return jsonError("That place was not found.", 404);
  if (!(await approvedSteward(env.DB, place.id, guarded.user.id))) return jsonError("Only a steward of this mosque can subscribe.", 403);
  const polar = readPolarConfig(env);
  if (!polar) return jsonError("Masjid Pro checkout is not open yet.", 503);
  const productId = polar.products[parsed.data.interval];
  if (!productId) return jsonError("That billing period is not available.", 400);
  const base = linkBase(request.url, env.PUBLIC_BASE_URL);
  const page = `${base}/m/${encodeURIComponent(place.slug)}/pro`;
  const result = await createPolarCheckout(polar, {
    productId,
    successUrl: `${page}?checkout=return`,
    returnUrl: page,
    email: guarded.user.email,
    placeId: place.id,
    userId: guarded.user.id,
    interval: parsed.data.interval,
  });
  if ("error" in result) return jsonError(result.error, 502);
  return Response.json({ url: result.url });
}
