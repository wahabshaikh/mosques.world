import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { baseURL, newUser, resetPlace } from "../support/helpers";

const SLUG = "darul-ummah-mosque-wapping";

test.describe("the mosque's own timetable (Mawaqit, Masjidal)", () => {
  test.afterEach(async ({ request }) => {
    await resetPlace(request, SLUG);
  });

  test("linking a Mawaqit page shows the mosque's times on its page and marks it in the list and on the map", async ({ browser, request }) => {
    await resetPlace(request, SLUG);
    const { context, page } = await newUser(browser, "timetable");
    // Non-production stand-in for mawaqit.net: a mosque at this place with Fajr 05:30 adhan, 05:45 iqamah.
    await context.addCookies([{ name: "mw_source_fixture", value: "1", url: baseURL }]);
    await page.setExtraHTTPHeaders({ "x-mw-now": "2026-10-08T03:00:00Z" });
    await page.goto(`/m/${SLUG}`);
    await expect(page.locator("[data-app-ready=true]")).toBeAttached();
    await expect(page.getByTestId("mosque-timetable")).toHaveCount(0);

    await page.getByTestId("link-timetable-open").click();
    await page.getByLabel(/publish its times on Mawaqit or Masjidal/).fill("https://example.com/not-a-timetable");
    await page.getByRole("button", { name: "Link timetable" }).click();
    await expect(page.getByRole("alert")).toContainText("isn't a Mawaqit mosque page");

    await page.getByLabel(/publish its times on Mawaqit or Masjidal/).fill("https://mawaqit.net/en/darul-ummah-wapping");
    await page.getByRole("button", { name: "Link timetable" }).click();
    const table = page.getByTestId("mosque-timetable");
    await expect(table).toBeVisible();
    await expect(table).toContainText("Published by the mosque on Mawaqit");
    await expect(table.locator('[data-source-prayer="fajr"]')).toContainText("5:45 AM");
    await expect(page.getByTestId("community-heading")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((item) => item.impact === "serious" || item.impact === "critical")).toEqual([]);

    // In the list the mosque's own iqamah leads its row, marked as the mosque's timetable.
    await page.goto("/search?where=Wapping&lat=51.5124&lng=-0.0582&z=14");
    await expect(page.locator("[data-app-ready=true]")).toBeAttached();
    const row = page.locator("[data-place-card]").filter({ hasText: "Darul Ummah Mosque" });
    await expect(row).toContainText("Fajr 5:45 AM");
    await expect(row.locator('[data-time-source="mosque"]')).toContainText("mosque timetable");
    await expect(page.locator('[data-pin][data-time-source="mosque"]').first()).toBeVisible();
    await context.close();
  });
});
