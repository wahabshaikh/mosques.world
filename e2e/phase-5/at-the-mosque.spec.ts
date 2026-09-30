import { expect as baseExpect, test, type BrowserContextOptions, type Page } from "@playwright/test";
import { newUser, placeId, post, resetPlace, todayIn } from "../support/helpers";

const expect = baseExpect.configure({ timeout: 15_000 });

const VERIFY = "al-risaalah-mosque-islington-islamic-centre-holloway";
const VERIFY_AT = { latitude: 51.5575619, longitude: -0.1202397 };
const SAVED = "aziziye-mosque-and-community-centre-shacklewell";

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
}

test.describe("phase 5 at the mosque", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  let device: BrowserContextOptions = {};
  test.beforeEach(({ viewport, userAgent, isMobile, hasTouch, deviceScaleFactor }) => {
    device = { viewport, userAgent, isMobile, hasTouch, deviceScaleFactor };
  });

  test("I'm here resolves the mosque and asks the disputed Isha first; 3 answers are 3 geo-verified votes", async ({ browser, request }) => {
    await resetPlace(request, VERIFY);
    const id = await placeId(request, VERIFY);
    // Isha 8:45 PM is current; another member says 8:30 PM.
    for (const [prefix, time] of [
      ["isha.a", "20:45"],
      ["isha.b", "20:30"],
    ] as const) {
      const member = await newUser(browser, prefix, { trustLevel: 1, ageDays: 30 });
      const response = await post(member.page.request, `/api/v1/places/${id}/contributions`, {
        effectiveFrom: todayIn("Europe/London"),
        source: "board",
        changes: [{ key: "iqamah.isha", value: { t: time } }],
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      await member.context.close();
    }

    const visitor = await newUser(browser, "at.mosque", { trustLevel: 1, ageDays: 30 }, { ...device, geolocation: VERIFY_AT, permissions: ["geolocation"] });
    const { page } = visitor;
    await visit(page, `/m/${VERIFY}`);
    await page.getByRole("link", { name: "I'm here" }).click();
    await page.waitForURL(/\/verify\?place=/);

    const sheet = page.getByTestId("verify-sheet");
    await expect(sheet).toContainText("YOU'RE AT");
    await expect(sheet.getByRole("heading", { level: 1 })).toContainText("Al-Risaalah");
    await expect(sheet).toContainText(/Checked in for \w+/);
    const first = sheet.locator("[data-question]");
    await expect(first).toHaveAttribute("data-question", "dispute:iqamah.isha");
    await expect(first).toContainText("Is Isha iqamah now 8:30 PM?");
    await sheet.getByRole("button", { name: "Yes, it's 8:30" }).click();
    await expect(sheet.locator("[data-question]")).toHaveAttribute("data-question", /^amenity:/);
    await sheet.getByRole("button", { name: "Yes", exact: true }).click();
    await expect(sheet).toContainText("Quick check 3 of 3");
    await sheet.getByRole("button", { name: "No", exact: true }).click();
    await expect(sheet.getByRole("heading", { name: "JazakAllahu khayran" })).toBeVisible();
    await expect(sheet).toContainText(/You've verified \d+ timing/);

    const response = await post(page.request, "/api/v1/test/fixtures", { votesOf: visitor.person.email });
    const body = (await response.json()) as { votes: Array<{ geo_verified: number; key: string; polarity: number }> };
    expect(body.votes).toHaveLength(3);
    expect(body.votes.every((vote) => vote.geo_verified === 1 && vote.polarity === 1)).toBe(true);
    expect(body.votes[0]?.key).toBe("iqamah.isha");
    const checkins = (await (await post(page.request, "/api/v1/test/fixtures", { checkinsOf: visitor.person.email })).json()) as {
      checkins: Array<{ geo_verified: number }>;
    };
    expect(checkins.checkins).toHaveLength(1);
    expect(checkins.checkins[0]?.geo_verified).toBe(1);
    await visitor.context.close();
  });

  test("far from any mosque, I'm here says so", async ({ browser }) => {
    const visitor = await newUser(browser, "far.away", {}, { ...device, geolocation: { latitude: 0, longitude: -30 }, permissions: ["geolocation"] });
    await visit(visitor.page, "/verify");
    await expect(visitor.page.getByRole("heading", { name: "No mosque within 150 m" })).toBeVisible();
    await visitor.context.close();
  });

  // Tagged @chromium-phone: in CI, Playwright's WebKit fails the offline reload itself ("WebKit encountered an
  // internal error") before the service worker can answer, so this runs on the phone-sized Chromium project.
  test("offline, saved places still show their times", { tag: "@chromium-phone" }, async ({ browser, request }) => {
    const member = await newUser(browser, "offline", {}, device);
    const { page, context } = member;
    const saved = await post(page.request, "/api/v1/saved", { placeId: await placeId(request, SAVED) });
    expect(saved.ok(), await saved.text()).toBeTruthy();
    // Land on the home page first, as a person does, so /saved's own loads all run under the worker.
    await visit(page, "/");
    await visit(page, "/saved");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    // A second load runs under the service worker, which caches the page, its code and the 7-day times.
    await visit(page, "/saved");
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    await expect(page.locator(`[data-saved-times="${SAVED}"]`)).toBeVisible();
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.reload();
    const times = page.locator(`[data-saved-times="${SAVED}"]`);
    await expect(times).toBeVisible();
    await expect(times).toContainText(/Fajr/);
    await expect(times).toContainText(/\d{1,2}:\d{2} (AM|PM)/);
    await expect(page.getByText("Offline — saved times")).toBeVisible();
    await context.setOffline(false);
    await context.close();
  });

  test("the app is installable", async ({ browser, browserName, request }) => {
    const manifest = (await (await request.get("/manifest.webmanifest")).json()) as {
      display: string;
      start_url: string;
      icons: Array<{ sizes: string; purpose?: string }>;
    };
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
    for (const icon of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"]) {
      expect((await request.get(icon)).headers()["content-type"]).toBe("image/png");
    }
    const sw = await request.get("/sw.js");
    expect(sw.ok()).toBeTruthy();
    expect(sw.headers()["content-type"]).toContain("javascript");

    // Chromium reports the same installability checks Lighthouse uses; WebKit has no equivalent API.
    test.skip(browserName !== "chromium", "Installability errors are a Chromium DevTools API");
    const context = await browser.newContext(device);
    const page = await context.newPage();
    await visit(page, "/");
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    const client = await context.newCDPSession(page);
    // Playwright contexts are incognito, which Chrome always reports; every other check must pass.
    await expect
      .poll(async () => {
        const result = (await client.send("Page.getInstallabilityErrors")) as { installabilityErrors: Array<{ errorId: string }> };
        return result.installabilityErrors.filter((error) => error.errorId !== "in-incognito");
      })
      .toEqual([]);
    await context.close();
  });
});
