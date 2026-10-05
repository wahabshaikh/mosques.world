import { bboxAround, type Bbox } from "@/lib/geo/distance";

export type PlaceKindFilter = "all" | "mosque" | "prayer_room";

export type ExploreView = {
  lat: number;
  lng: number;
  zoom: number;
  where: string;
  kind: PlaceKindFilter;
  bbox: Bbox;
  source: "url" | "ip" | "default";
};

const LONDON = { lat: 51.5074, lng: -0.1278, where: "London" };

function numberParam(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseBbox(value: string | undefined): Bbox | null {
  if (!value) return null;
  const parts = value.split(",").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return null;
  const [west, south, east, north] = parts;
  if (west === undefined || south === undefined || east === undefined || north === undefined) return null;
  if (south >= north || west >= east) return null;
  return { west, south, east, north };
}

export function resolveExploreView(input: {
  where?: string;
  lat?: string;
  lng?: string;
  z?: string;
  kind?: string;
  bbox?: string;
  headerLat?: string | null;
  headerLng?: string | null;
}): ExploreView {
  const urlLat = numberParam(input.lat);
  const urlLng = numberParam(input.lng);
  const headerLat = numberParam(input.headerLat ?? undefined);
  const headerLng = numberParam(input.headerLng ?? undefined);
  let lat = LONDON.lat;
  let lng = LONDON.lng;
  let where = input.where?.trim() || "";
  let source: ExploreView["source"] = "default";

  if (urlLat !== null && urlLng !== null) {
    lat = urlLat;
    lng = urlLng;
    source = "url";
    if (!where) where = "Map area";
  } else if (headerLat !== null && headerLng !== null) {
    lat = headerLat;
    lng = headerLng;
    source = "ip";
    if (!where) where = "Near you";
  } else if (!where) {
    where = LONDON.where;
  }

  const zoom = Math.min(16, Math.max(3, numberParam(input.z) ?? (source === "url" ? 12 : 11)));
  const kind: PlaceKindFilter =
    input.kind === "prayer_room" || input.kind === "mosque" ? input.kind : "all";
  const parsed = parseBbox(input.bbox);
  const radius = zoom >= 13 ? 8 : zoom >= 11 ? 20 : 60;
  return { lat, lng, zoom, where, kind, bbox: parsed ?? bboxAround(lat, lng, radius), source };
}

export function ftsMatch(input: string): string {
  const terms = input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1);
  return terms.map((term) => `"${term}"*`).join(" ");
}

/** Searches per IP per hour before Turnstile; the free geocoder (KV-cached Photon) can afford far more than Google. */
export function geocodeDecision(count: number, hasTurnstile: boolean, limit = 20): "allow" | "challenge" | "block" {
  if (count < limit) return "allow";
  if (hasTurnstile) return "challenge";
  return "block";
}
