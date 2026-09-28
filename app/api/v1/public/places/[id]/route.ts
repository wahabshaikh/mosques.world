import { appEnv } from "@/lib/db/client";
import { phase8EnabledFor } from "@/lib/phase";
import { apiError, findPlace, guardKey, placeDetail } from "@/lib/public-api";
import { placeFacts } from "@/lib/trust/read";

export const dynamic = "force-dynamic";

/** GET /api/v1/public/places/{id|slug} — details with standing iqamah, Jumu'ah and amenities. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await phase8EnabledFor(request))) return apiError("Not found", 404);
  const env = appEnv();
  const guarded = await guardKey(request, env);
  if ("response" in guarded) return guarded.response;
  const place = await findPlace((await params).id);
  if (!place || place.status === "pending" || place.status === "merged") return apiError("Place not found.", 404, guarded.headers);
  const facts = await placeFacts(env.DB, place.id, new Date().toISOString().slice(0, 10));
  return Response.json(placeDetail(place, facts, new URL(request.url).origin), { headers: guarded.headers });
}

export function OPTIONS(request: Request) {
  return guardKey(request, appEnv()).then((guarded) => ("response" in guarded ? guarded.response : new Response(null, { status: 204 })));
}
