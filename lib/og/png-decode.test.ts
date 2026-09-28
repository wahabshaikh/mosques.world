import { describe, expect, it } from "vitest";
import { encodeRgbPng } from "./png";
import { decodePng } from "./png-decode";

describe("decodePng", () => {
  it("round-trips an RGB PNG into RGBA pixels", async () => {
    const rgb = new Uint8Array(4 * 3 * 3);
    for (let index = 0; index < rgb.length; index += 1) rgb[index] = (index * 37) % 256;
    const decoded = await decodePng(encodeRgbPng(4, 3, rgb));
    expect(decoded?.width).toBe(4);
    expect(decoded?.height).toBe(3);
    expect([...(decoded?.rgba.slice(0, 8) ?? [])]).toEqual([rgb[0], rgb[1], rgb[2], 255, rgb[3], rgb[4], rgb[5], 255]);
  });

  it("rejects non-PNG input", async () => {
    expect(await decodePng(new Uint8Array(40))).toBeNull();
  });
});
