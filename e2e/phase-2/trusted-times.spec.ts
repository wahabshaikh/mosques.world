import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { identity, latestOtp, newUser, post, placeId, resetPlace, setFixture, signUp, testGet, todayIn } from "./helpers";

// Contribution routes recompute trust synchronously; allow for cold starts on preview and dev.
const expect = baseExpect.configure({ timeout: 15_000 });

const FIRST = "muslim-welfare-house-finsbury-park";
const DISPUTE = "holborn-muslim-community-welfare-association-holborn";
const HELD = "the-london-mosque-southfields";
const DELETE = "iqraa-ethiopian-muslim-centre-harlesden";
const REPLAY = "baitul-ehsan-mitcham";
const LIMIT_PLACES = [
  "baitul-futuh-mosque-morden",
  "shepherds-bush-mosque-and-muslim-cultural-centre-shepherd-s-bush",
  "uk-albanian-muslim-community-cultural-centre-queen-s-park",
  "uxbridge-muslim-community-centre-cowley",
  "baitul-ahad-leyton",
];

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
}

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
}

async function openUpdate(page: Page, slug: string) {
  await visit(page, `/m/${slug}`);
  await page.getByRole("link", { name: "Update timings" }).click();
  await expect(page.getByRole("tab", { name: "Iqamah times" })).toBeVisible();
}

/** Sets a row to a clock time through the stepper's type-in field. */
async function setTime(page: Page, prayer: string, time: string) {
  const row = page.locator(`[data-row="iqamah.${prayer}"]`);
  const add = row.getByRole("button", { name: /^Add / });
  if (await add.isVisible()) await add.click();
  await row.getByRole("spinbutton").click();
  const input = row.getByLabel(/time$/);
  await input.fill(time);
  await input.press("Enter");
}

async function setToday(page: Page) {
  await page.getByLabel("Applies from").fill(todayIn("Europe/London"));
}

test.describe("phase 2 trusted iqamah times", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });

  test("sign up with email OTP, choose a username, land back on the page", async ({ page }) => {
    const person = identity("otp");
    await signUp(page, person, `/m/${FIRST}`);
    await expect(page).toHaveURL(new RegExp(`/m/${FIRST}$`));
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("a first Asr time shows as unverified at once and on the explore card, then verifies", async ({ page, browser, request }) => {
    await resetPlace(request, FIRST);
    const person = identity("first");
    await signUp(page, person, `/m/${FIRST}`);
    await openUpdate(page, FIRST);
    await setTime(page, "asr", "16:30");
    await page.getByRole("button", { name: "Submit 1 change" }).click();
    await expect(page.getByTestId("update-results")).toContainText("Asr is live");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveURL(new RegExp(`/m/${FIRST}$`));
    await expect(page.locator('[data-iqamah="asr"]')).toContainText("4:30 PM");
    await expect(page.locator('[data-prayer="asr"]')).toContainText("Unverified · 1 person");
    expect(await seriousViolations(page)).toEqual([]);

    // The explore card shows the next iqamah (clock frozen before Asr on preview/local).
    const explore = await browser.newPage({ extraHTTPHeaders: { "x-mw-now": `${todayIn("Europe/London")}T14:00:00Z` } });
    await explore.goto("/search?where=Finsbury%20Park&lat=51.5637013&lng=-0.1072571&z=15");
    const card = explore.locator("[data-place-card]").filter({ hasText: "Muslim Welfare House" });
    await expect(card).toContainText("Asr 4:30 PM");
    await expect(card).toContainText("iqamah");
    await explore.close();

    // A second level-0 confirmation is not enough (score 2 < 3).
    const second = await newUser(browser, "second");
    await visit(second.page, `/m/${FIRST}`);
    await second.page.locator('[data-prayer="asr"]').getByRole("button", { name: "Confirm 4:30 PM" }).click();
    await expect(second.page.getByText(/needs 1 more confirmation/)).toBeVisible();
    await expect(second.page.locator('[data-prayer="asr"]')).toContainText("Unverified · 2 people");
    await second.context.close();

    // A third, level-1 confirmation verifies it.
    const third = await newUser(browser, "third", { trustLevel: 1 });
    await visit(third.page, `/m/${FIRST}`);
    await third.page.locator('[data-prayer="asr"]').getByRole("button", { name: "Confirm 4:30 PM" }).click();
    await expect(third.page.locator('[data-prayer="asr"]')).toContainText(/Verified .* · 3 people/);
    await third.context.close();
  });

  test("a change to a verified Isha is disputed, then promoted by two trusted confirms", async ({ page, browser, request }) => {
    await resetPlace(request, DISPUTE);
    const setters = await Promise.all([1, 2, 3].map((index) => newUser(browser, `isha${index}`, { trustLevel: 1, ageDays: 30 })));
    for (const [index, setter] of setters.entries()) {
      await openUpdate(setter.page, DISPUTE);
      await setToday(setter.page);
      if (index === 0) {
        await setTime(setter.page, "isha", "20:45");
        await setter.page.getByRole("button", { name: "Submit 1 change" }).click();
      } else {
        await setter.page.getByRole("button", { name: "Confirm times are correct" }).click();
      }
      await expect(setter.page.getByTestId("update-results")).toBeVisible();
      await setter.context.close();
    }
    await page.goto(`/m/${DISPUTE}`);
    await expect(page.locator('[data-prayer="isha"]')).toContainText(/Verified .* · 3 people/);

    const proposer = await newUser(browser, "proposer", { trustLevel: 1, ageDays: 30 });
    await openUpdate(proposer.page, DISPUTE);
    await setToday(proposer.page);
    await setTime(proposer.page, "isha", "20:30");
    await expect(proposer.page.locator('[data-row="iqamah.isha"]')).toContainText("was 8:45 PM");
    await proposer.page.getByRole("button", { name: "Submit 1 change" }).click();
    await expect(proposer.page.getByTestId("update-results")).toContainText("Pending");
    await proposer.context.close();

    await page.reload();
    const banner = page.locator('[data-dispute="iqamah.isha"]');
    await expect(banner).toContainText("Isha may have changed. 1 person says the iqamah is now 8:30 PM.");
    await expect(page.locator('[data-prayer="isha"]')).toContainText("Change reported");
    expect(await seriousViolations(page)).toEqual([]);

    for (const name of ["trusted1", "trusted2"]) {
      const trusted = await newUser(browser, name, { trustLevel: 2, ageDays: 60 });
      await visit(trusted.page, `/m/${DISPUTE}`);
      await trusted.page.locator('[data-dispute="iqamah.isha"]').getByRole("button", { name: "Confirm 8:30 PM" }).click();
      await expect(trusted.page.getByText(/Thanks!/)).toBeVisible();
      await trusted.context.close();
    }
    await page.reload();
    await expect(page.locator('[data-dispute="iqamah.isha"]')).toHaveCount(0);
    await expect(page.locator('[data-iqamah="isha"]')).toContainText("8:30 PM");

    await page.goto(`/m/${DISPUTE}/history`);
    const isha = page.locator('[data-history="iqamah.isha"]');
    await expect(isha.locator("li").filter({ hasText: "8:45 PM" })).toContainText("Superseded");
    await expect(isha.locator("li").filter({ hasText: "8:30 PM" })).toContainText("Current");
  });

  test("a new account's change to a verified time is held for review, approved, then reverted", async ({ browser, request }) => {
    await resetPlace(request, HELD);
    const id = await placeId(request, HELD);
    for (const name of ["held1", "held2", "held3"]) {
      const setter = await newUser(browser, name, { trustLevel: 1, ageDays: 30 });
      const response = await post(setter.page.request, `/api/v1/places/${id}/contributions`, {
        effectiveFrom: todayIn("Europe/London"),
        source: "board",
        changes: [{ key: "iqamah.asr", value: { t: "16:30" } }],
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      await setter.context.close();
    }

    const newbie = await newUser(browser, "newbie", { trustLevel: 0, ageDays: 2 });
    await openUpdate(newbie.page, HELD);
    await setToday(newbie.page);
    await setTime(newbie.page, "asr", "16:45");
    await expect(newbie.page.getByTestId("update-helper")).toContainText("trusted member reviews");
    await newbie.page.getByRole("button", { name: "Submit 1 change" }).click();
    await expect(newbie.page.getByTestId("update-results")).toContainText("In review");
    await newbie.page.getByRole("button", { name: "Done" }).click();
    await expect(newbie.page.locator('[data-iqamah="asr"]')).toContainText("4:30 PM");
    await newbie.context.close();

    const moderator = await newUser(browser, "moderator", { role: "moderator", trustLevel: 3, ageDays: 400 });
    await visit(moderator.page, "/admin/queue");
    const item = moderator.page.locator("[data-held]").filter({ hasText: "The London Mosque" });
    await expect(item).toContainText("4:30 PM → 4:45 PM");
    expect(await seriousViolations(moderator.page)).toEqual([]);
    await item.getByRole("button", { name: "Approve" }).click();
    await expect(moderator.page.getByText("Approved and live")).toBeVisible();

    await visit(moderator.page, `/m/${HELD}`);
    await expect(moderator.page.locator('[data-iqamah="asr"]')).toContainText("4:45 PM");

    await visit(moderator.page, "/admin/audit");
    moderator.page.once("dialog", (dialog) => void dialog.accept());
    const promotion = moderator.page.locator('[data-audit="promote"]').filter({ hasText: "The London Mosque" }).filter({ hasText: "4:45 PM" }).first();
    await promotion.getByRole("button", { name: "Revert" }).click();
    await expect(moderator.page.getByText("Reverted to the previous value")).toBeVisible();

    await visit(moderator.page, `/m/${HELD}`);
    await expect(moderator.page.locator('[data-iqamah="asr"]')).toContainText("4:30 PM");
    await moderator.context.close();
  });

  test("moderation pages are for moderators only", async ({ browser }) => {
    const member = await newUser(browser, "member");
    await member.page.goto("/admin/queue");
    await expect(member.page).toHaveURL(/\/$/);
    const response = await post(member.page.request, "/api/v1/admin/held/anything", { action: "approve" });
    expect(response.status()).toBe(403);
    await member.context.close();
  });

  test("waitlist members get a one-off 'times are live' email with one-click unsubscribe", async ({ browser, request }) => {
    const id = await placeId(request, HELD);
    const email = identity("waiter").email;
    const joined = await request.post("/api/v1/waitlist", { data: { email, placeId: id } });
    expect(joined.ok()).toBeTruthy();
    const confirmMail = (await (await testGet(request, `/api/v1/test/emails?to=${encodeURIComponent(email)}`)).json()) as { messages: Array<{ text: string }> };
    const confirmUrl = new URL(confirmMail.messages[0]?.text.match(/https?:\/\/\S+/)?.[0] ?? "");
    await request.get(`${confirmUrl.pathname}${confirmUrl.search}`);

    const admin = await newUser(browser, "admin", { role: "admin", trustLevel: 3 });
    for (let round = 0; round < 20; round += 1) {
      const response = await post(admin.page.request, "/api/v1/admin/broadcast/times-live", {});
      expect(response.ok(), await response.text()).toBeTruthy();
      const body = (await response.json()) as { remaining: number };
      if (body.remaining === 0) break;
    }
    const again = await post(admin.page.request, "/api/v1/admin/broadcast/times-live", {});
    expect(((await again.json()) as { sent: number }).sent).toBe(0);
    await admin.context.close();

    const live = (await (await testGet(request, `/api/v1/test/emails?to=${encodeURIComponent(email)}`)).json()) as {
      messages: Array<{ subject: string; text: string; headers?: Record<string, string> }>;
    };
    const message = live.messages[0];
    expect(message?.subject).toContain("Iqamah times can now be added");
    expect(message?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const token = message?.text.match(/token=([0-9a-f]{64})/)?.[1];
    expect(token).toBeTruthy();
    const unsubscribed = await request.post(`/api/v1/waitlist/unsubscribe?token=${token}`);
    expect(unsubscribed.ok()).toBeTruthy();
    const member = await newUser(browser, "notadmin");
    const refused = await post(member.page.request, "/api/v1/admin/broadcast/times-live", {});
    expect(refused.status()).toBe(403);
    await member.context.close();
  });

  test("signed-out votes replay after sign-in", async ({ page, browser, request }) => {
    await resetPlace(request, REPLAY);
    const proposer = await newUser(browser, "replayer", { trustLevel: 1, ageDays: 30 });
    const id = await placeId(request, REPLAY);
    const other = await post(proposer.page.request, `/api/v1/places/${id}/contributions`, {
      effectiveFrom: todayIn("Europe/London"),
      source: "board",
      changes: [{ key: "iqamah.fajr", value: { t: "05:45" } }],
    });
    expect(other.ok()).toBeTruthy();
    await proposer.context.close();

    await visit(page, `/m/${REPLAY}`);
    await page.locator('[data-prayer="fajr"]').getByRole("button", { name: "Confirm 5:45 AM" }).click();
    await page.waitForURL(/\/sign-in/);
    await expect(page.locator("[data-app-ready=true]")).toBeAttached();
    const person = identity("replay");
    await page.getByLabel("Email").fill(person.email);
    await page.setExtraHTTPHeaders({ "cf-connecting-ip": person.ip });
    await page.getByRole("button", { name: "Email me a code" }).click();
    await page.getByLabel("6-digit code").fill(await latestOtp(page.request, person.email));
    await page.waitForURL(/\/onboarding/);
    await expect(page.locator("[data-app-ready=true]")).toBeAttached();
    await page.getByLabel("Username").fill(person.username);
    await page.getByLabel("Display name").fill(person.username);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL(new RegExp(`/m/${REPLAY}`));
    await expect(page.getByText(/Thanks! Fajr/)).toBeVisible();
    await expect(page.locator('[data-prayer="fajr"]')).toContainText("2 people");
  });

  test("the 21st vote in a day from a level-0 account gets a friendly error", async ({ browser, request }) => {
    const author = await newUser(browser, "author", { trustLevel: 2, ageDays: 60 });
    const candidates: string[] = [];
    for (const slug of LIMIT_PLACES) {
      await resetPlace(request, slug);
      const id = await placeId(request, slug);
      const response = await post(author.page.request, `/api/v1/places/${id}/contributions`, {
        effectiveFrom: todayIn("Europe/London"),
        source: "board",
        changes: ["fajr", "dhuhr", "asr", "maghrib", "isha"].map((prayer, index) => ({ key: `iqamah.${prayer}`, value: { t: `0${index + 5}:15` } })),
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      const facts = await author.page.request.get(`/api/v1/places/${id}/facts`);
      const body = (await facts.json()) as { facts: Array<{ current: { candidateId: string } | null }> };
      candidates.push(...body.facts.flatMap((fact) => (fact.current ? [fact.current.candidateId] : [])));
    }
    await author.context.close();
    expect(candidates.length).toBeGreaterThanOrEqual(21);

    const voter = await newUser(browser, "voter");
    for (const [index, candidateId] of candidates.slice(0, 21).entries()) {
      const response = await post(voter.page.request, "/api/v1/votes", { candidateId, polarity: 1, source: "observed" });
      if (index < 20) {
        expect(response.status(), await response.text()).toBe(200);
      } else {
        expect(response.status()).toBe(429);
        const body = (await response.json()) as { error: string };
        expect(body.error).toContain("today's limit of 20 confirmations");
      }
    }
    await voter.context.close();
  });

  test("deleting an account anonymises activity and keeps the facts", async ({ page, request }) => {
    await resetPlace(request, DELETE);
    const person = identity("leaver");
    await signUp(page, person, `/m/${DELETE}`);
    await openUpdate(page, DELETE);
    await setTime(page, "dhuhr", "13:30");
    await page.getByRole("button", { name: "Submit 1 change" }).click();
    await expect(page.getByTestId("update-results")).toBeVisible();

    await visit(page, "/settings/account");
    await page.getByPlaceholder('Type "delete"').fill("delete");
    await page.getByRole("button", { name: "Delete my account" }).click();
    await page.waitForURL(/\/\?deleted=1/);

    await page.goto(`/m/${DELETE}`);
    await expect(page.locator('[data-iqamah="dhuhr"]')).toContainText("1:30 PM");
    await expect(page.getByText("former member").first()).toBeVisible();
    await expect(page.getByText(`@${person.username}`)).toHaveCount(0);
    const mail = await testGet(request, `/api/v1/test/emails?to=${encodeURIComponent(person.email)}`);
    const body = (await mail.json()) as { messages: Array<{ subject: string }> };
    expect(body.messages[0]?.subject).toContain("deleted");
    await setFixture(request, { resetPlace: DELETE });
  });

  test("phase 1 surfaces still work signed out", async ({ page }) => {
    await page.goto(`/m/${HELD}`);
    await expect(page.getByRole("heading", { name: "The London Mosque" })).toBeVisible();
    await expect(page.getByTestId("directions")).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  });
});
