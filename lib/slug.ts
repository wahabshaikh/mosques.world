export function slugify(value: string): string {
  const stripped = value.replaceAll("İ", "I").replaceAll("ı", "i");
  const normalized = stripped.normalize("NFKD").replace(/\p{M}/gu, "");
  return normalized
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function placeSlug(name: string, locality: string | null | undefined): string {
  return [slugify(name), locality ? slugify(locality) : ""].filter(Boolean).join("-");
}

export function uniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}
