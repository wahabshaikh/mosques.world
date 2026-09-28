import { z } from "zod";
import { VOTE_SOURCES } from "@/lib/trust/facts";
import type { VoteResult } from "@/lib/trust/store";

export const voteInput = z.object({
  candidateId: z.string().min(1).max(40),
  polarity: z.union([z.literal(1), z.literal(-1)]),
  source: z.enum(VOTE_SOURCES).default("other"),
});

export const contributionInput = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(VOTE_SOURCES).default("other"),
  changes: z
    .array(z.object({ key: z.string().max(40), qualifier: z.string().max(4).default(""), value: z.unknown() }))
    .max(24)
    .default([]),
  confirms: z.array(z.string().min(1).max(40)).max(24).default([]),
  evidencePhotoId: z.string().min(1).max(40).nullish(),
});

export const reportInput = z.object({
  placeId: z.string().min(1).max(40),
  factKey: z.string().max(40).nullish(),
  reason: z.enum(["timing", "closed", "duplicate", "wrong_location", "inappropriate_photo", "other"]).default("timing"),
  photoId: z.string().max(40).nullish(),
  note: z.string().trim().min(3, "Tell us briefly what is wrong.").max(500),
});

const DAY = 24 * 60 * 60 * 1000;

/** Values may apply from today up to 60 days ahead, in the place's own calendar. */
export function effectiveFromProblem(date: string, today: string): string | null {
  const parsed = Date.parse(`${date}T00:00:00Z`);
  const base = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return "Pick a valid date.";
  if (parsed < base) return "Times can apply from today onwards.";
  if (parsed - base > 60 * DAY) return "Times can apply at most 60 days ahead.";
  return null;
}

/** Toast copy after a vote or submission (e.g. "Thanks! Isha needs 1 more confirmation."). */
export function resultMessage(label: string, result: Pick<VoteResult, "status" | "needed" | "state">): string {
  if (result.status === "held") return `Thanks! A trusted member will review the ${label} change.`;
  if (result.status === "live" && result.needed === 0) return `Thanks! ${label} is ${result.state === "verified" ? "verified" : "live"}.`;
  const plural = result.needed === 1 ? "confirmation" : "confirmations";
  if (result.status === "live") return `Thanks! ${label} is live and needs ${result.needed} more ${plural} to be verified.`;
  return `Thanks! ${label} needs ${result.needed} more ${plural}.`;
}
