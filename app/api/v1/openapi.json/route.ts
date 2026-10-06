import { openApiDocument } from "@/lib/openapi";
import { CORS } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return Response.json(openApiDocument(new URL(request.url).origin), { headers: { ...CORS, "Cache-Control": "public, max-age=3600" } });
}
