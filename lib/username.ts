export const USERNAME_PATTERN = /^[a-z0-9._]{3,30}$/;

export const RESERVED_USERNAMES = new Set([
  "about",
  "account",
  "add",
  "admin",
  "administrator",
  "api",
  "attribution",
  "cities",
  "countries",
  "guidelines",
  "help",
  "m",
  "map",
  "me",
  "moderator",
  "mosques",
  "mosquesworld",
  "og",
  "onboarding",
  "privacy",
  "root",
  "saved",
  "search",
  "settings",
  "sign-in",
  "signin",
  "steward",
  "support",
  "system",
  "terms",
  "u",
  "verify",
  "waitlist",
]);

export function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function usernameProblem(value: string): string | null {
  if (!USERNAME_PATTERN.test(value)) return "Use 3–30 lowercase letters, numbers, dots or underscores.";
  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) return "Dots can't start, end or repeat.";
  if (RESERVED_USERNAMES.has(value)) return "That username is reserved.";
  return null;
}

/** Username ideas from a display name or email, all valid by `usernameProblem`. */
export function suggestUsernames(name: string, email = ""): string[] {
  const fromName = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const local = (email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z0-9._]/g, "");
  const ideas = [
    fromName.join(""),
    fromName.join("."),
    fromName.length > 1 ? `${fromName[0]}${fromName[fromName.length - 1]?.charAt(0) ?? ""}` : "",
    local,
  ];
  const valid = [...new Set(ideas)].filter((idea) => idea && usernameProblem(idea) === null);
  if (valid.length === 0 && fromName[0]) {
    const padded = `${fromName[0]}.mw`.slice(0, 30);
    if (usernameProblem(padded) === null) valid.push(padded);
  }
  return valid.slice(0, 3);
}
