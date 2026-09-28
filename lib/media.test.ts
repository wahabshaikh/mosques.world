import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestD1 } from "@/lib/testing/d1";
import { encodeRgbPng } from "@/lib/og/png";
import {
  aiFlagged,
  blurhashColor,
  dailyUploadCap,
  isPhotoCategory,
  originalKey,
  photoUrl,
  placePhotos,
  processPhoto,
  reviewPhoto,
  uploadProblem,
  variantKey,
  type MediaEnv,
} from "./media";
import { submitValue } from "./trust/store";

function fakeR2() {
  const store = new Map<string, Uint8Array>();
  return {
    store,
    async get(key: string) {
      const value = store.get(key);
      return value ? { body: new Blob([value as BlobPart]).stream() } : null;
    },
    async put(key: string, value: Uint8Array) {
      store.set(key, value);
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
    },
  };
}

function fakeImages(options: { rgba?: boolean; broken?: boolean } = {}) {
  const png = encodeRgbPng(32, 32, new Uint8Array(32 * 32 * 3).fill(120));
  return {
    async info() {
      if (options.broken) throw new Error("not an image");
      return { format: "image/jpeg", fileSize: 10, width: 2000, height: 1500 };
    },
    input() {
      const transformer = {
        transform: () => transformer,
        async output({ format }: { format: string }) {
          if (format === "rgba" && !options.rgba) throw new Error("unsupported");
          const bytes = format === "rgba" ? new Uint8Array(32 * 32 * 4).fill(90) : format === "image/png" ? png : new TextEncoder().encode("RIFF....WEBP");
          return { image: () => new Blob([bytes as BlobPart]).stream() };
        },
      };
      return transformer;
    },
  };
}

let d1: D1Database;
let sqlite: ReturnType<typeof createTestD1>["sqlite"];

function env(extra: Partial<Record<string, unknown>> = {}) {
  return { DB: d1, MEDIA: fakeR2(), IMAGES: fakeImages(), ...extra } as unknown as MediaEnv & { MEDIA: ReturnType<typeof fakeR2> };
}

async function upload(mediaEnv: MediaEnv & { MEDIA: ReturnType<typeof fakeR2> }, user: string, extra: { purpose?: string; category?: string } = {}) {
  const id = `P${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
  mediaEnv.MEDIA.store.set(`originals/${id}`, new Uint8Array([1, 2, 3]));
  sqlite
    .prepare(`INSERT INTO photo (id, place_id, purpose, r2_key, category, status, uploaded_by, created_at) VALUES (?, 'p', ?, ?, ?, 'processing', ?, 1)`)
    .run(id, extra.purpose ?? "place", `originals/${id}`, extra.category ?? "exterior", user);
  return id;
}

beforeEach(() => {
  ({ d1, sqlite } = createTestD1());
  sqlite.exec(`INSERT INTO place (id, slug, name, kind, lat, lng, geohash6, country_code, city_slug, timezone, calc_method, asr_madhab, created_at, updated_at)
    VALUES ('p', 'p', 'P', 'mosque', 0, 0, 's00000', 'GB', 'london', 'Europe/London', 'MuslimWorldLeague', 'shafi', 0, 0)`);
  sqlite.exec(`INSERT INTO user (id, name, email, created_at, updated_at, trust_level) VALUES ('new', 'N', 'n@x', 0, 0, 0), ('trusted', 'T', 't@x', 0, 0, 1)`);
});

describe("upload rules", () => {
  it("validates files and categories", () => {
    expect(uploadProblem(null)).toMatch(/Choose/);
    expect(uploadProblem({ type: "image/gif", size: 10 })).toMatch(/JPEG/);
    expect(uploadProblem({ type: "image/jpeg", size: 16 * 1024 * 1024 })).toMatch(/15 MB/);
    expect(uploadProblem({ type: "image/heic", size: 10 })).toBeNull();
    expect(isPhotoCategory("timetable")).toBe(true);
    expect(isPhotoCategory("selfie")).toBe(false);
    expect([0, 1, 2].map(dailyUploadCap)).toEqual([10, 40, 100]);
    expect(originalKey("X")).toMatch(/^originals\/X-[0-9a-f]{24}$/);
    expect(variantKey("X", 800)).toBe("photos/X/800.webp");
    expect(photoUrl("X", 400)).toBe("/media/X/400.webp");
  });

  it("flags off-topic images and derives placeholder colours", () => {
    expect(aiFlagged([{ label: "bikini, two-piece", score: 0.6 }])).toBe(true);
    expect(aiFlagged([{ label: "mosque", score: 0.9 }, { label: "bikini", score: 0.1 }])).toBe(false);
    expect(blurhashColor("LEHV6nWB2yk8pyo0adR*.7kCMdnj")).toMatch(/^#[0-9a-f]{6}$/);
    expect(blurhashColor(null)).toBeNull();
    expect(blurhashColor("L!!!!!")).toBeNull();
  });
});

describe("processPhoto", () => {
  it("approves trusted uploads, writes three variants and deletes the original", async () => {
    const mediaEnv = env({ IMAGES: fakeImages({ rgba: true }), AI: { run: vi.fn(async () => [{ label: "mosque", score: 0.9 }]) } });
    const id = await upload(mediaEnv, "trusted");
    expect(await processPhoto(mediaEnv, id)).toBe("approved");
    expect([...mediaEnv.MEDIA.store.keys()].sort()).toEqual([`photos/${id}/1600.webp`, `photos/${id}/400.webp`, `photos/${id}/800.webp`]);
    const row = sqlite.prepare(`SELECT status, width, height, blurhash, r2_key FROM photo WHERE id = ?`).get(id) as Record<string, unknown>;
    expect(row).toMatchObject({ status: "approved", width: 1600, height: 1200, r2_key: null });
    expect(String(row.blurhash)).toHaveLength(28);
    expect(await placePhotos(d1, "p")).toHaveLength(1);
    expect(sqlite.prepare(`SELECT type FROM activity`).get()).toEqual({ type: "photo_added" });
    expect(await processPhoto(mediaEnv, id)).toBe("skipped");
  });

  it("keeps new accounts' and flagged uploads pending, using the PNG blurhash fallback", async () => {
    const mediaEnv = env();
    const id = await upload(mediaEnv, "new");
    expect(await processPhoto(mediaEnv, id)).toBe("pending");
    expect((sqlite.prepare(`SELECT blurhash FROM photo WHERE id = ?`).get(id) as { blurhash: string }).blurhash).toHaveLength(28);
    const flaggedEnv = env({ AI: { run: vi.fn(async () => [{ label: "bikini", score: 0.8 }]) } });
    const flagged = await upload(flaggedEnv, "trusted");
    expect(await processPhoto(flaggedEnv, flagged)).toBe("pending");
    const brokenAi = env({ AI: { run: vi.fn(async () => { throw new Error("down"); }) } });
    expect(await processPhoto(brokenAi, await upload(brokenAi, "trusted"))).toBe("approved");
  });

  it("rejects unreadable files", async () => {
    const mediaEnv = env({ IMAGES: fakeImages({ broken: true }) });
    const id = await upload(mediaEnv, "trusted");
    expect(await processPhoto(mediaEnv, id)).toBe("rejected");
    expect(mediaEnv.MEDIA.store.size).toBe(0);
    const noImages = env({ IMAGES: undefined });
    expect(await processPhoto(noImages, await upload(noImages, "trusted"))).toBe("rejected");
  });
});

describe("reviewPhoto", () => {
  it("approves pending photos and boosts votes that used them as evidence", async () => {
    const mediaEnv = env();
    const id = await upload(mediaEnv, "new", { purpose: "evidence", category: "timetable" });
    await processPhoto(mediaEnv, id);
    const vote = await submitValue(d1, {
      actor: { id: "trusted", trustLevel: 1, createdAt: 0, role: "user" },
      placeId: "p",
      key: "iqamah.fajr",
      qualifier: "",
      value: { t: "05:45" },
      effectiveFrom: "2026-01-01",
      source: "board",
      now: 5,
      evidence: { photoId: id, approved: false },
    });
    expect(sqlite.prepare(`SELECT weight FROM vote WHERE candidate_id = ?`).get(vote.candidateId)).toEqual({ weight: 1.8 });
    expect(await reviewPhoto(mediaEnv, { photoId: id, moderatorId: "trusted", approve: true, now: 6 })).toBe("approved");
    expect(sqlite.prepare(`SELECT weight FROM vote WHERE candidate_id = ?`).get(vote.candidateId)).toEqual({ weight: 2.7 });
    expect(await reviewPhoto(mediaEnv, { photoId: id, moderatorId: "trusted", approve: true, now: 7 })).toBe("unchanged");
    expect(await reviewPhoto(mediaEnv, { photoId: "nope", moderatorId: "trusted", approve: true, now: 7 })).toBe("missing");
  });

  it("rejects photos, deletes variants and clears avatars", async () => {
    const mediaEnv = env();
    const avatar = await upload(mediaEnv, "trusted", { purpose: "avatar" });
    await processPhoto(mediaEnv, avatar);
    expect(sqlite.prepare(`SELECT avatar_key FROM user WHERE id = 'trusted'`).get()).toEqual({ avatar_key: avatar });
    expect(await reviewPhoto(mediaEnv, { photoId: avatar, moderatorId: "trusted", approve: false, now: 8 })).toBe("rejected");
    expect(sqlite.prepare(`SELECT avatar_key FROM user WHERE id = 'trusted'`).get()).toEqual({ avatar_key: null });
    expect(mediaEnv.MEDIA.store.size).toBe(0);
    expect(await reviewPhoto(mediaEnv, { photoId: avatar, moderatorId: "trusted", approve: false, now: 9 })).toBe("unchanged");
  });
});
