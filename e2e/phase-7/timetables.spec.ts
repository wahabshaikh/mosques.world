import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import ICAL from "ical.js";
import { newUser, placeId, post, resetPlace, setFixture } from "../support/helpers";

const expect = baseExpect.configure({ timeout: 20_000 });

const PLACE = "markazi-mosque-whitechapel";
const MONTH = "2026-11";

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
}

/** What the mocked vision model "reads": 30 days, Isha moving a minute earlier each day. */
function boardRows() {
  return Array.from({ length: 30 }, (_, index) => ({
    day: index + 1,
    fajr: "6:15",
    zuhr: "12:30",
    asr: "2:30",
    maghrib: "4:20",
    isha: `7:${String(40 - index).padStart(2, "0")}`,
  }));
}

test.describe("phase 7 timetables and seasons", () => {
  test.describe.configure({ mode: "serial", timeout: 120_000 });

  test("importing a timetable photo creates 30 × 5 dated values, and the month shows them", async ({ browser, request }) => {
    await resetPlace(request, PLACE);
    await setFixture(request, { timetable: boardRows() });
    const member = await newUser(browser, "board", { trustLevel: 1, ageDays: 30 });
    const { page } = member;
    await visit(page, `/m/${PLACE}/timetable/import?month=${MONTH}`);
    await page.getByLabel("Timetable photo").setInputFiles("e2e/fixtures/gps.jpg");
    const grid = page.getByTestId("review-grid");
    await expect(grid).toBeVisible();
    await expect(page.getByLabel("Isha on 17", { exact: true })).toHaveValue("19:24");
    await expect(page.getByLabel("Dhuhr on 1", { exact: true })).toHaveValue("12:30");
    // A reviewer's correction wins over what was read.
    await page.getByLabel("Fajr on 2", { exact: true }).fill("06:20");
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole("button", { name: "Import 150 times" }).click();
    await page.waitForURL(new RegExp(`/m/${PLACE}/timetable\\?month=${MONTH}`));

    await expect(page).toHaveTitle(/Markazi Mosque monthly timetable/);
    const table = page.getByTestId("timetable");
    await expect(table.locator('[data-date="2026-11-17"] [data-prayer="isha"]')).toContainText("7:24 PM");
    await expect(table.locator('[data-date="2026-11-17"] [data-prayer="isha"]')).toHaveAttribute("data-source", "timetable");
    await expect(table.locator('[data-date="2026-11-02"] [data-prayer="fajr"]')).toContainText("6:20 AM");
    await expect(table.locator('td[data-source="timetable"]')).toHaveCount(150);
    await expect(page.getByText(/150 iqamah times from the mosque's timetable/)).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
    await member.context.close();
  });

  test("the calendar feed is valid iCalendar in the mosque's time zone", async ({ request }) => {
    const response = await request.get(`/m/${PLACE}/calendar.ics`, { headers: { "x-mw-now": "2026-11-10T09:00:00Z" } });
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/calendar");
    const text = await response.text();
    const calendar = new ICAL.Component(ICAL.parse(text));
    const zone = calendar.getFirstSubcomponent("vtimezone");
    expect(zone?.getFirstPropertyValue("tzid")).toBe("Europe/London");
    const events = calendar.getAllSubcomponents("vevent").map((event) => new ICAL.Event(event));
    expect(events.length).toBeGreaterThanOrEqual(100);
    const isha = events.find((event) => event.summary.startsWith("Isha") && event.startDate.toString().startsWith("2026-11-17"));
    expect(isha?.startDate.toString()).toBe("2026-11-17T19:24:00");
    expect(calendar.getAllSubcomponents("vevent")[0]?.getFirstProperty("dtstart")?.getParameter("tzid")).toBe("Europe/London");
  });

  test("Eid times added by a contributor show on the mosque page and in Eid near you", async ({ browser, request }) => {
    const member = await newUser(browser, "eid", { trustLevel: 1, ageDays: 30 });
    const { page } = member;
    await visit(page, `/m/${PLACE}/special`);
    await page.getByLabel("Eid al-Adha").check();
    await page.getByLabel("Date").fill("2027-05-17");
    await page.getByLabel("Time").first().fill("07:30");
    await page.getByLabel("Where (optional)").first().fill("Weavers Fields");
    await page.getByRole("button", { name: "Add another jamā'ah" }).click();
    await page.getByLabel("Time").nth(1).fill("09:00");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.waitForURL(new RegExp(`/m/${PLACE}`));
    const section = page.locator('[data-special="eid_adha"]');
    await expect(section).toContainText("1st jamā'ah 7:30 AM · Weavers Fields");
    await expect(section).toContainText("2nd jamā'ah 9:00 AM");

    const id = await placeId(request, PLACE);
    expect(id).toBeTruthy();
    await visit(page, "/eid?lat=51.518&lng=-0.068");
    await expect(page.locator(`[data-eid="${PLACE}"]`).first()).toContainText("Eid al-Adha");
    expect(await seriousViolations(page)).toEqual([]);

    // New accounts can't add special prayers.
    const newcomer = await newUser(browser, "eid.new");
    const refused = await post(newcomer.page.request, `/api/v1/places/${id}/special`, { kind: "eid_fitr", date: "2027-03-10", jamaahs: [{ time: "08:00" }] });
    expect(refused.status()).toBe(403);
    await newcomer.context.close();
    await member.context.close();
  });
});
