import { captchaRequired } from "@/lib/auth";
import { appEnv } from "@/lib/db/client";
import { ulid } from "@/lib/id";
import { dailyUploadCap, isPhotoCategory, originalKey, PHOTO_PURPOSES, processPhoto, uploadProblem, type PhotoPurpose } from "@/lib/media";
import { isNonProductionHost } from "@/lib/environment";
import { writeAllowed } from "@/lib/ratelimit";
import { apiUser, jsonError } from "@/lib/session";
import { verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

/**
 * Photo upload (spec P3): the original goes to R2 under an unguessable key and `q-media` makes
 * WebP variants (metadata stripped), then deletes it. Level-0 uploads wait for review.
 */
export async function POST(request: Request) {
  const guarded = await apiUser(request, { mutate: true });
  if ("response" in guarded) return guarded.response;
  const { user } = guarded;
  const env = appEnv();
  const host = new URL(request.url).hostname;
  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("Choose a photo to upload.", 400);
  const file = form.get("file");
  const problem = uploadProblem(file instanceof File ? file : null);
  if (problem || !(file instanceof File)) return jsonError(problem ?? "Choose a photo to upload.", 400);
  const purpose = String(form.get("purpose") ?? "place") as PhotoPurpose;
  if (!(PHOTO_PURPOSES as readonly string[]).includes(purpose)) return jsonError("Unknown upload.", 400);
  const category = purpose === "avatar" ? "other" : purpose === "evidence" ? "timetable" : String(form.get("category") ?? "other");
  if (!isPhotoCategory(category)) return jsonError("Pick what the photo shows.", 400);
  const placeId = purpose === "avatar" ? null : String(form.get("placeId") ?? "");
  if (placeId !== null) {
    const place = await env.DB.prepare(`SELECT id FROM place WHERE id = ? AND status IN ('active', 'pending')`).bind(placeId).first();
    if (!place) return jsonError("That place was not found.", 404);
  }
  if (user.trustLevel === 0 && captchaRequired(env, host)) {
    const ok = await verifyTurnstile(String(form.get("turnstile") ?? ""), env.TURNSTILE_SECRET_KEY ?? "");
    if (!ok) return jsonError("Confirm you are not a bot.", 403, { challenge: true });
  }
  if (!(await writeAllowed(env.RL_WRITE, `write:${user.id}`))) return jsonError("Slow down a little and try again.", 429);
  const now = Date.now();
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM photo WHERE uploaded_by = ? AND created_at > ?`)
    .bind(user.id, now - 24 * 60 * 60 * 1000)
    .first<{ n: number }>();
  const cap = dailyUploadCap(user.trustLevel);
  if ((recent?.n ?? 0) >= cap) return jsonError(`You can upload ${cap} photos a day. Thank you — try again tomorrow.`, 429);

  const id = ulid(now);
  const key = originalKey(id);
  await env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await env.DB.prepare(
    `INSERT INTO photo (id, place_id, purpose, r2_key, category, status, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, 'processing', ?, ?)`,
  )
    .bind(id, placeId, purpose, key, category, user.id, now)
    .run();

  // Preview shares queue names with production, so non-production hosts process inline.
  if (env.Q_MEDIA && !isNonProductionHost(host)) {
    await env.Q_MEDIA.send({ kind: "photo", id });
    return Response.json({ id, status: "processing" });
  }
  const status = await processPhoto(env, id, now);
  if (status === "rejected") return jsonError("That file couldn't be read as a photo.", 400);
  return Response.json({ id, status });
}
