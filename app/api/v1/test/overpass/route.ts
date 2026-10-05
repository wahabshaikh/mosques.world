import { isNonProductionHost } from "@/lib/environment";
import { geohashBounds, OVERPASS_ENDPOINTS } from "@/lib/osm-fill";
import { overpassQuery } from "@/lib/osm";

export const dynamic = "force-dynamic";

/** Preview/local only: how each Overpass endpoint answers from this Worker (diagnoses area-fill failures). */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!isNonProductionHost(url.hostname)) return Response.json({ error: "Not found" }, { status: 404 });
  const cell = url.searchParams.get("cell") ?? "tkrt";
  const extra = url.searchParams.getAll("endpoint").filter((item) => /^https:\/\/[a-z0-9.-]+\//i.test(item));
  const body = new URLSearchParams({ data: overpassQuery(geohashBounds(cell)).replace("[timeout:90]", "[timeout:25]") });
  const results = await Promise.all(
    [...OVERPASS_ENDPOINTS, ...extra].map(async (endpoint) => {
      const started = Date.now();
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "user-agent": "mosques.world area fill (https://mosques.world/attribution)", "content-type": "application/x-www-form-urlencoded" },
          body,
          signal: AbortSignal.timeout(45_000),
        });
        const text = await response.text();
        return { endpoint, status: response.status, ms: Date.now() - started, bytes: text.length, head: text.slice(0, 160) };
      } catch (error) {
        return { endpoint, error: error instanceof Error ? error.message : String(error), ms: Date.now() - started };
      }
    }),
  );
  return Response.json({ cell, results });
}
