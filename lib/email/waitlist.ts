const encoder = new TextEncoder();

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function newToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function waitlistMessage(input: { placeName: string; confirmUrl: string }): { subject: string; text: string } {
  return {
    subject: `Confirm prayer-time updates for ${input.placeName}`,
    text: `Confirm you want to hear when iqamah times are added for ${input.placeName}.\n\n${input.confirmUrl}\n\nIf you did not ask for this, ignore this email.`,
  };
}

const emailSchema = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return emailSchema.test(email) && email.length <= 254 ? email : null;
}
