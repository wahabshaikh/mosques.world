import { describe, expect, it } from "vitest";
import { createPolarCheckout, polarCheckoutUrl, readPolarConfig, safeAppUrl, verifyPolarWebhook, webhookKeyBytes } from "./polar";

const SECRET_RAW = "test-secret-key-32bytes-long!!";
const SECRET = `polar_whs_${btoa(SECRET_RAW)}`;

async function sign(id: string, timestamp: string, body: string, secret = SECRET): Promise<string> {
  const keyBytes = webhookKeyBytes(secret);
  if (!keyBytes) throw new Error("secret");
  const copy = new Uint8Array(keyBytes.byteLength);
  copy.set(keyBytes);
  const key = await crypto.subtle.importKey("raw", copy.buffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  const bytes = new Uint8Array(mac);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `v1,${btoa(binary)}`;
}

describe("readPolarConfig", () => {
  it("stays off until a token and a product id exist, and defaults to the sandbox", () => {
    expect(readPolarConfig({})).toBeNull();
    expect(readPolarConfig({ POLAR_ACCESS_TOKEN: "tok" })).toBeNull();
    const config = readPolarConfig({ POLAR_ACCESS_TOKEN: " tok ", POLAR_PRODUCT_YEARLY_ID: " year " });
    expect(config).toMatchObject({ token: "tok", server: "sandbox", products: { year: "year" } });
    expect(readPolarConfig({ POLAR_ACCESS_TOKEN: "tok", POLAR_PRODUCT_MONTHLY_ID: "m", POLAR_SERVER: "production" })?.server).toBe("production");
    expect(readPolarConfig({ POLAR_ACCESS_TOKEN: "tok", POLAR_PRODUCT_MONTHLY_ID: "m", POLAR_SERVER: "sandbox" })?.server).toBe("sandbox");
  });
});

describe("polar urls", () => {
  it("only accepts Polar-hosted checkout urls and our own return urls", () => {
    expect(polarCheckoutUrl("https://buy.polar.sh/checkout/abc")).toBe("https://buy.polar.sh/checkout/abc");
    expect(polarCheckoutUrl("https://sandbox.polar.sh/checkout/abc")).toMatch(/^https:\/\/sandbox\.polar\.sh/);
    expect(polarCheckoutUrl("https://evil.polar.sh.example/checkout")).toBeNull();
    expect(polarCheckoutUrl("http://polar.sh/checkout")).toBeNull();
    expect(polarCheckoutUrl("https://example.com")).toBeNull();
    expect(safeAppUrl("https://mosques.world/m/east-london/pro?checkout=return")).toMatch(/^https:\/\/mosques\.world/);
    expect(safeAppUrl("http://127.0.0.1:5173/m/x/pro")).toMatch(/^http:\/\/127\.0\.0\.1:5173/);
    expect(safeAppUrl("http://mosques.world/m/x")).toBeNull();
    expect(safeAppUrl("javascript:alert(1)")).toBeNull();
  });
});

describe("verifyPolarWebhook", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const body = JSON.stringify({ type: "subscription.active", data: { id: "sub" } });

  it("accepts a fresh signature and rejects a bad, stale, or incomplete one", async () => {
    const timestamp = String(Math.floor(now / 1000));
    const signature = await sign("evt_1", timestamp, body);
    expect(await verifyPolarWebhook(body, { id: "evt_1", timestamp, signature }, SECRET, now)).toEqual({ ok: true, id: "evt_1" });
    expect((await verifyPolarWebhook(body, { id: "evt_1", timestamp, signature: "v1,AAAA" }, SECRET, now)).ok).toBe(false);
    expect((await verifyPolarWebhook(body, { id: "evt_1", timestamp: String(Math.floor(now / 1000) - 600), signature }, SECRET, now)).ok).toBe(false);
    expect((await verifyPolarWebhook(body, { id: null, timestamp, signature }, SECRET, now)).ok).toBe(false);
    expect((await verifyPolarWebhook(body, { id: "evt_1", timestamp, signature }, "polar_whs_%%%", now)).ok).toBe(false);
  });
});

describe("createPolarCheckout", () => {
  const config = readPolarConfig({ POLAR_ACCESS_TOKEN: "tok", POLAR_PRODUCT_MONTHLY_ID: "prod_m", POLAR_SERVER: "sandbox" })!;
  const input = {
    productId: "prod_m",
    successUrl: "https://mosques.world/m/elm/pro?checkout=return",
    returnUrl: "https://mosques.world/m/elm/pro",
    email: "committee@example.com",
    placeId: "place",
    userId: "user",
    interval: "month" as const,
  };

  it("returns a Polar url and refuses a redirect or a foreign url", async () => {
    const ok = await createPolarCheckout(config, input, async (url, init) => {
      expect(String(url)).toBe("https://sandbox-api.polar.sh/v1/checkouts/");
      expect(init?.redirect).toBe("manual");
      const body = JSON.parse(String(init?.body));
      expect(body.metadata.place_id).toBe("place");
      expect(body.products).toEqual(["prod_m"]);
      return new Response(JSON.stringify({ url: "https://sandbox.polar.sh/checkout/abc" }), { status: 201 });
    });
    expect(ok).toEqual({ url: "https://sandbox.polar.sh/checkout/abc" });

    const redirected = await createPolarCheckout(config, input, async () => new Response(null, { status: 302, headers: { location: "https://evil.example" } }));
    expect(redirected).toEqual({ error: "Masjid Pro checkout could not be started. Try again in a moment." });

    const foreign = await createPolarCheckout(config, input, async () => new Response(JSON.stringify({ url: "https://evil.example/pay" }), { status: 200 }));
    expect("error" in foreign).toBe(true);
  });

  it("does not send a return url we do not control", async () => {
    const result = await createPolarCheckout(config, { ...input, successUrl: "https://evil.example/steal" }, async () => {
      throw new Error("should not fetch");
    });
    expect("error" in result).toBe(true);
  });
});
