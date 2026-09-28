/** Explore "needs" filters, kept free of zod so the explore bundle stays small. */

/** Spec 4.3 CategoryBar. `any` masks match when one of the bits is set. Bits follow AMENITIES in lib/trust/facts. */
export const NEED_FILTERS = [
  { slug: "women_section", label: "Women's section", mask: 1 << 0, any: false },
  { slug: "wudhu", label: "Wudhu area", mask: (1 << 1) | (1 << 2), any: true },
  { slug: "step_free", label: "Step-free", mask: 1 << 3, any: false },
  { slug: "parking", label: "Parking", mask: 1 << 4, any: false },
  { slug: "open_for_fajr", label: "Open for Fajr", mask: 1 << 9, any: false },
  { slug: "classes", label: "Classes", mask: 1 << 6, any: false },
  { slug: "toilets", label: "Toilets", mask: 1 << 5, any: false },
  { slug: "janazah", label: "Janazah service", mask: 1 << 7, any: false },
  { slug: "open_between_prayers", label: "Open between prayers", mask: 1 << 8, any: false },
] as const;
export type NeedSlug = (typeof NEED_FILTERS)[number]["slug"];

export function parseNeeds(value: string | string[] | undefined): NeedSlug[] {
  const raw = (Array.isArray(value) ? value : [value ?? ""]).flatMap((item) => item.split(","));
  return NEED_FILTERS.map((filter) => filter.slug).filter((slug) => raw.includes(slug));
}

/** SQL-ready constraints: every `all` bit required, and at least one bit of each `any` group. */
export function needMasks(needs: NeedSlug[]): { all: number; any: number[] } {
  let all = 0;
  const any: number[] = [];
  for (const slug of needs) {
    const filter = NEED_FILTERS.find((item) => item.slug === slug);
    if (!filter) continue;
    if (filter.any) any.push(filter.mask);
    else all |= filter.mask;
  }
  return { all, any };
}

export function matchesNeeds(bits: number, needs: NeedSlug[]): boolean {
  const { all, any } = needMasks(needs);
  return (bits & all) === all && any.every((mask) => (bits & mask) !== 0);
}

/** A short amenity tag for explore cards, preferring what people filter by most. */
export function cardTag(bits: number): string | null {
  for (const filter of NEED_FILTERS) {
    if (matchesNeeds(bits, [filter.slug])) return filter.label;
  }
  return null;
}
