import type { AppEnv } from "@/lib/db/client";

function visitorId(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/(?:^|;\s*)datafast_visitor_id=([^;]+)/);
  return match?.[1] ?? null;
}

/** Server-side DataFast goal (spec 2.11). Never throws and never sends PII. */
export async function serverGoal(env: AppEnv, request: Request, name: string, metadata: Record<string, string | number | boolean> = {}) {
  const visitor = visitorId(request);
  if (!env.DATAFAST_API_KEY || !visitor) return;
  try {
    await fetch("https://datafa.st/api/v1/goals", {
      method: "POST",
      headers: { authorization: `Bearer ${env.DATAFAST_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ datafast_visitor_id: visitor, name, metadata }),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Analytics must never fail a contribution.
  }
}
