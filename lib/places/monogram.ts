const FILLER = new Set(["the", "and", "of", "al", "el", "mosque", "masjid", "masjed", "mesjid", "jamia", "jami", "jame", "islamic", "muslim", "centre", "center", "community", "cultural", "society", "trust", "e", "ul", "ki"]);

/** Two letters that tell places apart in a list ("Darul Ummah Mosque" → "DU"), skipping words every mosque shares. */
export function placeMonogram(name: string): string {
  const words = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const telling = words.filter((word) => !FILLER.has(word.toLowerCase()));
  const pick = telling.length > 0 ? telling : words;
  if (pick.length === 0) return "?";
  const letters = pick.length > 1 ? `${[...pick[0]!][0]}${[...pick[1]!][0]}` : [...pick[0]!].slice(0, 2).join("");
  return letters.toLocaleUpperCase();
}
