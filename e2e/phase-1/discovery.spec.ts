import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Whitechapel, as Cloudflare would place a visitor from their IP address (non-production honours these headers).
const whitechapel = { "x-mw-latitude": "51.5174", "x-mw-longitude": "-0.0654", "x-mw-country": "GB" };

async function waitForApp(page: Page) {
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
}

test.describe("discovering mosques around you", () => {
  test("the home page lists mosques around the visitor's server-detected location, with a legend for whose times they are", async ({ page }) => {
    await page.setExtraHTTPHeaders(whitechapel);
    await page.goto("/");
    await waitForApp(page);
    await expect.poll(async () => page.locator("[data-place-card]").count()).toBeGreaterThanOrEqual(5);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("nearby");
    await expect(page.getByTestId("time-legend").first()).toContainText("Mosque timetable");
    // Every row says whose time it shows.
    const rows = await page.locator("[data-place-card]").count();
    await expect(page.locator("[data-place-card] [data-time-source]")).toHaveCount(rows);
  });

  test("on a phone the list fits the screen and the map opens with the visitor's blue dot", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setExtraHTTPHeaders(whitechapel);
    await page.goto("/");
    await waitForApp(page);
    await expect.poll(async () => page.locator("[data-place-card]").count()).toBeGreaterThanOrEqual(5);
    // No sideways scrolling: times and chips on the right of each row stay on screen.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByTestId("view-toggle").click();
    const map = page.getByTestId("place-map");
    await expect(map.locator("canvas")).toBeVisible();
    // A map shown after being hidden must be sized to its container, not 0×0.
    const canvas = await map.locator("canvas").boundingBox();
    expect(canvas?.width ?? 0).toBeGreaterThan(300);
    expect(canvas?.height ?? 0).toBeGreaterThan(200);
    await expect(page.getByTestId("user-location")).toHaveAttribute("data-precise", "false");
    // Tapping a pin previews the mosque over the map (mosques next door stack, so whichever pin is on top answers).
    await map.locator("[data-pin]").first().click({ force: true });
    await expect(page.getByTestId("map-card")).toBeVisible();
    await page.getByTestId("view-toggle").click();
    await expect(page.locator("[data-place-card]").first()).toBeVisible();
  });

  test("searching a masjid by name suggests mosques and opens a listed one", async ({ page }) => {
    await page.setExtraHTTPHeaders({ ...whitechapel, "cf-connecting-ip": `203.0.113.${Math.floor(Math.random() * 250) + 1}` });
    await page.goto("/");
    await waitForApp(page);
    const where = page.getByLabel("Where");
    await where.click();
    await where.fill("");
    await where.pressSequentially("East London Mosque");
    const suggestion = page.getByTestId("suggestions").getByRole("button", { name: /East London Mosque/ }).first();
    await expect(suggestion).toContainText("Masjid");
    await suggestion.click();
    await expect(page).toHaveURL(/\/m\/|lat=51\.5/);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);
  });
});
