import { appEnv } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = appEnv();
  const host = new URL(request.url).hostname;
  const allowed = env.EMAIL_SINK === "1" || host === "localhost" || host === "127.0.0.1";
  if (!allowed) return Response.json({ error: "Not found" }, { status: 404 });
  const latest = await env.CACHE.get("email:latest");
  if (!latest) return Response.json({ messages: [] });
  return Response.json({ messages: [JSON.parse(latest) as unknown] });
}
