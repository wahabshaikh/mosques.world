import { revokeApiKey } from "@/lib/api-keys";
import { appEnv } from "@/lib/db/client";
import { phase8EnabledFor } from "@/lib/phase";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await phase8EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const revoked = await revokeApiKey(appEnv().DB, { ownerId: guarded.user.id, id: (await params).id, now: Date.now() });
  return revoked ? Response.json({ ok: true }) : jsonError("That key was not found.", 404);
}
