import { appEnv } from "@/lib/db/client";
import { placesContext } from "@/lib/places/context";
import { placeDetails } from "@/lib/places/google";
import { phase3EnabledFor } from "@/lib/phase";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Place Details (Essentials field mask) that pre-fills the add form. Nothing here is stored as-is. */
export async function GET(request: Request) {
  if (!(await phase3EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request);
  if ("response" in guarded) return guarded.response;
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  if (!id || id.length > 200) return jsonError("Pick a place from the list.", 400);
  const details = await placeDetails(placesContext(appEnv(), url.hostname), id, url.searchParams.get("session"));
  if (!details) return jsonError("That place could not be loaded. Try again or add it manually.", 404);
  return Response.json({ details });
}
