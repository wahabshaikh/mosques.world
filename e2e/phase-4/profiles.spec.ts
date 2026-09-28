import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { baseURL, newUser, placeId, post, todayIn } from "../phase-2/helpers";

const expect = baseExpect.configure({ timeout: 15_000 });

const LONDON_A = "al-huda-cultural-centre-and-mosque-stepney";
const LONDON_B = "al-nehar-mosque-education-centre-barnsbury";
const ISTANBUL = "ayasofya-cankurtaran-mahallesi";
const ISTANBUL_AT = { lat: 41.0085046, lng: 28.9800112 };

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
}

async function checkInThroughSheet(page: Page, slug: string, prayer: string, verify = false) {
  await visit(page, `/m/${slug}`);
  await page.getByRole("button", { name: "I prayed here" }).click();
  const dialog = page.getByRole("dialog", { name: "I prayed here" });
  await dialog.getByRole("radio", { name: prayer, exact: true }).click();
  if (verify) await dialog.getByLabel(/Use my location to verify/).check();
  await dialog.getByRole("button", { name: "Add to my map" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("phase 4 profiles and check-ins", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test("checking in at 3 places in 2 countries fills the profile map", async ({ browser, request }) => {
    const member = await newUser(browser, "pilgrim");
    const { page, person } = member;
    await checkInThroughSheet(page, LONDON_A, "Asr");
    await expect(page.getByText(/new country on your map/i)).toBeVisible();
    for (const [slug, prayer, date] of [
      [LONDON_B, "fajr", todayIn("Europe/London")],
      [ISTANBUL, "jumuah", "2026-01-02"],
    ] as const) {
      const response = await post(page.request, "/api/v1/checkins", { placeId: await placeId(request, slug), prayer, date });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    const again = await post(page.request, "/api/v1/checkins", { placeId: await placeId(request, ISTANBUL), prayer: "jumuah", date: "2026-01-02" });
    expect(again.status()).toBe(409);

    await visit(page, `/@${person.username}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("3 mosques. 2 countries.");
    await expect(page.getByTestId("profile-pin")).toHaveCount(3);
    const recent = page.getByRole("region", { name: "Recently prayed in" }).or(page.locator("section").filter({ has: page.getByRole("heading", { name: "Recently prayed in" }) }));
    await expect(recent.getByRole("link")).toHaveCount(3);
    await expect(recent).toContainText("Ayasofya");
    await expect(page.locator('[data-badge="founding_contributor"][data-earned="true"]')).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole("link", { name: "Jumu'ah only" }).click();
    await expect(page).toHaveURL(/map=jumuah/);
    await expect(page.getByTestId("profile-pin")).toHaveCount(1);

    // Saved places (spec P4 scope 5).
    await visit(page, `/m/${LONDON_A}`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
    await visit(page, "/saved");
    await expect(page.locator(`[data-saved="${LONDON_A}"]`)).toBeVisible();
    await expect(page.locator(`[data-saved="${LONDON_A}"]`)).toContainText(/(iqamah|adhan)/);
    expect(await seriousViolations(page)).toEqual([]);
    await member.context.close();
  });

  test("a location-verified check-in stores geo_verified and no coordinates", async ({ browser }) => {
    const member = await newUser(browser, "nearby");
    await member.context.grantPermissions(["geolocation"]);
    // About 60 m north of the mosque.
    await member.context.setGeolocation({ latitude: ISTANBUL_AT.lat + 0.00054, longitude: ISTANBUL_AT.lng });
    await checkInThroughSheet(member.page, ISTANBUL, "Isha", true);
    const response = await post(member.page.request, "/api/v1/test/fixtures", { checkinsOf: member.person.email });
    const body = (await response.json()) as { checkins: Array<Record<string, unknown>> };
    expect(body.checkins).toHaveLength(1);
    const row = body.checkins[0] ?? {};
    expect(row.geo_verified).toBe(1);
    expect(Number(row.distance_m)).toBeGreaterThan(40);
    expect(Number(row.distance_m)).toBeLessThan(80);
    expect(Object.keys(row).filter((column) => /lat|lng|lon|coord/i.test(column))).toEqual([]);
    expect(JSON.stringify(row)).not.toContain(String(ISTANBUL_AT.lat + 0.00054).slice(0, 7));
    await member.context.close();
  });

  test("countries-only hides pins and place names from others but keeps the counts", async ({ browser, request }) => {
    const member = await newUser(browser, "discreet");
    for (const [slug, prayer] of [
      [LONDON_A, "asr"],
      [ISTANBUL, "maghrib"],
    ] as const) {
      const response = await post(member.page.request, "/api/v1/checkins", { placeId: await placeId(request, slug), prayer });
      expect(response.ok(), await response.text()).toBeTruthy();
    }
    await visit(member.page, "/settings/privacy");
    await member.page.getByRole("radio", { name: /Countries only/ }).check();
    await member.page.getByRole("button", { name: "Save privacy settings" }).click();
    await expect(member.page.getByText("Privacy settings saved.")).toBeVisible();
    expect(await seriousViolations(member.page)).toEqual([]);

    const guest = await browser.newContext({ baseURL });
    const page = await guest.newPage();
    await visit(page, `/@${member.person.username}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("2 mosques. 2 countries.");
    await expect(page.getByTestId("profile-pin")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Recently prayed in" })).toHaveCount(0);
    await expect(page.getByText(/Al-Huda|Ayasofya/)).toHaveCount(0);
    await expect(page.getByRole("list", { name: "Countries prayed in" })).toContainText("United Kingdom");
    await guest.close();

    // The owner still sees everything.
    await visit(member.page, `/@${member.person.username}`);
    await expect(member.page.getByTestId("profile-pin")).toHaveCount(2);
    await member.context.close();
  });

  test("the share card is a 1200×630 PNG under 300 KB", async ({ browser, request }) => {
    const member = await newUser(browser, "sharer");
    await post(member.page.request, "/api/v1/checkins", { placeId: await placeId(request, LONDON_B), prayer: "dhuhr" });
    const response = await request.get(`/og/u/${member.person.username}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
    const bytes = await response.body();
    expect(bytes.length).toBeLessThan(300 * 1024);
    expect(bytes.readUInt32BE(16)).toBe(1200);
    expect(bytes.readUInt32BE(20)).toBe(630);
    await member.context.close();
  });

  test("/u/name redirects to /@name, unknown names 404, and the map embeds", async ({ browser, request }) => {
    const member = await newUser(browser, "canonical");
    const redirect = await request.get(`/u/${member.person.username}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(308);
    expect(redirect.headers().location).toMatch(new RegExp(`/@${member.person.username.replace(".", "\\.")}$`));
    expect((await request.get("/@nobody.here.at.all")).status()).toBe(404);
    const embed = await request.get(`/@${member.person.username}/map?embed=1`);
    expect(embed.status()).toBe(200);
    expect(embed.headers()["x-frame-options"]).toBeUndefined();
    expect(embed.headers()["content-security-policy"]).toContain("frame-ancestors *");
    const full = await request.get(`/@${member.person.username}/map`);
    expect(full.headers()["x-frame-options"]).toBe("DENY");
    await member.context.close();
  });
});
