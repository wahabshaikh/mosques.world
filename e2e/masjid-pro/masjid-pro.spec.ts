import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { baseURL, newUser, placeId, post } from "../support/helpers";

const PREVIEW = "east-london-mosque-whitechapel";
const PAID = "locksley-estate-mosque-limehouse";
const origin = new URL(baseURL).origin;

async function serious(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
}

test.describe("Masjid Pro", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });

  test("refuses AI crawlers and states the price with checkout closed", async ({ page, request }) => {
    const blocked = await request.get("/for-mosques", { headers: { "user-agent": "Mozilla/5.0 (compatible; ClaudeBot/1.0)" } });
    expect(blocked.status()).toBe(403);
    const allowed = await request.get("/robots.txt", { headers: { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" } });
    expect(allowed.status()).toBe(200);
    const robots = await allowed.text();
    expect(robots.toLowerCase()).toContain("user-agent: claudebot");
    expect(robots.toLowerCase()).toContain("user-agent: gptbot");
    expect(robots.toLowerCase()).toContain("disallow: /");

    const webhook = await request.post("/api/v1/webhooks/polar", { data: { type: "subscription.active" } });
    expect(webhook.status()).toBe(404);

    await page.goto("/for-mosques");
    await expect(page.locator("[data-app-ready=true]")).toBeAttached();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("lobby");
    await expect(page.getByText("$19", { exact: true })).toBeVisible();
    await expect(page.getByText("$180", { exact: true })).toBeVisible();
    await expect(page.getByText("Payment is not open on this site yet")).toBeVisible();
    expect(await serious(page)).toEqual([]);
  });

  test("the lobby is a preview and the widget stays locked until the mosque subscribes", async ({ page }) => {
    await page.goto(`/m/${PREVIEW}/display`);
    await expect(page.locator("[data-app-ready=true]")).toBeAttached();
    await expect(page.getByTestId("lobby-display")).toHaveAttribute("data-pro", "preview");
    await expect(page.getByTestId("lobby-preview")).toBeVisible();
    await expect(page.getByRole("rowheader", { name: "Fajr" })).toBeVisible();
    expect(await serious(page)).toEqual([]);

    await page.goto(`/m/${PREVIEW}/widget`);
    await expect(page.getByTestId("widget-locked")).toBeVisible();
    await expect(page.getByTestId("widget-locked")).toContainText("has not published");
  });

  test("a subscription publishes the notice, and only a steward can change it", async ({ browser, request }) => {
    const id = await placeId(request, PAID);
    const granted = await request.post("/api/v1/test/pro", {
      data: { placeId: id, active: true, notice: "Janazah after Asr.", donationUrl: "https://give.example.org/locksley", donationLabel: "Give" },
    });
    expect(granted.ok(), await granted.text()).toBeTruthy();

    try {
      const guest = await browser.newContext({ baseURL });
      const page = await guest.newPage();
      await page.goto(`/m/${PAID}/display`);
      await expect(page.locator("[data-app-ready=true]")).toBeAttached();
      await expect(page.getByTestId("lobby-preview")).toHaveCount(0);
      await expect(page.getByTestId("lobby-notice")).toContainText("Janazah after Asr.");
      await expect(page.getByRole("link", { name: "Give" })).toHaveAttribute("href", "https://give.example.org/locksley");

      await page.goto(`/m/${PAID}`);
      await expect(page.getByTestId("committee-notice")).toContainText("Janazah after Asr.");
      await page.goto(`/m/${PAID}/widget`);
      await expect(page.getByTestId("widget-notice")).toContainText("Janazah after Asr.");
      await guest.close();

      const stranger = await newUser(browser, "proguest");
      const denied = await stranger.page.request.patch(`/api/v1/places/${id}/pro`, {
        data: { notice: "Not allowed" },
        headers: { origin },
      });
      expect(denied.status()).toBe(403);
      const checkout = await post(stranger.page.request, `/api/v1/places/${id}/pro/checkout`, { interval: "year" });
      expect(checkout.status()).toBe(403);
      await stranger.page.goto(`/m/${PAID}/pro`);
      await expect(stranger.page.getByRole("heading", { name: "A steward subscribes" })).toBeVisible();
      await stranger.context.close();

      const steward = await newUser(browser, "prosteward");
      const ask = await post(steward.page.request, `/api/v1/places/${id}/steward`, {
        role: "committee",
        evidence: "I sit on the committee and put the timetable on the lobby screen.",
      });
      expect(ask.ok(), await ask.text()).toBeTruthy();
      const moderator = await newUser(browser, "promod", { role: "moderator", trustLevel: 3, ageDays: 90 });
      await moderator.page.goto("/admin/stewards");
      await expect(moderator.page.locator("[data-app-ready=true]")).toBeAttached();
      const row = moderator.page.locator("[data-steward]").filter({ hasText: `@${steward.person.username}` });
      await row.getByRole("button", { name: "Approve" }).click();
      await expect(moderator.page.getByText("Approved", { exact: true })).toBeVisible();
      await moderator.context.close();

      const saved = await steward.page.request.patch(`/api/v1/places/${id}/pro`, {
        data: { notice: "Sisters' entrance on the left." },
        headers: { origin },
      });
      expect(saved.ok(), await saved.text()).toBeTruthy();
      await steward.page.goto(`/m/${PAID}/display`);
      await expect(steward.page.getByTestId("lobby-notice")).toContainText("Sisters' entrance on the left.");
      await steward.context.close();
    } finally {
      const cleared = await request.post("/api/v1/test/pro", { data: { placeId: id, active: false } });
      expect(cleared.ok()).toBeTruthy();
    }
  });
});
