import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { newUser, placeId, post, resetPlace, setFixture, testGet, todayIn } from "../phase-2/helpers";

// Photo processing and trust recomputes run inline on preview and dev; allow for cold starts.
const expect = baseExpect.configure({ timeout: 15_000 });

const WOMEN = "baitul-wahid-mosque-feltham";
const NO_WOMEN = "hounslow-muslim-centre-worton";
const PHOTO = "baitus-subhan-mosque-broad-green";
const EMPTY = "baitul-aman-mosque-hillingdon";
const ANNEX_ID = "test-place-annex";
const MERGE_A = "test-place-merge-a";
const MERGE_B = "test-place-merge-b";

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
}

function details(placeId: string, name: string, lat: number, lng: number) {
  return { placeId, name, address: "Whitechapel Rd, London E1 1JQ, UK", lat, lng, locality: "Whitechapel", region: "England", country: "GB" };
}

test.describe("phase 3 amenities, places and photos", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test("the women's section filter shows only places where it is currently yes", async ({ browser, request }) => {
    await resetPlace(request, WOMEN);
    await resetPlace(request, NO_WOMEN);
    const member = await newUser(browser, "amenity", { trustLevel: 1, ageDays: 30 });
    for (const [slug, value] of [
      [WOMEN, true],
      [NO_WOMEN, false],
    ] as const) {
      const response = await post(member.page.request, `/api/v1/places/${await placeId(request, slug)}/contributions`, {
        effectiveFrom: todayIn("Europe/London"),
        source: "observed",
        changes: [{ key: "amenity.women_section", value: { v: value } }],
      });
      expect(response.ok(), await response.text()).toBeTruthy();
    }

    const page = member.page;
    await visit(page, "/search?where=Hounslow&lat=51.45&lng=-0.38&z=11");
    await expect(page.locator("[data-place-card]").filter({ hasText: "Hounslow Muslim Centre" })).toBeVisible();
    await page.getByRole("button", { name: "Women's section" }).click();
    await expect(page).toHaveURL(/needs=women_section/);
    await expect(page.locator("[data-place-card]").filter({ hasText: "Baitul Wahid" })).toBeVisible();
    await expect(page.locator("[data-place-card]").filter({ hasText: "Hounslow Muslim Centre" })).toHaveCount(0);
    const cards = await page.locator("[data-place-card]").count();
    expect(cards).toBeGreaterThanOrEqual(1);
    expect(await seriousViolations(page)).toEqual([]);

    await page.getByRole("button", { name: /^Filters/ }).click();
    await expect(page.getByRole("button", { name: /^Show \d+ place/ })).toBeVisible();
    await page.getByRole("button", { name: "Clear all" }).click();
    await page.getByRole("button", { name: /^Show / }).click();
    await expect(page).not.toHaveURL(/needs=/);
    await member.context.close();
  });

  test("the update dialog records amenities and the page lists them", async ({ browser, request }) => {
    await resetPlace(request, EMPTY);
    const member = await newUser(browser, "wudhu", { trustLevel: 1, ageDays: 30 });
    await visit(member.page, `/m/${EMPTY}`);
    await member.page.getByRole("link", { name: "Add facilities" }).click();
    const tab = member.page.getByTestId("amenities-tab");
    await expect(tab).toBeVisible();
    await tab.locator('[data-amenity-row="amenity.wudhu_men"]').getByRole("radio", { name: "Yes", exact: true }).click();
    await tab.locator('[data-amenity-row="amenity.parking"]').getByRole("radio", { name: "No", exact: true }).click();
    await member.page.getByRole("button", { name: "Submit 2 changes" }).click();
    await expect(member.page.getByTestId("update-results")).toContainText("Wudhu area — men is live");
    await member.page.getByRole("button", { name: "Done" }).click();
    await expect(member.page.locator('[data-amenity="amenity.wudhu_men"]')).toHaveAttribute("data-available", "true");
    await expect(member.page.locator('[data-amenity="amenity.parking"]')).toHaveAttribute("data-available", "false");
    await member.context.close();
  });

  test("adding a place via Places warns about a nearby duplicate, then creates it with times", async ({ browser, request }) => {
    await setFixture(request, { deletePlace: ANNEX_ID });
    await setFixture(request, {
      places: {
        autocomplete: [{ placeId: ANNEX_ID, label: "East London Mosque Annex", secondary: "Whitechapel, London" }],
        details: [details(ANNEX_ID, "East London Mosque Annex", 51.5175, -0.0655)],
      },
    });
    const member = await newUser(browser, "adder", { trustLevel: 1, ageDays: 30 });
    const page = member.page;
    await visit(page, "/");
    await page.getByRole("link", { name: "Add a mosque" }).click();
    await expect(page.getByRole("heading", { name: "Add a mosque or prayer space" })).toBeVisible();
    await expect(page.locator("[data-app-ready=true]")).toBeAttached();
    await page.getByLabel("Search for the place").fill("East London Mosque");
    await page.getByRole("button", { name: /East London Mosque Annex/ }).click();
    const duplicates = page.getByTestId("duplicates");
    await expect(duplicates).toContainText("East London Mosque");
    await expect(duplicates).toContainText("m away");
    await page.getByRole("button", { name: "It's new" }).click();
    await expect(page.getByLabel("Name")).toHaveValue("East London Mosque Annex");
    await page.getByLabel("asr iqamah").fill("16:30");
    await page.getByLabel("Women's section").selectOption("yes");
    expect(await seriousViolations(page)).toEqual([]);
    await page.getByRole("button", { name: "Add this place" }).click();
    await page.waitForURL(/\/m\/east-london-mosque-annex-whitechapel.*added=1/);
    await expect(page.getByText("You added this place")).toBeVisible();
    await expect(page.locator('[data-iqamah="asr"]')).toContainText("4:30 PM");
    await expect(page.locator('[data-amenity="amenity.women_section"]')).toBeVisible();
    await expect(page.getByTestId("photo-placeholder")).toBeVisible();
    await member.context.close();

    // Places added by new accounts stay pending: hidden from signed-out visitors.
    await setFixture(request, { deletePlace: `${ANNEX_ID}-new` });
    await setFixture(request, {
      places: {
        autocomplete: [{ placeId: `${ANNEX_ID}-new`, label: "Whitechapel Prayer Room", secondary: "London" }],
        details: [details(`${ANNEX_ID}-new`, "Whitechapel Prayer Room", 51.519, -0.06)],
      },
    });
    const newbie = await newUser(browser, "newadder");
    const created = await post(newbie.page.request, "/api/v1/places", {
      ...details(`${ANNEX_ID}-new`, "Whitechapel Prayer Room", 51.519, -0.06),
      googlePlaceId: `${ANNEX_ID}-new`,
      kind: "prayer_room",
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const body = (await created.json()) as { slug: string; status: string };
    expect(body.status).toBe("pending");
    expect((await request.get(`/m/${body.slug}`)).status()).toBe(404);
    await visit(newbie.page, `/m/${body.slug}`);
    await expect(newbie.page.getByText("Waiting for a contributor to confirm it exists")).toBeVisible();
    await newbie.context.close();
  });

  test("a new account's photo has no EXIF and stays pending until a moderator approves it", async ({ browser, request }) => {
    const uploader = await newUser(browser, "photographer");
    const id = await placeId(request, PHOTO);
    await visit(uploader.page, `/m/${PHOTO}`);
    await uploader.page.getByRole("button", { name: /^Add( photos)?$/ }).click();
    await uploader.page.getByLabel("Photo", { exact: true }).setInputFiles("e2e/fixtures/gps.jpg");
    await uploader.page.getByLabel("What does it show?").selectOption("entrance");
    await uploader.page.getByRole("button", { name: "Upload photo" }).click();
    await expect(uploader.page.getByText("Your photo will appear after a quick review")).toBeVisible();

    const pending = await testGet(uploader.page.request, `/api/v1/test/photos?placeId=${id}`);
    const photoId = ((await pending.json()) as { photos: Array<{ id: string; status: string }> }).photos[0]?.id ?? "";
    expect(photoId).toMatch(/^[0-9A-Z]{26}$/);
    const mine = await uploader.page.request.get(`/media/${photoId}/800.webp`);
    expect(mine.status()).toBe(200);
    const bytes = Buffer.from(await mine.body());
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
    expect(bytes.includes(Buffer.from("EXIF"))).toBe(false);
    expect(bytes.includes(Buffer.from("GPS"))).toBe(false);
    expect(bytes.includes(Buffer.from("TestCam"))).toBe(false);
    expect((await request.get(`/media/${photoId}/800.webp`)).status()).toBe(404);
    await uploader.context.close();

    const moderator = await newUser(browser, "photomod", { role: "moderator", trustLevel: 3 });
    await visit(moderator.page, "/admin/queue");
    const item = moderator.page.locator(`[data-held-photo="${photoId}"]`);
    await expect(item).toContainText("entrance");
    await item.getByRole("button", { name: "Approve" }).click();
    await expect(moderator.page.getByText("Photo approved")).toBeVisible();
    await moderator.context.close();

    expect((await request.get(`/media/${photoId}/400.webp`)).status()).toBe(200);
    const page = await request.get(`/m/${PHOTO}`);
    expect(await page.text()).toContain(`/media/${photoId}/`);
  });

  test("merging duplicates redirects the old slug and carries their votes", async ({ browser, request }) => {
    for (const id of [MERGE_A, MERGE_B]) await setFixture(request, { deletePlace: id });
    const voters = await Promise.all(["merge1", "merge2", "merge3"].map((name) => newUser(browser, name, { trustLevel: 1, ageDays: 30 })));
    const [first, second, third] = voters;
    if (!first || !second || !third) throw new Error("users");
    const a = (await (
      await post(first.page.request, "/api/v1/places", { ...details(MERGE_A, "Merge Test Masjid", 51.5301, -0.0801), googlePlaceId: MERGE_A, kind: "mosque", iqamah: { isha: "20:45" } })
    ).json()) as { slug: string; id: string };
    const b = (await (
      await post(second.page.request, "/api/v1/places", { ...details(MERGE_B, "Merge Test Mosque", 51.5302, -0.0802), googlePlaceId: MERGE_B, kind: "mosque", iqamah: { isha: "20:45" } })
    ).json()) as { slug: string; id: string };
    expect(a.slug).toBeTruthy();
    expect(b.slug).toBeTruthy();
    const confirm = await post(third.page.request, `/api/v1/places/${b.id}/contributions`, {
      effectiveFrom: todayIn("Europe/London"),
      source: "observed",
      changes: [{ key: "iqamah.isha", value: { t: "20:45" } }],
    });
    expect(confirm.ok()).toBeTruthy();
    for (const voter of voters) await voter.context.close();

    const moderator = await newUser(browser, "mergemod", { role: "moderator", trustLevel: 3 });
    await visit(moderator.page, "/admin/places/merge");
    await moderator.page.getByLabel("Duplicate (goes away)").fill(`/m/${b.slug}`);
    await moderator.page.getByLabel("Place that stays").fill(a.slug);
    moderator.page.once("dialog", (dialog) => void dialog.accept());
    await moderator.page.getByRole("button", { name: "Merge" }).click();
    await expect(moderator.page.getByText(`Merged into /m/${a.slug}`)).toBeVisible();
    await moderator.context.close();

    const redirect = await request.get(`/m/${b.slug}`, { maxRedirects: 0 });
    expect(redirect.status()).toBe(308);
    expect(redirect.headers().location).toContain(`/m/${a.slug}`);
    const merged = await (await request.get(`/api/v1/places/${a.id}/facts`)).json();
    const isha = (merged as { facts: Array<{ key: string; state: string; current: { backers: number } }> }).facts.find((fact) => fact.key === "iqamah.isha");
    expect(isha?.current.backers).toBe(3);
    expect(isha?.state).toBe("verified");
  });

  test("places without photos render the illustration", async ({ page }) => {
    await visit(page, `/m/${EMPTY}`);
    await expect(page.getByTestId("photo-placeholder")).toBeVisible();
    await expect(page.locator('img[src^="/media/"]')).toHaveCount(0);
    expect(await seriousViolations(page)).toEqual([]);
  });
});
