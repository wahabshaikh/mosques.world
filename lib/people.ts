const AVATAR_COLORS = ["#0B6E4F", "#A4520A", "#4B4F9C", "#1F1D1A"] as const;

export function avatarColor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

export function initials(name: string): string {
  const parts = name.replace(/^@/, "").split(/[\s._]+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[parts.length - 1]?.[0] ?? ""}` : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase() || "?";
}

/** Public label for an activity actor; deleted accounts read "former member" (spec 2.7 GDPR). */
export function publicHandle(input: { username: string | null; deletedAt: number | null } | null): string {
  if (!input || input.deletedAt || !input.username) return "former member";
  return `@${input.username}`;
}
