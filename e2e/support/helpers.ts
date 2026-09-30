import { expect, type APIRequestContext, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from "@playwright/test";

export const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5173";
const origin = new URL(baseURL).origin;

let counter = 0;

/** A unique identity per run so suites can be re-run against the same database. */
export function identity(prefix: string) {
  counter += 1;
  const stamp = `${Date.now().toString(36)}${counter}`;
  return {
    email: `${prefix}.${stamp}@example.com`,
    username: `${prefix}.${stamp}`.slice(0, 30),
    ip: `198.51.100.${(Date.now() + counter * 7) % 250}`,
  };
}

export async function latestOtp(request: APIRequestContext, email: string): Promise<string> {
  let code = "";
  await expect
    .poll(async () => {
      const response = await request.get(`/api/v1/test/emails?to=${encodeURIComponent(email)}`);
      const body = (await response.json()) as { messages: Array<{ subject: string }> };
      code = body.messages[0]?.subject.match(/code: (\d{6})/)?.[1] ?? "";
      return code;
    })
    .toMatch(/^\d{6}$/);
  return code;
}

/** Signs up through the UI: email → OTP → onboarding → back to `next`. */
export async function signUp(page: Page, person: ReturnType<typeof identity>, next = "/") {
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": person.ip });
  await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
  await page.getByLabel("Email").fill(person.email);
  await page.getByRole("button", { name: "Email me a code" }).click();
  const code = await latestOtp(page.request, person.email);
  await page.getByLabel("6-digit code").fill(code);
  await page.waitForURL(/\/onboarding/);
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
  await page.getByLabel("Username").fill(person.username);
  await page.getByLabel("Display name").fill(person.username);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/onboarding"));
}

export type SessionFixture = {
  username?: string;
  name?: string;
  /** false stops before onboarding (no username yet). */
  onboarded?: boolean;
  trustLevel?: number;
  role?: "user" | "moderator" | "admin";
  ageDays?: number;
};

/**
 * Signs `email` in with one request to the preview/local-only session endpoint, creating the
 * account if needed. The session cookie lands in the context's cookie jar, so `page`,
 * `page.request` and `context.request` are all signed in. Use `signUp` only to test the OTP UI.
 */
export async function signIn(context: BrowserContext, email: string, fixture: SessionFixture = {}) {
  const response = await context.request.post("/api/v1/test/session", { data: { email, ...fixture } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { user: { id: string; email: string; username: string | null } }).user;
}

/** A fresh, onboarded, signed-in person in their own browser context. */
export async function newUser(
  browser: Browser,
  prefix: string,
  fixture: Omit<SessionFixture, "username" | "name"> = {},
  options: BrowserContextOptions = {},
) {
  const person = identity(prefix);
  const context = await browser.newContext({ ...options, baseURL });
  await signIn(context, person.email, { username: person.username, name: person.username, ...fixture });
  const page = await context.newPage();
  // Page-level, like a real client IP: per-IP rate limits stay per person, service worker fetches are unaffected.
  await page.setExtraHTTPHeaders({ "cf-connecting-ip": person.ip });
  return { context, page, person };
}

export async function setFixture(request: APIRequestContext, body: unknown) {
  const response = await request.post("/api/v1/test/fixtures", { data: body });
  expect(response.ok(), await response.text()).toBeTruthy();
}

export async function resetPlace(request: APIRequestContext, slug: string) {
  await setFixture(request, { resetPlace: slug });
}

/** JSON POST with the Origin header browsers send (mutating routes check it). */
export function post(request: APIRequestContext, path: string, data: unknown) {
  return request.post(path, { data, headers: { origin } });
}

export async function placeId(request: APIRequestContext, slug: string): Promise<string> {
  const page = await request.get(`/m/${slug}`);
  const html = await page.text();
  const id = html.match(/data-place-id="([0-9A-Z]{26})"/)?.[1];
  expect(id).toBeTruthy();
  return id ?? "";
}

export function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
