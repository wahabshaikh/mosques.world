import { placeBySlug } from "@/lib/db/queries";
import { renderMosqueCard } from "@/lib/og/card";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const place = await placeBySlug(slug);
  const png = renderMosqueCard({
    name: place?.name ?? "Mosque",
    locality: place?.locality ?? "",
  });
  return new Response(Buffer.from(png), {
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    },
  });
}
