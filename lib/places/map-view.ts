import type { Bbox } from "@/lib/geo/distance";

/**
 * Whether a map view could show places the list doesn't have yet, so "Search this area" is worth a
 * request: the view reaches outside the searched area, or the search was capped and a move can bring
 * other places into the nearest-first window. A small tolerance absorbs rounding in the URL bbox.
 */
export function viewNeedsSearch(view: Bbox, searched: Bbox, truncated: boolean): boolean {
  if (truncated) return true;
  const latSlack = (view.north - view.south) * 0.02;
  const lngSlack = (view.east - view.west) * 0.02;
  return (
    view.south < searched.south - latSlack ||
    view.north > searched.north + latSlack ||
    view.west < searched.west - lngSlack ||
    view.east > searched.east + lngSlack
  );
}

/** The `/search` bbox param for a map view, rounded so URLs stay short (4 dp ≈ 11 m). */
export function bboxParam(bbox: Bbox): string {
  return [bbox.west, bbox.south, bbox.east, bbox.north].map((value) => value.toFixed(4)).join(",");
}
