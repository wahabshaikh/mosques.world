import { appEnv } from "@/lib/db/client";
import { EXPORT_PREFIX } from "@/lib/open-data";
import { phase8EnabledFor } from "@/lib/phase";

export const dynamic = "force-dynamic";

/** Streams a published export from R2 (spec P8). Files are immutable per month, so they cache well. */
export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await phase8EnabledFor(request))) return new Response("Not found", { status: 404 });
  const { name } = await params;
  if (!/^places-\d{4}-\d{2}\.(geojson|csv)$/.test(name)) return new Response("Not found", { status: 404 });
  const object = await appEnv().MEDIA.get(`${EXPORT_PREFIX}${name}`);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": name.endsWith(".csv") ? "text/csv; charset=utf-8" : "application/geo+json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mosques-world-${name}"`,
      "Content-Length": String(object.size),
      "Cache-Control": "public, max-age=86400",
      ETag: object.httpEtag,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
