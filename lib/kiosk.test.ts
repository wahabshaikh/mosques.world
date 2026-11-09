import { describe, expect, it } from "vitest";
import { isKioskPath } from "./kiosk";

describe("isKioskPath", () => {
  it("matches the lobby screen and the widget, including a locale prefix", () => {
    expect(isKioskPath("/m/east-london-mosque-whitechapel/display")).toBe(true);
    expect(isKioskPath("/m/east-london-mosque-whitechapel/widget")).toBe(true);
    expect(isKioskPath("/ar/m/east-london-mosque-whitechapel/display")).toBe(true);
    expect(isKioskPath("/m/east-london-mosque-whitechapel")).toBe(false);
    expect(isKioskPath("/m/east-london-mosque-whitechapel/pro")).toBe(false);
    expect(isKioskPath("/for-mosques")).toBe(false);
  });
});
