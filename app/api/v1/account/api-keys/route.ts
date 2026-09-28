import { z } from "zod";
import { ApiKeyError, createApiKey, listApiKeys } from "@/lib/api-keys";
import { appEnv } from "@/lib/db/client";
import { phase8EnabledFor } from "@/lib/phase";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";

export const dynamic = "force-dynamic";

const input = z.object({ name: z.string().trim().min(1, "Give the key a name.").max(60) });

export async function GET(request: Request) {
  if (!(await phase8EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request);
  if ("response" in guarded) return guarded.response;
  return Response.json({ keys: await listApiKeys(appEnv().DB, guarded.user.id) });
}

/** Creates a key; the response is the only time the full key is shown. */
export async function POST(request: Request) {
  if (!(await phase8EnabledFor(request))) return jsonError("Not found", 404);
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message ?? "Please check the form.", 400);
  const env = appEnv();
  if (!(await writeAllowed(env.RL_WRITE, `write:${guarded.user.id}`))) return jsonError("Slow down a little and try again.", 429);
  try {
    const created = await createApiKey(env.DB, { ownerId: guarded.user.id, name: parsed.data.name, now: Date.now() });
    return Response.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiKeyError) return jsonError(error.message, error.status);
    throw error;
  }
}
