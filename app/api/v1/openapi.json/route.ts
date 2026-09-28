import { phase8EnabledFor } from "@/lib/phase";
import { openApiDocument } from "@/lib/openapi";
import { CORS } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!(await phase8EnabledFor(request))) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(openApiDocument(new URL(request.url).origin), { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}
