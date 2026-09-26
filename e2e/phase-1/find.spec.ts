import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const londonHeaders = {
  "x-mw-latitude": "51.5074",
  "x-mw-longitude": "-0.1278",
};

async function waitForApp(page: Page) {
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
}

test.describe("phase 1 find a mosque", () => {
  test("home from a London point lists places and syncs the map @smoke", async ({ page }) => {
    await page.setExtraHTTPHeaders(londonHeaders);
    await page.goto("/");
    await waitForApp(page);
    await expect.poll(async () => page.locator("[data-place-card]").count()).toBeGreaterThanOrEqual(10);
    const first = page.locator("[data-place-card]").first();
    const id = await first.getAttribute("data-place-card");
    await first.hover();
    await expect(page.locator(`[data-pin="${id}"]`)).toHaveAttribute("data-active", "true");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  });

  test("Istanbul search updates the URL and survives reload", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": "203.0.113.10" });
    await page.goto("/search?where=London&lat=51.5074&lng=-0.1278&z=11");
    await waitForApp(page);
    const where = page.getByLabel("Where");
    await where.click();
    await where.fill("");
    await where.pressSequentially("Istanbul");
    await page.getByRole("button", { name: "Istanbul", exact: true }).click();
    await expect(page).toHaveURL(/where=Istanbul/);
    await expect(page).toHaveURL(/lat=41/);
    const url = page.url();
    await page.reload();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("nearby");
  });

  test("mosque page matches calculated adhan times and directions @smoke", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-mw-now": "2026-09-25T11:00:00Z" });
    await page.goto("/m/east-london-mosque-whitechapel");
    await expect(page.getByRole("heading", { name: "East London Mosque" })).toBeVisible();
    for (const time of ["05:18", "06:51", "12:57", "16:55", "18:55", "20:09"]) {
      await expect(page.getByRole("cell", { name: time, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("rowheader", { name: "Jumu'ah" })).toBeVisible();
    await expect(page.getByText("Not yet added").first()).toBeVisible();
    const directions = page.getByTestId("directions");
    await expect(directions).toHaveAttribute("href", /51\.5173983,-0\.0653616/);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  });

  test("city page and sitemap include London @smoke", async ({ page, request }) => {
    await page.goto("/cities/gb/london");
    await expect(page.getByRole("heading", { name: "Mosques in London" })).toBeVisible();
    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    expect(jsonLd).toContain("ItemList");
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.ok()).toBeTruthy();
    const body = await sitemap.text();
    expect(body).toContain("/cities/gb/london");
    expect(body).toContain("/m/east-london-mosque-whitechapel");
  });

  test("waitlist confirmation", async ({ page, request }) => {
    await page.goto("/m/east-london-mosque-whitechapel");
    await waitForApp(page);
    await page.getByPlaceholder("Email for iqamah updates").fill("person@example.com");
    await page.getByRole("button", { name: "Get notified" }).click();
    await expect(page.getByText("Check your email to confirm.")).toBeVisible();
    const sink = await request.get("/api/v1/test/emails");
    expect(sink.ok()).toBeTruthy();
    const body = (await sink.json()) as { messages: Array<{ text: string }> };
    const link = body.messages[0]?.text.match(/https?:\/\/\S+/)?.[0];
    expect(link).toBeTruthy();
    const path = new URL(link ?? "").pathname + new URL(link ?? "").search;
    await page.goto(path.replace("https://mosques.world", ""));
    await expect(page.getByRole("heading", { name: "You are confirmed" })).toBeVisible();
  });
});
