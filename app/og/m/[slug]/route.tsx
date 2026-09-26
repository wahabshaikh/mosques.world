import { ImageResponse } from "next/og";
import { placeBySlug } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const place = await placeBySlug(slug);
  const name = place?.name ?? "Mosque";
  const locality = place?.locality ?? "";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          background: "#0B6E4F",
          color: "white",
          padding: 64,
          fontSize: 56,
        }}
      >
        <div style={{ fontSize: 24, opacity: 0.8 }}>mosques.world</div>
        <div style={{ fontWeight: 800, marginTop: 12 }}>{name}</div>
        <div style={{ fontSize: 28, marginTop: 8 }}>{locality}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
