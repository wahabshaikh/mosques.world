import { describe, expect, it, vi } from "vitest";
import { placesContext, placesDailyCap } from "./places/context";
import { isPhotoMessage } from "./jobs";
import { verifyTurnstile } from "./turnstile";

describe("turnstile", () => {
  it("verifies tokens with siteverify", async () => {
    const ok = vi.fn(async () => Response.json({ success: true }));
    expect(await verifyTurnstile("t", "s", ok as unknown as typeof fetch)).toBe(true);
    expect(await verifyTurnstile("", "s", ok as unknown as typeof fetch)).toBe(false);
    const down = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await verifyTurnstile("t", "s", down as unknown as typeof fetch)).toBe(false);
    const denied = vi.fn(async () => Response.json({ success: false }));
    expect(await verifyTurnstile("t", "s", denied as unknown as typeof fetch)).toBe(false);
  });
});

describe("places context and messages", () => {
  it("uses mocks only where the email sink is on and reads the daily cap", () => {
    const cache = {} as KVNamespace;
    expect(placesContext({ CACHE: cache, EMAIL_SINK: "1", GOOGLE_MAPS_API_KEY: "k" } as never, "mosques.world")).toEqual({ apiKey: "k", cache, mocks: true });
    expect(placesContext({ CACHE: cache, EMAIL_SINK: "0" } as never, "mosques.world").mocks).toBe(false);
    expect(placesDailyCap({ GOOGLE_PLACES_DAILY_CAP: "500" } as never)).toBe(500);
    expect(placesDailyCap({ GOOGLE_PLACES_DAILY_CAP: "nope" } as never)).toBe(2000);
    expect(placesDailyCap({} as never)).toBe(2000);
    expect(isPhotoMessage({ kind: "photo", id: "x" })).toBe(true);
    expect(isPhotoMessage({ kind: "photo" })).toBe(false);
    expect(isPhotoMessage(null)).toBe(false);
  });
});
