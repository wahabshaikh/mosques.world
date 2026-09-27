import { appEnv } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const env = appEnv();
  const host = new URL(request.url).hostname;
  const allowed = env.EMAIL_SINK === "1" || host === "localhost" || host === "127.0.0.1";
  if (!allowed) return Response.json({ error: "Not found" }, { status: 404 });
  throw new Error("Sentry preview check");
}
