import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { newUser, resetPlace } from "../support/helpers";

// Not used by any other suite, so its times start empty on every run.
const SLUG = "chadwell-heath-muslim-centre-chadwell-heath";

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
}

async function setTime(page: Page, prayer: string, time: string) {
  const row = page.locator(`[data-row="iqamah.${prayer}"]`);
  const add = row.getByRole("button", { name: /^Add / });
  if (await add.isVisible()) await add.click();
  await row.getByRole("spinbutton").click();
  const input = row.getByLabel(/time$/);
  await input.fill(time);
  await input.press("Enter");
}

test.describe("redesign: jamā'ah times, hasanat and sharing", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test("a mosque without times asks for them and keeps calculated times apart @smoke", async ({ page, request }) => {
    await resetPlace(request, SLUG);
    await page.goto(`/m/${SLUG}`);
    await expect(page.locator("[data-app-ready=true]")).toBeAttached();
    await expect(page.getByTestId("add-times")).toContainText("Jamā'ah times not yet added");
    await expect(page.getByTestId("add-times").getByRole("link", { name: /Add times/ })).toBeVisible();
    // Calculated times sit in their own labelled section, never in the jamā'ah table.
    const calculated = page.getByTestId("calculated-times");
    await expect(calculated.getByRole("rowheader")).toHaveCount(6);
    await expect(calculated).toContainText("not this masjid's adhan or iqamah");
    await expect(page.locator("[data-iqamah]")).toHaveCount(0);
    const jsonLd = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("");
    expect(jsonLd).toContain("FAQPage");
    expect(jsonLd).toContain("BreadcrumbList");
    await expect(page.getByTestId("faq")).toContainText("What are the iqamah times");
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("times show how they're set, one tap confirms them, and the helper lands on the leaderboard", async ({ browser, request }) => {
    await resetPlace(request, SLUG);
    const adder = await newUser(browser, "hasadd", { trustLevel: 1, ageDays: 30 });
    await adder.page.goto(`/m/${SLUG}/update`);
    await expect(adder.page.locator("[data-app-ready=true]")).toBeAttached();
    await expect(adder.page.getByRole("tab", { name: "Iqamah times" })).toBeVisible();
    await setTime(adder.page, "asr", "16:30");
    await adder.page.getByRole("button", { name: "Submit 1 change" }).click();
    await expect(adder.page.getByTestId("update-results")).toBeVisible();
    await expect(adder.page.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
    await adder.context.close();

    const confirmer = await newUser(browser, "hasconf");
    await confirmer.page.goto(`/m/${SLUG}`);
    await expect(confirmer.page.locator("[data-app-ready=true]")).toBeAttached();
    await expect(confirmer.page.locator('[data-iqamah="asr"] [data-rule="fixed"]')).toContainText("fixed time");
    await confirmer.page.getByTestId("times-check").getByRole("button", { name: /Yes, still right/ }).click();
    await expect(confirmer.page.getByTestId("times-thanks")).toContainText("+10 hasanat");
    expect(await seriousViolations(confirmer.page)).toEqual([]);

    await confirmer.page.goto("/leaderboard?period=all");
    await expect(confirmer.page.getByTestId("hasanat-card")).toContainText("10");
    await expect(confirmer.page.getByTestId("leaderboard")).toContainText(`@${confirmer.person.username}`);
    expect(await seriousViolations(confirmer.page)).toEqual([]);
    await confirmer.context.close();
  });

  test("on a phone, home shows the area's calculated times, the tab bar and a list/map switch", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    await page.goto("/search?where=Whitechapel&lat=51.5175&lng=-0.0657&z=14");
    await expect(page.locator("[data-app-ready=true]")).toBeAttached();
    await expect(page.getByTestId("area-times")).toContainText("Calculated start times");
    await expect(page.getByTestId("tab-bar")).toBeVisible();
    await expect(page.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("view-toggle").click();
    await expect(page.getByTestId("place-map")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await context.close();
  });
});
