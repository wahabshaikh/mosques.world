import { z } from "zod";
import { appEnv } from "@/lib/db/client";
import { NOTIFICATION_CHANNELS, NOTIFICATION_TOPICS } from "@/lib/notifications";
import { setPrefStatement } from "@/lib/notify";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const input = z.object({ channel: z.enum(NOTIFICATION_CHANNELS), topic: z.enum(NOTIFICATION_TOPICS), enabled: z.boolean() });

export async function PATCH(request: Request) {
  const guarded = await apiUser(request, { mutate: true, needsUsername: false });
  if ("response" in guarded) return guarded.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("That setting was not valid.", 400);
  await setPrefStatement(appEnv().DB, { userId: guarded.user.id, ...parsed.data, now: Date.now() }).run();
  return Response.json({ ok: true });
}
