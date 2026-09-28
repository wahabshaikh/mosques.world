import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";
import { newUser, placeId, post, resetPlace, setFixture, todayIn } from "../phase-2/helpers";

const expect = baseExpect.configure({ timeout: 20_000 });

const PLACE = "darul-ummah-mosque-wapping";
const SAMPLE = [PLACE, "burdett-estate-mosque-limehouse", "new-peckham-mosque-old-kent-road"];
const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
}

/** "7:45 PM" → "19:45". */
function to24h(label: string): string {
  const match = /(\d{1,2}):(\d{2})\s?(AM|PM)/.exec(label);
  if (!match) return label;
  return `${String((Number(match[1]) % 12) + (match[3] === "PM" ? 12 : 0)).padStart(2, "0")}:${match[2]}`;
}

function api(request: APIRequestContext, path: string, key: string) {
  return request.get(`/api/v1/public${path}`, { headers: { authorization: `Bearer ${key}` } });
}

test.describe("phase 8 global and open", () => {
  test.describe.configure({ mode: "serial", timeout: 150_000 });
  let key = "";

  test("/ar/m/[slug] renders right-to-left with Arabic prayer names, and /m/[slug] is unchanged", async ({ page }) => {
    await visit(page, `/ar/m/${PLACE}`);
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");
    await expect(page.locator('tr[data-prayer="fajr"] th')).toContainText("الفجر");
    await expect(page.locator('tr[data-prayer="isha"] th')).toContainText("العشاء");
    await expect(page.getByRole("heading", { name: "مواقيت الصلاة اليوم" })).toBeVisible();
    await expect(page.locator('link[rel="alternate"][hreflang="fr"]')).toHaveAttribute("href", new RegExp(`/fr/m/${PLACE}$`));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/ar/m/${PLACE}$`));
    expect(await seriousViolations(page)).toEqual([]);

    // The language switcher is plain links to the same page in each language.
    await page.getByTestId("language-switcher").locator("summary").click();
    await page.getByRole("link", { name: "Français" }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/m/${PLACE}$`));
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator('tr[data-prayer="isha"] th')).toContainText("Icha");

    await visit(page, `/m/${PLACE}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('tr[data-prayer="fajr"] th')).toContainText("Fajr");
    await expect(page.getByRole("heading", { name: "Today's prayer times" })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", new RegExp(`/m/${PLACE}$`));

    // Unprefixed pages stay English; the home page offers the visitor's own language.
    const arabic = await page.request.get("/", { headers: { "accept-language": "ar-SA,ar;q=0.9,en;q=0.5" } });
    expect(await arabic.text()).toContain('href="/ar"');
    const plain = await page.request.get("/", { headers: { "accept-language": "en-GB,en;q=0.9" } });
    expect(await plain.text()).not.toContain('data-testid="locale-suggestion"');

    // `/en/…` is the unprefixed URL.
    const english = await page.request.get(`/en/m/${PLACE}`, { maxRedirects: 0 });
    expect(english.status()).toBe(308);
    expect(english.headers().location).toMatch(new RegExp(`/m/${PLACE}$`));
  });

  test("a developer creates a key in settings; the API needs it and returns the page's times", async ({ browser, request }) => {
    await resetPlace(request, PLACE);
    const id = await placeId(request, PLACE);
    const setter = await newUser(browser, "api.setter", { trustLevel: 1, ageDays: 30 });
    const response = await post(setter.page.request, `/api/v1/places/${id}/contributions`, {
      effectiveFrom: todayIn("Europe/London"),
      source: "board",
      changes: [
        { key: "iqamah.dhuhr", value: { t: "13:30" } },
        { key: "iqamah.isha", value: { t: "20:15" } },
        { key: "iqamah.maghrib", value: { rule: "after_adhan", min: 5 } },
      ],
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    await setter.context.close();

    const developer = await newUser(browser, "api.dev");
    await visit(developer.page, "/settings/developers");
    await developer.page.getByLabel("Key name").fill("Masjid screen");
    await developer.page.getByRole("button", { name: "Create key" }).click();
    key = (await developer.page.getByTestId("new-api-key").textContent())?.trim() ?? "";
    expect(key).toMatch(/^mw_/);
    await expect(developer.page.locator("[data-api-key]")).toHaveCount(1);
    expect(await seriousViolations(developer.page)).toEqual([]);

    expect((await request.get(`/api/v1/public/places/${PLACE}/times`)).status()).toBe(401);
    expect((await api(request, `/places/${PLACE}/times`, "mw_notarealkeynotarealkey00")).status()).toBe(401);

    for (const slug of SAMPLE) {
      const times = await api(request, `/places/${slug}/times`, key);
      expect(times.status(), await times.text()).toBe(200);
      expect(times.headers()["access-control-allow-origin"]).toBe("*");
      const body = (await times.json()) as { prayers: Array<{ prayer: string; adhan: string; iqamah: string | null; iqamah_source: string | null }> };
      await visit(developer.page, `/m/${slug}`);
      for (const prayer of PRAYERS) {
        const row = body.prayers.find((item) => item.prayer === prayer);
        expect(row, prayer).toBeTruthy();
        const cells = developer.page.locator(`tr[data-prayer="${prayer}"] td`);
        await expect(cells.first()).toHaveText(row!.adhan);
        const iqamah = developer.page.locator(`td[data-iqamah="${prayer}"]`);
        if (row!.iqamah) {
          expect(to24h((await iqamah.textContent()) ?? "")).toBe(row!.iqamah);
        } else {
          await expect(iqamah).toHaveCount(0);
        }
      }
    }
    const own = (await (await api(request, `/places/${PLACE}/times`, key)).json()) as { prayers: Array<{ prayer: string; iqamah: string | null; iqamah_source: string }> };
    expect(own.prayers.find((item) => item.prayer === "isha")).toMatchObject({ iqamah: "20:15", iqamah_source: "community" });

    const detail = (await (await api(request, `/places/${PLACE}`, key)).json()) as { slug: string; iqamah: Record<string, { time?: string; minutes_after_adhan?: number }> };
    expect(detail.slug).toBe(PLACE);
    expect(detail.iqamah.dhuhr?.time).toBe("13:30");
    expect(detail.iqamah.maghrib?.minutes_after_adhan).toBe(5);
    expect(JSON.stringify(detail)).not.toMatch(/api\.setter|@example/);

    const near = (await (await api(request, "/places?lat=51.5123&lng=-0.0582&radius_km=1", key)).json()) as {
      type: string;
      features: Array<{ properties: { slug: string } }>;
    };
    expect(near.type).toBe("FeatureCollection");
    expect(near.features[0]?.properties.slug).toBe(PLACE);
    await developer.context.close();
  });

  test("keys are rate-limited", async ({ request }) => {
    test.skip(!key, "needs the key from the previous test");
    const statuses: number[] = [];
    // The limiter counts in fixed 60 s windows: 130 requests put more than 60 into one window, whatever the boundary.
    for (let index = 0; index < 130; index += 1) {
      statuses.push((await api(request, `/places/${PLACE}`, key)).status());
      if (statuses.at(-1) === 429) break;
    }
    expect(statuses).toContain(429);
    const limited = await api(request, `/places/${PLACE}`, key);
    expect(limited.status()).toBe(429);
    expect(limited.headers()["retry-after"]).toBe("60");
  });

  test("the monthly export is valid GeoJSON with no personal data, linked from /open-data", async ({ page, request }) => {
    await setFixture(request, { openDataExport: true });
    await visit(page, "/open-data");
    const row = page.getByTestId("exports").locator("li").first();
    await expect(row).toContainText("places");
    expect(await seriousViolations(page)).toEqual([]);

    const geojsonHref = await row.getByRole("link", { name: /GeoJSON/ }).getAttribute("href");
    const csvHref = await row.getByRole("link", { name: /CSV/ }).getAttribute("href");
    const geojson = await request.get(geojsonHref ?? "");
    expect(geojson.status()).toBe(200);
    expect(geojson.headers()["content-type"]).toContain("application/geo+json");
    const collection = (await geojson.json()) as {
      type: string;
      license: string;
      features: Array<{ type: string; geometry: { type: string; coordinates: number[] }; properties: Record<string, unknown> }>;
    };
    expect(collection.type).toBe("FeatureCollection");
    expect(collection.license).toBe("ODbL-1.0");
    expect(collection.features.length).toBeGreaterThan(10);
    for (const feature of collection.features) {
      expect(feature.type).toBe("Feature");
      expect(feature.geometry.type).toBe("Point");
      const [lng, lat] = feature.geometry.coordinates;
      expect(Math.abs(lng ?? 999)).toBeLessThanOrEqual(180);
      expect(Math.abs(lat ?? 999)).toBeLessThanOrEqual(90);
    }
    const ours = collection.features.find((feature) => feature.properties.slug === PLACE);
    expect(ours?.properties.isha_iqamah).toBe("20:15");

    const csv = await (await request.get(csvHref ?? "")).text();
    const header = csv.split("\n")[0]?.split(",") ?? [];
    expect(header).toContain("confirmations");
    for (const column of header) expect(column).not.toMatch(/user|email|author|created_by|voter|phone|note/i);
    expect(csv + JSON.stringify(collection)).not.toMatch(/@example\.|api\.setter/);
  });
});
