import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { baseURL, newUser, placeId, post, resetPlace } from "../support/helpers";

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

  test("an approved steward sets iqamah and the lobby fills a television", async ({ browser, request }) => {
    const id = await placeId(request, PAID);
    await resetPlace(request, PAID);
    const granted = await request.post("/api/v1/test/pro", { data: { placeId: id, active: true, notice: "Sisters' entrance on the left." } });
    expect(granted.ok(), await granted.text()).toBeTruthy();

    try {
      const stranger = await newUser(browser, "timestranger");
      const denied = await stranger.page.request.put(`/api/v1/places/${id}/pro/times`, {
        data: { prayers: [{ prayer: "fajr", mode: "fixed", time: "05:40" }] },
        headers: { origin },
      });
      expect(denied.status()).toBe(403);
      await stranger.page.goto(`/m/${PAID}/pro/times`);
      await expect(stranger.page.getByRole("heading", { name: "A steward sets the times" })).toBeVisible();
      await stranger.context.close();

      const pending = await newUser(browser, "timepending");
      const ask = await post(pending.page.request, `/api/v1/places/${id}/steward`, {
        role: "committee",
        evidence: "I look after the timetable on the lobby screen for this mosque.",
      });
      expect(ask.ok(), await ask.text()).toBeTruthy();
      const waiting = await pending.page.request.put(`/api/v1/places/${id}/pro/times`, {
        data: { prayers: [{ prayer: "fajr", mode: "fixed", time: "05:40" }] },
        headers: { origin },
      });
      expect(waiting.status()).toBe(403);
      await pending.context.close();

      const steward = await newUser(browser, "timesteward");
      const own = await post(steward.page.request, `/api/v1/places/${id}/steward`, {
        role: "committee",
        evidence: "I sit on the committee and set the iqamah for the lobby screen.",
      });
      expect(own.ok(), await own.text()).toBeTruthy();
      const moderator = await newUser(browser, "timemod", { role: "moderator", trustLevel: 3, ageDays: 90 });
      await moderator.page.goto("/admin/stewards");
      await expect(moderator.page.locator("[data-app-ready=true]")).toBeAttached();
      const row = moderator.page.locator("[data-steward]").filter({ hasText: `@${steward.person.username}` });
      await row.getByRole("button", { name: "Approve" }).click();
      await expect(moderator.page.getByText("Approved", { exact: true })).toBeVisible();
      await moderator.context.close();

      const revoked = await request.post("/api/v1/test/pro", { data: { placeId: id, active: false } });
      expect(revoked.ok()).toBeTruthy();
      const unpaid = await steward.page.request.put(`/api/v1/places/${id}/pro/times`, {
        data: { prayers: [{ prayer: "fajr", mode: "fixed", time: "05:40" }] },
        headers: { origin },
      });
      expect(unpaid.status()).toBe(402);
      await steward.page.goto(`/m/${PAID}/pro/times`);
      await expect(steward.page.getByTestId("times-locked")).toBeVisible();

      const restored = await request.post("/api/v1/test/pro", { data: { placeId: id, active: true, notice: "Sisters' entrance on the left." } });
      expect(restored.ok()).toBeTruthy();
      await steward.page.goto(`/m/${PAID}/pro/times`);
      await expect(steward.page.locator("[data-app-ready=true]")).toBeAttached();
      const fajr = steward.page.getByTestId("prayer-fajr");
      await fajr.getByRole("checkbox", { name: "Set this prayer" }).check();
      await fajr.getByRole("radio", { name: "Fixed time" }).check();
      await fajr.getByLabel("Fajr clock time").fill("05:40");
      const maghrib = steward.page.getByTestId("prayer-maghrib");
      await maghrib.getByRole("checkbox", { name: "Set this prayer" }).check();
      await maghrib.getByRole("radio", { name: "Minutes after adhan" }).check();
      await maghrib.getByLabel("Maghrib minutes after adhan").fill("10");
      const jumuah = steward.page.getByTestId("jumuah-1");
      await jumuah.getByLabel("Jumu'ah 1 iqamah").fill("13:15");
      await jumuah.getByLabel("Jumu'ah 1 khutbah").fill("12:55");
      await steward.page.getByRole("button", { name: "Save times" }).click();
      await expect(steward.page.getByRole("status")).toContainText("Fajr is live");
      await expect(steward.page.getByRole("status")).toContainText("Maghrib is live");
      await expect(steward.page.getByRole("status")).toContainText("Jumu'ah 1st");

      await steward.page.goto(`/m/${PAID}`);
      await expect(steward.page.getByText("5:40 AM").first()).toBeVisible();

      async function fits(width: number, height: number, theme: "dark" | "light") {
        await steward.page.setViewportSize({ width, height });
        await steward.page.goto(`/m/${PAID}/display${theme === "light" ? "?theme=light" : ""}`);
        await expect(steward.page.locator("[data-app-ready=true]")).toBeAttached();
        const board = steward.page.getByTestId("lobby-display");
        await expect(board).toHaveAttribute("data-pro", "on");
        await expect(board).toHaveAttribute("data-theme", theme);
        await expect(board).toHaveAttribute("data-reload-at", /.+/);
        await expect(steward.page.getByTestId("lobby-preview")).toHaveCount(0);
        await expect(steward.page.getByTestId("lobby-clock")).toBeVisible();
        await expect(steward.page.getByTestId("lobby-countdown")).toBeVisible();
        await expect(steward.page.getByTestId("iqamah-fajr")).toHaveText("5:40 AM");
        const adhan = (await steward.page.getByTestId("adhan-maghrib").innerText()).trim();
        await expect(steward.page.getByTestId("iqamah-maghrib")).toHaveText(addMinutesLabel(adhan, 10));
        await expect(steward.page.getByTestId("lobby-jumuah")).toContainText("1:15 PM");
        await expect(steward.page.getByTestId("lobby-notice")).toContainText("Sisters' entrance on the left.");
        const box = await steward.page.evaluate(() => {
          const root = document.scrollingElement ?? document.documentElement;
          return { scrollHeight: root.scrollHeight, clientHeight: root.clientHeight, scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
        });
        expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
        expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
        expect(await serious(steward.page)).toEqual([]);
      }

      await fits(1920, 1080, "dark");
      await fits(1280, 720, "light");
      await steward.context.close();
    } finally {
      const cleared = await request.post("/api/v1/test/pro", { data: { placeId: id, active: false } });
      expect(cleared.ok()).toBeTruthy();
    }
  });
});

function addMinutesLabel(label: string, add: number): string {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(label.trim());
  if (!match) throw new Error(`Unexpected adhan label: ${label}`);
  let hours = Number(match[1]) % 12;
  if (match[3]?.toUpperCase() === "PM") hours += 12;
  const total = (hours * 60 + Number(match[2]) + add) % 1440;
  const h = Math.floor(total / 60);
  const minutes = String(total % 60).padStart(2, "0");
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${minutes} ${suffix}`;
}
