import { LAND_RINGS } from "@/lib/geo/land";

/** Equirectangular geometry shared by the profile hero map (SVG) and the share card (PNG). */

export const MAP_WIDTH = 1000;
export const MAP_HEIGHT = 500;

export function project(lat: number, lng: number): { x: number; y: number } {
  return { x: ((lng + 180) / 360) * MAP_WIDTH, y: ((90 - lat) / 180) * MAP_HEIGHT };
}

let landPath: string | null = null;

/** Natural Earth 110m land as one SVG path on the 1000×500 grid. */
export function landSvgPath(): string {
  if (landPath) return landPath;
  landPath = LAND_RINGS.map((ring) => {
    let path = `M${ring[0]} ${ring[1]}`;
    for (let index = 2; index < ring.length; index += 2) path += `L${ring[index]} ${ring[index + 1]}`;
    return `${path}Z`;
  }).join("");
  return landPath;
}

/** Dot and halo radii (grid units) for a pin, growing gently with visits. */
export function pinSize(count: number): { dot: number; halo: number } {
  const n = Math.min(Math.max(count, 1), 12);
  return { dot: 3 + Math.log2(n + 1) * 1.1, halo: 7 + Math.log2(n + 1) * 3 };
}

export type ViewBox = { x: number; y: number; width: number; height: number };

/** The inhabited world (no Antarctica) when there are no pins. */
export const WORLD_VIEW: ViewBox = { x: 0, y: 20, width: 1000, height: 400 };

/** Frames the pins with padding, never tighter than a region and never outside the world. */
export function viewBoxFor(points: Array<{ lat: number; lng: number }>, aspect = 2.2): ViewBox {
  if (points.length === 0) return WORLD_VIEW;
  const projected = points.map((point) => project(point.lat, point.lng));
  const xs = projected.map((point) => point.x);
  const ys = projected.map((point) => point.y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  const padX = Math.max(60, (maxX - minX) * 0.2);
  const padY = Math.max(40, (maxY - minY) * 0.25);
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;
  let width = Math.max(maxX - minX, 360);
  let height = Math.max(maxY - minY, 160);
  if (width / height < aspect) width = height * aspect;
  else height = width / aspect;
  width = Math.min(width, MAP_WIDTH);
  height = Math.min(height, MAP_HEIGHT);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const x = Math.min(Math.max(centerX - width / 2, 0), MAP_WIDTH - width);
  const y = Math.min(Math.max(centerY - height / 2, 0), MAP_HEIGHT - height);
  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
