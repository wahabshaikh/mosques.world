import { encode } from "blurhash";
import { recomputeUserStats } from "@/lib/profile/stats";
import { ulid } from "@/lib/id";
import { decodePng } from "@/lib/og/png-decode";
import { recomputeFact } from "@/lib/trust/store";

import {
  aiFlagged,
  blurhashColor,
  VARIANT_WIDTHS,
  variantKey,
  type AiLabel,
  type PhotoPurpose,
  type PhotoView,
} from "./photos";

export * from "./photos";

export type MediaEnv = {
  DB: D1Database;
  MEDIA: R2Bucket;
  IMAGES?: ImagesBinding;
  AI?: Ai;
};

type PhotoRow = {
  id: string;
  place_id: string | null;
  purpose: PhotoPurpose;
  r2_key: string | null;
  category: string;
  status: string;
  uploaded_by: string;
  trust_level: number;
};

async function toBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function streamOf(bytes: Uint8Array<ArrayBuffer>): ReadableStream<Uint8Array> {
  return new Blob([bytes]).stream();
}

async function computeBlurhash(images: ImagesBinding, bytes: Uint8Array<ArrayBuffer>): Promise<string | null> {
  const square = () => images.input(streamOf(bytes)).transform({ width: 32, height: 32, fit: "cover" });
  try {
    const pixels = await toBytes((await square().output({ format: "rgba" })).image());
    if (pixels.length === 32 * 32 * 4) return encode(new Uint8ClampedArray(pixels), 32, 32, 4, 3);
  } catch {
    // Raw output is unavailable in local mode; decode a PNG instead.
  }
  try {
    const decoded = await decodePng(await toBytes((await square().output({ format: "image/png" })).image()));
    return decoded ? encode(new Uint8ClampedArray(decoded.rgba), decoded.width, decoded.height, 4, 3) : null;
  } catch {
    return null;
  }
}

async function classify(ai: Ai | undefined, bytes: Uint8Array): Promise<AiLabel[]> {
  if (!ai) return [];
  try {
    const result = (await ai.run("@cf/microsoft/resnet-50" as never, { image: [...bytes] } as never)) as unknown;
    return Array.isArray(result) ? (result as AiLabel[]).slice(0, 5) : [];
  } catch {
    return [];
  }
}

/**
 * q-media consumer step (spec P3 photos): WebP variants via the Images binding (metadata stripped),
 * blurhash, AI labels, then approve (L1+ and not flagged) or leave pending for review. The original
 * is always deleted.
 */
export async function processPhoto(env: MediaEnv, id: string, now = Date.now()): Promise<"approved" | "pending" | "rejected" | "skipped"> {
  const row = await env.DB.prepare(
    `SELECT photo.id, photo.place_id, photo.purpose, photo.r2_key, photo.category, photo.status, photo.uploaded_by, user.trust_level
     FROM photo JOIN user ON user.id = photo.uploaded_by WHERE photo.id = ?`,
  )
    .bind(id)
    .first<PhotoRow>();
  if (!row || row.status !== "processing" || !row.r2_key) return "skipped";
  const object = await env.MEDIA.get(row.r2_key);
  if (!object || !env.IMAGES) {
    await env.DB.prepare(`UPDATE photo SET status = 'rejected', r2_key = NULL WHERE id = ?`).bind(id).run();
    if (object) await env.MEDIA.delete(row.r2_key);
    return "rejected";
  }
  const original = await toBytes(object.body);
  let width = 0;
  let height = 0;
  try {
    const info = await env.IMAGES.info(streamOf(original));
    if (!("width" in info)) throw new Error("vector images are not accepted");
    width = info.width;
    height = info.height;
  } catch {
    await env.DB.prepare(`UPDATE photo SET status = 'rejected', r2_key = NULL WHERE id = ?`).bind(id).run();
    await env.MEDIA.delete(row.r2_key);
    return "rejected";
  }

  const keys: Record<string, string> = {};
  let small: Uint8Array<ArrayBuffer> | null = null;
  for (const target of VARIANT_WIDTHS) {
    const result = await env.IMAGES.input(streamOf(original))
      .transform({ width: Math.min(target, width), fit: "scale-down" })
      .output({ format: "image/webp", quality: 82 });
    const bytes = await toBytes(result.image());
    const key = variantKey(id, target);
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" } });
    keys[target] = key;
    if (target === 400) small = bytes;
  }
  const blurhash = await computeBlurhash(env.IMAGES, small ?? original);
  const labels = await classify(env.AI, small ?? original);
  const flagged = aiFlagged(labels);
  const status = !flagged && row.trust_level >= 1 ? "approved" : "pending";
  const scale = Math.min(1, 1600 / width);
  await env.DB.prepare(
    `UPDATE photo SET status = ?, r2_key = NULL, variant_keys_json = ?, width = ?, height = ?, blurhash = ?, ai_labels_json = ? WHERE id = ?`,
  )
    .bind(status, JSON.stringify(keys), Math.round(width * scale), Math.round(height * scale), blurhash, JSON.stringify({ labels, flagged }), id)
    .run();
  await env.MEDIA.delete(row.r2_key);
  if (status === "approved") await afterApproval(env.DB, row, now);
  return status;
}

async function afterApproval(db: D1Database, photo: Pick<PhotoRow, "id" | "place_id" | "purpose" | "category" | "uploaded_by">, now: number) {
  if (photo.purpose === "avatar") {
    await db.prepare(`UPDATE user SET avatar_key = ? WHERE id = ?`).bind(photo.id, photo.uploaded_by).run();
    return;
  }
  // Photo counts feed profile stats and the Timetable keeper badge.
  await recomputeUserStats(db, photo.uploaded_by, now).catch(() => undefined);
  if (photo.place_id) {
    await db
      .prepare(`INSERT INTO activity (id, actor_id, place_id, type, payload_json, created_at) VALUES (?, ?, ?, 'photo_added', ?, ?)`)
      .bind(ulid(now), photo.uploaded_by, photo.place_id, JSON.stringify({ category: photo.category, photoId: photo.id }), now)
      .run();
  }
  // An approved timetable photo strengthens the votes it was attached to (weight × 1.5, spec 5.4).
  const boosted = await db
    .prepare(
      `SELECT DISTINCT fact_candidate.fact_id FROM vote JOIN fact_candidate ON fact_candidate.id = vote.candidate_id WHERE vote.evidence_photo_id = ?`,
    )
    .bind(photo.id)
    .all<{ fact_id: string }>();
  if ((boosted.results ?? []).length === 0) return;
  await db.prepare(`UPDATE vote SET weight = round(weight * 1.5, 6) WHERE evidence_photo_id = ?`).bind(photo.id).run();
  for (const row of boosted.results ?? []) await recomputeFact(db, row.fact_id, now);
}

export async function reviewPhoto(env: MediaEnv, input: { photoId: string; moderatorId: string; approve: boolean; now: number }) {
  const row = await env.DB.prepare(`SELECT id, place_id, purpose, category, status, uploaded_by, variant_keys_json FROM photo WHERE id = ?`)
    .bind(input.photoId)
    .first<Pick<PhotoRow, "id" | "place_id" | "purpose" | "category" | "status" | "uploaded_by"> & { variant_keys_json: string | null }>();
  if (!row) return "missing" as const;
  if (input.approve && row.status === "approved") return "unchanged" as const;
  if (!input.approve && row.status === "rejected") return "unchanged" as const;
  await env.DB.batch([
    env.DB.prepare(`UPDATE photo SET status = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`).bind(
      input.approve ? "approved" : "rejected",
      input.moderatorId,
      input.now,
      row.id,
    ),
    env.DB.prepare(
      `INSERT INTO audit_log (id, actor_id, action, target_type, target_id, before_json, after_json, created_at) VALUES (?, ?, ?, 'photo', ?, ?, ?, ?)`,
    ).bind(ulid(input.now), input.moderatorId, input.approve ? "approve_photo" : "reject_photo", row.id, JSON.stringify({ status: row.status }), JSON.stringify({ status: input.approve ? "approved" : "rejected" }), input.now),
  ]);
  if (input.approve) {
    await afterApproval(env.DB, row, input.now);
    return "approved" as const;
  }
  const keys = Object.values(JSON.parse(row.variant_keys_json ?? "{}") as Record<string, string>);
  if (keys.length) await env.MEDIA.delete(keys);
  if (row.purpose === "avatar") await env.DB.prepare(`UPDATE user SET avatar_key = NULL WHERE id = ? AND avatar_key = ?`).bind(row.uploaded_by, row.id).run();
  return "rejected" as const;
}

export async function placePhotos(db: D1Database, placeId: string, limit = 60): Promise<PhotoView[]> {
  const rows = await db
    .prepare(
      `SELECT id, category, width, height, blurhash, status FROM photo WHERE place_id = ? AND purpose IN ('place', 'evidence') AND status = 'approved'
       ORDER BY CASE category WHEN 'exterior' THEN 0 WHEN 'prayer_hall' THEN 1 ELSE 2 END, created_at DESC LIMIT ?`,
    )
    .bind(placeId, limit)
    .all<{ id: string; category: string; width: number | null; height: number | null; blurhash: string | null; status: string }>();
  return (rows.results ?? []).map((row) => ({ id: row.id, category: row.category, width: row.width, height: row.height, color: blurhashColor(row.blurhash), status: row.status }));
}
