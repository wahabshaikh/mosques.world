import { appEnv } from "@/lib/db/client";
import { applyPolarDelivery, parsePolarDelivery } from "@/lib/masjid-pro";
import { polarProductIds, readPolarConfig, verifyPolarWebhook } from "@/lib/polar";
import { writeAllowed } from "@/lib/ratelimit";
import { jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_BODY = 100_000;

/**
 * Polar subscription deliveries. The signature is the authentication: there is no session.
 * A missing webhook secret is a 404, so the route does not exist until checkout is configured.
 */
export async function POST(request: Request) {
  const env = appEnv();
  const secret = env.POLAR_WEBHOOK_SECRET?.trim();
  if (!secret) return jsonError("Not found.", 404);
  const ip = request.headers.get("cf-connecting-ip") ?? "polar";
  if (!(await writeAllowed(env.RL_WRITE, `polar:${ip}`))) return jsonError("Slow down a little and try again.", 429);
  const raw = await request.text();
  if (raw.length > MAX_BODY) return jsonError("Payload too large.", 413);
  const verified = await verifyPolarWebhook(
    raw,
    {
      id: request.headers.get("webhook-id"),
      timestamp: request.headers.get("webhook-timestamp"),
      signature: request.headers.get("webhook-signature"),
    },
    secret,
    Date.now(),
  );
  if (!verified.ok) {
    console.error(`Polar webhook refused: ${verified.reason}`);
    return jsonError("Webhook signature was not accepted.", 401);
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError("The webhook body was not JSON.", 400);
  }
  const event = parsePolarDelivery(verified.id, body, Date.now());
  if (!event) return Response.json({ ok: true, ignored: true });
  const productIds = polarProductIds(readPolarConfig(env));
  if (productIds.length === 0) return jsonError("Masjid Pro checkout is not open yet.", 503);
  const result = await applyPolarDelivery(env.DB, event, productIds);
  return Response.json({ ok: true, result });
}
