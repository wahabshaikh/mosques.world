import { glyphFor, GLYPH_HEIGHT, GLYPH_WIDTH } from "./font";
import { encodeRgbPng } from "./png";

const WIDTH = 1200;
const HEIGHT = 630;
const GREEN: Rgb = [0x0b, 0x6e, 0x4f];
const WHITE: Rgb = [255, 255, 255];
const MUTED: Rgb = [206, 226, 220];

type Rgb = [number, number, number];

function paint(rgb: Uint8Array, x: number, y: number, color: Rgb) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
  const index = (y * WIDTH + x) * 3;
  rgb[index] = color[0];
  rgb[index + 1] = color[1];
  rgb[index + 2] = color[2];
}

function drawText(rgb: Uint8Array, text: string, x: number, y: number, scale: number, color: Rgb) {
  let cursor = x;
  for (const char of text) {
    const rows = glyphFor(char);
    for (let row = 0; row < GLYPH_HEIGHT; row += 1) {
      const bits = rows[row] ?? 0;
      for (let col = 0; col < GLYPH_WIDTH; col += 1) {
        if ((bits & (1 << (GLYPH_WIDTH - 1 - col))) === 0) continue;
        for (let py = 0; py < scale; py += 1) {
          for (let px = 0; px < scale; px += 1) {
            paint(rgb, cursor + col * scale + px, y + row * scale + py, color);
          }
        }
      }
    }
    cursor += GLYPH_WIDTH * scale + scale;
  }
}

function advance(scale: number) {
  return GLYPH_WIDTH * scale + scale;
}

function wrap(text: string, scale: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length * advance(scale) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

export function labelForCard(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").replace(/[^\x20-\x7e]/g, " ").replace(/\s+/g, " ").trim();
}

export function renderMosqueCard(input: { name: string; locality: string }): Uint8Array {
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3);
  for (let index = 0; index < rgb.length; index += 3) {
    rgb[index] = GREEN[0];
    rgb[index + 1] = GREEN[1];
    rgb[index + 2] = GREEN[2];
  }
  const maxWidth = WIDTH - 128;
  const nameLines = wrap(labelForCard(input.name || "Mosque").toUpperCase() || "MOSQUE", 8, maxWidth);
  const locality = labelForCard(input.locality).toUpperCase();
  const nameScale = 8;
  const lineHeight = GLYPH_HEIGHT * nameScale + 10;
  const block =
    GLYPH_HEIGHT * 3 +
    18 +
    nameLines.length * lineHeight +
    (locality ? 14 + GLYPH_HEIGHT * 4 : 0);
  let y = HEIGHT - 64 - block;
  drawText(rgb, "MOSQUES.WORLD", 64, y, 3, MUTED);
  y += GLYPH_HEIGHT * 3 + 18;
  for (const line of nameLines) {
    drawText(rgb, line, 64, y, nameScale, WHITE);
    y += lineHeight;
  }
  if (locality) drawText(rgb, locality, 64, y + 4, 4, WHITE);
  return encodeRgbPng(WIDTH, HEIGHT, rgb);
}
