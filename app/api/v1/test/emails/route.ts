import { appEnv } from "@/lib/db/client";
import { usesEmailSink } from "@/lib/email/send";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const env = appEnv();
  const url = new URL(request.url);
  if (!usesEmailSink(env, url.hostname)) return Response.json({ error: "Not found" }, { status: 404 });
  const to = url.searchParams.get("to");
  const latest = await env.CACHE.get(to ? `email:to:${to.toLowerCase()}` : "email:latest");
  if (!latest) return Response.json({ messages: [] });
  return Response.json({ messages: [JSON.parse(latest) as unknown] });
}
