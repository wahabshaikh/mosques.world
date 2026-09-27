import { getAuth, originFor } from "@/lib/auth";
import { appEnv } from "@/lib/db/client";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const env = appEnv();
  const host = request.headers.get("host") ?? new URL(request.url).host;
  if (request.method === "POST" && env.RL_AUTH) {
    const ip = request.headers.get("cf-connecting-ip") ?? "local";
    const { success } = await env.RL_AUTH.limit({ key: `auth:${ip}:${new URL(request.url).pathname}` });
    if (!success) return Response.json({ message: "Too many attempts. Wait a minute and try again." }, { status: 429 });
  }
  return getAuth(env, originFor(host)).handler(request);
}

export const GET = handle;
export const POST = handle;
