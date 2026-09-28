import { AMENITIES, amenityValue, type AmenityKey } from "@/lib/trust/facts";
import type { FactView } from "@/lib/trust/read";

export type AmenityRow = {
  key: AmenityKey;
  label: string;
  available: boolean;
  note: string | null;
  confirms: number;
  fromOsm: boolean;
  state: FactView["state"];
};

/** Current amenity values in registry order, for the "What this place offers" list. */
export function amenityRows(facts: FactView[]): AmenityRow[] {
  return AMENITIES.flatMap((amenity) => {
    const fact = facts.find((item) => item.key === amenity.key);
    const parsed = fact?.current ? amenityValue.safeParse(fact.current.value) : null;
    if (!fact?.current || !parsed?.success) return [];
    return [
      {
        key: amenity.key,
        label: amenity.label,
        available: parsed.data.v,
        note: parsed.data.note ?? null,
        confirms: fact.current.backers,
        fromOsm: fact.current.author === "@mosques.world",
        state: fact.state,
      },
    ];
  }).sort((a, b) => Number(b.available) - Number(a.available));
}

/** "Women's section · Wudhu for men & women · Step-free" for the page subtitle. */
export function amenitySummary(rows: AmenityRow[]): string[] {
  const has = (key: string) => rows.some((row) => row.key === key && row.available);
  const parts: string[] = [];
  if (has("amenity.women_section")) parts.push("Women's section");
  if (has("amenity.wudhu_men") && has("amenity.wudhu_women")) parts.push("Wudhu for men & women");
  else if (has("amenity.wudhu_men")) parts.push("Wudhu for men");
  else if (has("amenity.wudhu_women")) parts.push("Wudhu for women");
  if (has("amenity.step_free")) parts.push("Step-free");
  return parts;
}

export { cardTag, matchesNeeds, NEED_FILTERS, needMasks, parseNeeds, type NeedSlug } from "./needs";
