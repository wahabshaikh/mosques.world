import { heldAction } from "@/lib/admin";
import { appEnv } from "@/lib/db/client";
import { reviewPhoto } from "@/lib/media";
import { apiModerator, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guarded = await apiModerator(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { id } = await params;
  const parsed = heldAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Unknown action.", 400);
  const result = await reviewPhoto(appEnv(), { photoId: id, moderatorId: guarded.user.id, approve: parsed.data.action === "approve", now: Date.now() });
  if (result === "missing") return jsonError("That photo was not found.", 404);
  return Response.json({ ok: true, status: result });
}
