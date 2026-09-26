import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const COVER_TINTS = [
  { bg: "#D6E6DB", fg: "#B3CFBC" },
  { bg: "#EDE3D1", fg: "#D9C8A8" },
  { bg: "#DEDAEA", fg: "#C3BDD8" },
  { bg: "#EFD9CC", fg: "#DDBBA6" },
  { bg: "#D3E0EA", fg: "#B3C8D8" },
  { bg: "#E3E6D2", fg: "#C9CFAE" },
] as const;

export function coverTint(id: string): { bg: string; fg: string } {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVER_TINTS[hash % COVER_TINTS.length] ?? COVER_TINTS[0];
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code.toUpperCase();
  }
}
