import { LAND_RINGS } from "@/lib/geo/land";
import { pinSize, project } from "@/lib/profile/map";
import { drawText, labelForCard, paint, wrap, type Rgb } from "./card";
import { GLYPH_HEIGHT } from "./font";
import { encodeRgbPng } from "./png";

const WIDTH = 1200;
const HEIGHT = 630;
const OCEAN: Rgb = [0x0e, 0x2a, 0x22];
const LAND: Rgb = [0x1d, 0x4a, 0x3a];
const GOLD: Rgb = [0xe9, 0xb9, 0x49];
const HALO: Rgb = [0x4b, 0x5a, 0x33];
const WHITE: Rgb = [255, 255, 255];
const MUTED: Rgb = [0xd5, 0xe3, 0xdc];

/** The 1000×500 grid drawn at 1.2× and shifted so the inhabited world fills the card. */
const SCALE = 1.2;
const OFFSET_Y = -24;

function toCard(x: number, y: number) {
  return { x: x * SCALE, y: y * SCALE + OFFSET_Y };
}

/** Even-odd scanline fill of every land ring at once. */
function fillLand(rgb: Uint8Array) {
  const edges: Array<[number, number, number, number]> = [];
  for (const ring of LAND_RINGS) {
    for (let index = 0; index < ring.length; index += 2) {
      const next = (index + 2) % ring.length;
      const a = toCard(ring[index] ?? 0, ring[index + 1] ?? 0);
      const b = toCard(ring[next] ?? 0, ring[next + 1] ?? 0);
      if (a.y !== b.y) edges.push([a.x, a.y, b.x, b.y]);
    }
  }
  const crossings: number[] = [];
  for (let y = 0; y < HEIGHT; y += 1) {
    const scan = y + 0.5;
    crossings.length = 0;
    for (const [x1, y1, x2, y2] of edges) {
      if ((scan >= y1 && scan < y2) || (scan >= y2 && scan < y1)) crossings.push(x1 + ((scan - y1) / (y2 - y1)) * (x2 - x1));
    }
    crossings.sort((left, right) => left - right);
    for (let index = 0; index + 1 < crossings.length; index += 2) {
      const from = Math.max(0, Math.ceil((crossings[index] ?? 0) - 0.5));
      const to = Math.min(WIDTH - 1, Math.floor((crossings[index + 1] ?? 0) - 0.5));
      for (let x = from; x <= to; x += 1) paint(rgb, x, y, LAND);
    }
  }
}

function disc(rgb: Uint8Array, cx: number, cy: number, radius: number, color: Rgb) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) paint(rgb, x, y, color);
    }
  }
}

export type ProfileCardInput = {
  name: string;
  username: string;
  /** Null when check-ins are private: the card then shows no counts. */
  places: number | null;
  countries: number | null;
  pins: Array<{ lat: number; lng: number; count: number }>;
};

/** Share card for `/og/u/[username]` (spec 3.5 ShareCard): night map, gold pins, name and counts. */
export function renderProfileCard(input: ProfileCardInput): Uint8Array {
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let index = 0; index < rgb.length; index += 3) {
    rgb[index] = OCEAN[0];
    rgb[index + 1] = OCEAN[1];
    rgb[index + 2] = OCEAN[2];
  }
  fillLand(rgb);
  const sorted = [...input.pins].sort((left, right) => left.count - right.count).slice(-2000);
  for (const pin of sorted) {
    const point = project(pin.lat, pin.lng);
    const at = toCard(point.x, point.y);
    const size = pinSize(pin.count);
    disc(rgb, at.x, at.y, size.halo * SCALE, HALO);
  }
  for (const pin of sorted) {
    const point = project(pin.lat, pin.lng);
    const at = toCard(point.x, point.y);
    const size = pinSize(pin.count);
    disc(rgb, at.x, at.y, size.dot * SCALE + 1.5, OCEAN);
    disc(rgb, at.x, at.y, size.dot * SCALE, GOLD);
  }

  const handle = labelForCard(`mosques.world/@${input.username}`).toUpperCase();
  drawText(rgb, handle, 56, 52, 3, GOLD);
  const nameLines = wrap(labelForCard(input.name).toUpperCase() || input.username.toUpperCase(), 7, WIDTH - 112).slice(0, 2);
  let y = 52 + GLYPH_HEIGHT * 3 + 20;
  for (const line of nameLines) {
    drawText(rgb, line, 56, y, 7, WHITE);
    y += GLYPH_HEIGHT * 7 + 10;
  }
  const stats =
    input.places === null || input.countries === null
      ? "MOSQUES.WORLD"
      : `${input.places} ${input.places === 1 ? "MOSQUE" : "MOSQUES"} - ${input.countries} ${input.countries === 1 ? "COUNTRY" : "COUNTRIES"}`;
  drawText(rgb, stats, 56, HEIGHT - 56 - GLYPH_HEIGHT * 5, 5, MUTED);
  return encodeRgbPng(WIDTH, HEIGHT, rgb);
}
