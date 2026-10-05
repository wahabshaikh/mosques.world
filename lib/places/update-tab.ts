import type { UpdateTab } from "@/components/mw/update-times";

/** The Update timings tab a link asks for (`?tab=adhan`), falling back to iqamah. */
export function tabFrom(value: string | string[] | undefined, amenities: boolean): UpdateTab {
  const tab = Array.isArray(value) ? value[0] : value;
  if (tab === "adhan" || tab === "jumuah") return tab;
  if (tab === "amenities" && amenities) return "amenities";
  return "iqamah";
}
