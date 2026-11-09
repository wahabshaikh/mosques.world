/**
 * Polar (merchant of record) for Masjid Pro. Checkout is off until an access token and at least
 * one product id are set. `POLAR_SERVER=production` is required to charge; anything else uses
 * Polar's sandbox, so a token alone cannot bill a real card.
 */

export type PolarInterval = "month" | "year";

export type PolarConfig = {
  token: string;
  server: "sandbox" | "production";
  products: Partial<Record<PolarInterval, string>>;
  webhookSecret?: string;
};

type PolarEnv = {
  POLAR_ACCESS_TOKEN?: string;
  POLAR_WEBHOOK_SECRET?: string;
  POLAR_PRODUCT_MONTHLY_ID?: string;
  POLAR_PRODUCT_YEARLY_ID?: string;
  POLAR_SERVER?: string;
};

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/** Configured checkout, or null when Masjid Pro cannot take payment. */
export function readPolarConfig(env: PolarEnv): PolarConfig | null {
  const token = env.POLAR_ACCESS_TOKEN?.trim();
  if (!token) return null;
  const month = env.POLAR_PRODUCT_MONTHLY_ID?.trim() || undefined;
  const year = env.POLAR_PRODUCT_YEARLY_ID?.trim() || undefined;
  if (!month && !year) return null;
  return {
    token,
    server: env.POLAR_SERVER === "production" ? "production" : "sandbox",
    products: { month, year },
    webhookSecret: env.POLAR_WEBHOOK_SECRET?.trim() || undefined,
  };
}

export function polarApiBase(server: PolarConfig["server"]): string {
  return server === "production" ? "https://api.polar.sh/v1" : "https://sandbox-api.polar.sh/v1";
}

/** Product ids this deployment is willing to treat as Masjid Pro. */
export function polarProductIds(config: PolarConfig | null): string[] {
  if (!config) return [];
  return [config.products.month, config.products.year].filter((id): id is string => Boolean(id));
}

export function polarCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2000) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return null;
    if (host !== "polar.sh" && !host.endsWith(".polar.sh")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Success and return URLs we are willing to hand to Polar. */
export function safeAppUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export type CheckoutRequest = {
  productId: string;
  successUrl: string;
  returnUrl: string;
  email: string;
  placeId: string;
  userId: string;
  interval: PolarInterval;
};

export async function createPolarCheckout(
  config: PolarConfig,
  input: CheckoutRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<{ url: string } | { error: string }> {
  const successUrl = safeAppUrl(input.successUrl);
  const returnUrl = safeAppUrl(input.returnUrl);
  if (!successUrl || !returnUrl) return { error: "The return address for checkout was not accepted." };
  let response: Response;
  try {
    response = await fetchImpl(`${polarApiBase(config.server)}/checkouts/`, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        products: [input.productId],
        success_url: successUrl,
        return_url: returnUrl,
        customer_email: input.email,
        external_customer_id: input.userId,
        metadata: { place_id: input.placeId, user_id: input.userId, interval: input.interval },
      }),
    });
  } catch {
    return { error: "Masjid Pro checkout could not be started. Try again in a moment." };
  }
  if (response.status >= 300 && response.status < 400) {
    return { error: "Masjid Pro checkout could not be started. Try again in a moment." };
  }
  const text = await response.text();
  if (text.length > 20_000 || !response.ok) {
    return { error: "Masjid Pro checkout could not be started. Try again in a moment." };
  }
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { error: "Masjid Pro checkout could not be started. Try again in a moment." };
  }
  const url = polarCheckoutUrl(body && typeof body === "object" ? (body as { url?: unknown }).url : null);
  if (!url) return { error: "Masjid Pro checkout could not be started. Try again in a moment." };
  return { url };
}

function decodeBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

/** A fresh ArrayBuffer, which `crypto.subtle.importKey` accepts. */
function keyBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Bytes of a Polar webhook secret (`polar_whs_…` or `whsec_…`, or raw base64). */
export function webhookKeyBytes(secret: string): Uint8Array | null {
  const trimmed = secret.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.startsWith("polar_whs_") ? trimmed.slice("polar_whs_".length) : trimmed.startsWith("whsec_") ? trimmed.slice("whsec_".length) : null;
  if (prefixed !== null) return decodeBase64(prefixed);
  return decodeBase64(trimmed) ?? new TextEncoder().encode(trimmed);
}

function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) diff |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return diff === 0;
}

export type WebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

/** Standard Webhooks signature, which is what Polar sends. */
export async function verifyPolarWebhook(
  rawBody: string,
  headers: WebhookHeaders,
  secret: string,
  now: number,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const key = webhookKeyBytes(secret);
  if (!key || !headers.id || !headers.timestamp || !headers.signature) return { ok: false, reason: "missing" };
  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: "timestamp" };
  const stampMs = timestamp > 1e12 ? timestamp : timestamp * 1000;
  if (Math.abs(now - stampMs) > FIVE_MINUTES_MS) return { ok: false, reason: "stale" };
  const cryptoKey = await crypto.subtle.importKey("raw", keyBuffer(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(`${headers.id}.${headers.timestamp}.${rawBody}`));
  const expected = decodeBase64(encodeBase64(mac));
  if (!expected) return { ok: false, reason: "signature" };
  const presented = headers.signature
    .split(" ")
    .map((part) => (part.startsWith("v1,") ? decodeBase64(part.slice(3)) : null))
    .filter((part): part is Uint8Array => part !== null);
  if (!presented.some((candidate) => safeEqual(candidate, expected))) return { ok: false, reason: "signature" };
  return { ok: true, id: headers.id };
}
