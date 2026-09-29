import { appEnv } from "@/lib/db/client";
import { testFixtureAllowed } from "@/lib/test-fixtures";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  const env = appEnv();
  if (!testFixtureAllowed(env, request)) return Response.json({ error: "Not found" }, { status: 404 });
  throw new Error("Sentry preview check");
}
