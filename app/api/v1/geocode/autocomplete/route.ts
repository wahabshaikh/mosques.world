import { appEnv } from "@/lib/db/client";
import { suggestPlaces } from "@/lib/db/queries";
import { geocodeDecision } from "@/lib/places/view";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ suggestions: [] });
  const env = appEnv();
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const key = `geocode:${ip}`;
  const current = Number((await env.CACHE.get(key)) ?? "0");
  const decision = geocodeDecision(current, Boolean(env.TURNSTILE_SECRET_KEY));
  if (decision === "block") {
    return Response.json({ error: "Too many searches. Try again shortly." }, { status: 429 });
  }
  if (decision === "challenge") {
    const token = url.searchParams.get("turnstile");
    if (!token || !(await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY ?? ""))) {
      return Response.json({ error: "Confirm you are not a bot.", challenge: true }, { status: 403 });
    }
  }
  await env.CACHE.put(key, String(current + 1), { expirationTtl: 60 * 60 });

  if (env.GOOGLE_MAPS_API_KEY) {
    const google = await googleAutocomplete(q, env.GOOGLE_MAPS_API_KEY);
    if (google.length > 0) return Response.json({ suggestions: google });
  }
  const suggestions = await suggestPlaces(q);
  return Response.json({ suggestions });
}

async function googleAutocomplete(input: string, apiKey: string) {
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": apiKey,
    },
    body: JSON.stringify({
      input,
      includedPrimaryTypes: ["locality", "(regions)"],
    }),
  });
  if (!response.ok) return [];
  const body = (await response.json()) as {
    suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
  };
  return (body.suggestions ?? [])
    .map((item) => ({
      label: item.placePrediction?.text?.text ?? "",
      placeId: item.placePrediction?.placeId ?? "",
      lat: null as number | null,
      lng: null as number | null,
    }))
    .filter((item) => item.label && item.placeId);
}

async function verifyTurnstile(token: string, secret: string) {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret, response: token }),
  });
  if (!response.ok) return false;
  const body = (await response.json()) as { success?: boolean };
  return Boolean(body.success);
}
