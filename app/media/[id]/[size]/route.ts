import { appEnv } from "@/lib/db/client";
import { VARIANT_WIDTHS, type VariantWidth } from "@/lib/media";
import { isModerator, userFromHeaders } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Serves photo variants from R2. Approved photos are public and immutable; pending ones only reach
 * their uploader and moderators.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string; size: string }> }) {
  const { id, size } = await params;
  const width = Number(size.replace(/\.webp$/, "")) as VariantWidth;
  if (!VARIANT_WIDTHS.includes(width) || !/^[0-9A-Z]{26}$/.test(id)) return new Response("Not found", { status: 404 });
  const env = appEnv();
  const photo = await env.DB.prepare(`SELECT status, uploaded_by, variant_keys_json FROM photo WHERE id = ?`)
    .bind(id)
    .first<{ status: string; uploaded_by: string; variant_keys_json: string | null }>();
  if (!photo || !photo.variant_keys_json || photo.status === "rejected") return new Response("Not found", { status: 404 });
  const approved = photo.status === "approved";
  if (!approved) {
    const viewer = await userFromHeaders(request.headers);
    if (!viewer || (viewer.id !== photo.uploaded_by && !isModerator(viewer))) return new Response("Not found", { status: 404 });
  }
  const key = (JSON.parse(photo.variant_keys_json) as Record<string, string>)[String(width)];
  const object = key ? await env.MEDIA.get(key) : null;
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": "image/webp",
      "cache-control": approved ? "public, max-age=31536000, immutable" : "private, no-store",
      etag: object.httpEtag,
      "x-content-type-options": "nosniff",
    },
  });
}
