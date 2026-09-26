import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { renderMosqueCard } from "./card";

function readPng(png: Uint8Array) {
  expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat: Uint8Array[] = [];
  while (offset + 8 <= png.length) {
    const length = view.getUint32(offset);
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
      height = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(4);
    }
    if (type === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const compressed = new Uint8Array(idat.reduce((total, part) => total + part.length, 0));
  let cursor = 0;
  for (const part of idat) {
    compressed.set(part, cursor);
    cursor += part.length;
  }
  return { width, height, raw: inflateSync(compressed) };
}

describe("mosque card", () => {
  it("returns a non-empty 1200x630 PNG", () => {
    const png = renderMosqueCard({ name: "East London Mosque", locality: "Whitechapel" });
    expect(png.byteLength).toBeGreaterThan(1000);
    const image = readPng(png);
    expect(image.width).toBe(1200);
    expect(image.height).toBe(630);
    expect(image.raw[0]).toBe(0);
    expect([...image.raw.subarray(1, 4)]).toEqual([0x0b, 0x6e, 0x4f]);
    const white = image.raw.some((byte, index) => index % 4 !== 0 && byte === 255);
    expect(white).toBe(true);
  });

  it("changes pixels when the mosque name changes", () => {
    const east = renderMosqueCard({ name: "East London Mosque", locality: "London" });
    const blank = renderMosqueCard({ name: "Mosque", locality: "London" });
    expect(Buffer.compare(east, blank)).not.toBe(0);
  });

  it("keeps letters from accented names and wraps a long title", () => {
    const png = renderMosqueCard({
      name: "Masjid Āl-Nūr and the very long community centre of Whitechapel",
      locality: "İstanbul",
    });
    expect(png.byteLength).toBeGreaterThan(1000);
    expect(readPng(png).raw.some((byte) => byte === 255)).toBe(true);
  });
});
