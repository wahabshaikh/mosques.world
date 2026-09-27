import { z } from "zod";
import { normalizeUsername, usernameProblem } from "@/lib/username";

export const USERNAME_CHANGE_DAYS = 30;

const username = z
  .string()
  .transform(normalizeUsername)
  .superRefine((value, context) => {
    const problem = usernameProblem(value);
    if (problem) context.addIssue({ code: "custom", message: problem });
  });

const homeFields = {
  homeCityLabel: z.string().trim().max(80).nullish().transform((value) => value || null),
  homeCountry: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .nullish()
    .transform((value) => value?.toUpperCase() ?? null),
};

export const onboardingInput = z.object({
  username,
  name: z.string().trim().min(1, "Add a display name.").max(60),
  acceptGuidelines: z.literal(true, { error: "Agree to the community guidelines to continue." }),
  ...homeFields,
});

export const profileInput = z.object({
  username,
  name: z.string().trim().min(1, "Add a display name.").max(60),
  bio: z.string().trim().max(280, "Keep your bio under 280 characters.").nullish().transform((value) => value || null),
  ...homeFields,
});

export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form and try again.";
}

export function canChangeUsername(changedAt: number | null, now: number): boolean {
  return changedAt === null || now - changedAt >= USERNAME_CHANGE_DAYS * 24 * 60 * 60 * 1000;
}

/** Fields of the user row safe to include in a personal data export. */
export function exportableUser(row: Record<string, unknown>): Record<string, unknown> {
  const { banReason: _banReason, trustOverride: _trustOverride, ...rest } = row;
  return rest;
}
