import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { nearbyPlaces } from "@/lib/places/create";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const input = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), name: z.string().max(120) });

export async function POST(request: Request) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Pick a location first.", 400);
  return Response.json({ places: await nearbyPlaces(appEnv().DB, parsed.data) });
}
