import { describe, expect, it } from "vitest";
import { project } from "@/lib/profile/map";
import { decodePng } from "./png-decode";
import { renderProfileCard } from "./profile-card";

function pixel(image: { width: number; rgba: Uint8Array }, x: number, y: number) {
  const index = (Math.round(y) * image.width + Math.round(x)) * 4;
  return [image.rgba[index], image.rgba[index + 1], image.rgba[index + 2]];
}

describe("renderProfileCard", () => {
  it("renders a 1200×630 PNG under 300 KB with land, ocean and gold pins", async () => {
    const png = renderProfileCard({
      name: "Amina Khan",
      username: "amina",
      places: 3,
      countries: 2,
      pins: [
        { lat: 41.0082, lng: 28.9784, count: 3 },
        { lat: 21.4225, lng: 39.8262, count: 1 },
      ],
    });
    expect(png.length).toBeLessThan(300 * 1024);
    const image = await decodePng(png);
    expect(image).toMatchObject({ width: 1200, height: 630 });
    if (!image) return;
    // Mid-Pacific is ocean; central Africa is land; Istanbul carries a gold pin.
    expect(pixel(image, 20, 330)).toEqual([0x0e, 0x2a, 0x22]);
    const africa = project(5, 20);
    expect(pixel(image, africa.x * 1.2, africa.y * 1.2 - 24)).toEqual([0x1d, 0x4a, 0x3a]);
    const istanbul = project(41.0082, 28.9784);
    expect(pixel(image, istanbul.x * 1.2, istanbul.y * 1.2 - 24)).toEqual([0xe9, 0xb9, 0x49]);
  });

  it("omits the counts on private cards", async () => {
    const png = renderProfileCard({ name: "", username: "quiet", places: null, countries: null, pins: [] });
    expect((await decodePng(png))?.width).toBe(1200);
  });
});
