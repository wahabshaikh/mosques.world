/** Photo rules shared by the upload dialog (client) and the media pipeline (server). */

export const PHOTO_CATEGORIES = [
  { value: "exterior", label: "Outside" },
  { value: "prayer_hall", label: "Prayer hall" },
  { value: "women", label: "Women's area" },
  { value: "wudhu", label: "Wudhu area" },
  { value: "entrance", label: "Entrance" },
  { value: "timetable", label: "Timetable board" },
  { value: "other", label: "Other" },
] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number]["value"];
export const PHOTO_PURPOSES = ["place", "evidence", "avatar"] as const;
export type PhotoPurpose = (typeof PHOTO_PURPOSES)[number];

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
/** WebP widths kept per photo; re-encoding drops EXIF (including GPS) and all other metadata. */
export const VARIANT_WIDTHS = [1600, 800, 400] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];

export function isPhotoCategory(value: string): value is PhotoCategory {
  return PHOTO_CATEGORIES.some((category) => category.value === value);
}

export function uploadProblem(file: { type: string; size: number } | null): string | null {
  if (!file || file.size === 0) return "Choose a photo to upload.";
  if (!(UPLOAD_TYPES as readonly string[]).includes(file.type)) return "Photos must be JPEG, PNG, WebP or HEIC.";
  if (file.size > MAX_UPLOAD_BYTES) return "Photos can be up to 15 MB.";
  return null;
}

export function dailyUploadCap(trustLevel: number): number {
  return trustLevel >= 2 ? 100 : trustLevel === 1 ? 40 : 10;
}

export function variantKey(id: string, width: VariantWidth): string {
  return `photos/${id}/${width}.webp`;
}

/** Unguessable original key; the original is deleted once variants exist. */
export function originalKey(id: string): string {
  const random = crypto.getRandomValues(new Uint8Array(12));
  return `originals/${id}-${[...random].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** ImageNet labels (ResNet-50) that make a mosque photo worth a human look before it goes public. */
const REVIEW_LABELS = ["bikini", "brassiere", "maillot", "swimming trunks", "miniskirt", "lipstick", "wine bottle", "beer bottle", "revolver", "rifle", "assault rifle", "cleaver"];

export type AiLabel = { label: string; score: number };

export function aiFlagged(labels: AiLabel[]): boolean {
  return labels.some((item) => item.score >= 0.25 && REVIEW_LABELS.some((word) => item.label.toLowerCase().includes(word)));
}

/** Average colour from a blurhash's DC component, for a placeholder before the image loads. */
export function blurhashColor(hash: string | null): string | null {
  if (!hash || hash.length < 6) return null;
  const digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~";
  let value = 0;
  for (const char of hash.slice(2, 6)) {
    const index = digits.indexOf(char);
    if (index < 0) return null;
    value = value * 83 + index;
  }
  return `#${value.toString(16).padStart(6, "0")}`;
}


export function photoUrl(id: string, width: VariantWidth): string {
  return `/media/${id}/${width}.webp`;
}

export type PhotoView = { id: string; category: string; width: number | null; height: number | null; color: string | null; status: string };

