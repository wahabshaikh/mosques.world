import AxeBuilder from "@axe-core/playwright";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { baseURL, newUser, placeId, post, resetPlace, todayIn } from "../phase-2/helpers";

const expect = baseExpect.configure({ timeout: 15_000 });

const SAVED = "limehouse-mosque-limehouse";
const STEWARDED = "locksley-estate-mosque-limehouse";

async function visit(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator("[data-app-ready=true]")).toBeAttached();
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
}

type Mail = { subject: string; text: string; headers?: Record<string, string> };

async function lastMail(page: Page, email: string): Promise<Mail> {
  let mail: Mail | null = null;
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/v1/test/emails?to=${encodeURIComponent(email)}`);
      const body = (await response.json()) as { messages: Mail[] };
      mail = body.messages.find((message) => message.subject.includes("changed at")) ?? null;
      return Boolean(mail);
    })
    .toBe(true);
  return mail as unknown as Mail;
}

test.describe("phase 6 stewards and notifications", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });
  let saverEmail = "";
  let unsubscribeUrl = "";

  test("a saved place's time change reaches the saver by email and in-app, old → new", async ({ browser, request }) => {
    await resetPlace(request, SAVED);
    const id = await placeId(request, SAVED);
    const saver = await newUser(browser, "saver");
    saverEmail = saver.person.email;
    expect((await post(saver.page.request, "/api/v1/saved", { placeId: id })).ok()).toBeTruthy();

    const contribute = async (prefix: string, time: string) => {
      const member = await newUser(browser, prefix, { trustLevel: 1, ageDays: 30 });
      const response = await post(member.page.request, `/api/v1/places/${id}/contributions`, {
        effectiveFrom: todayIn("Europe/London"),
        source: "board",
        changes: [{ key: "iqamah.isha", value: { t: time } }],
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      await member.context.close();
    };
    await contribute("isha.old", "20:45");
    // Three trusted members report 8:30, which replaces 8:45.
    await contribute("isha.new1", "20:30");
    await contribute("isha.new2", "20:30");
    await contribute("isha.new3", "20:30");

    const mail = await lastMail(saver.page, saverEmail);
    expect(mail.subject).toBe("Isha iqamah changed at Limehouse Mosque");
    expect(mail.text).toContain("8:45 PM → 8:30 PM");
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    unsubscribeUrl = mail.text.match(/https?:\/\/\S+\/notifications\/unsubscribe\?token=\S+/)?.[0] ?? "";
    expect(unsubscribeUrl).not.toBe("");

    const { page } = saver;
    await visit(page, "/");
    await expect(page.getByTestId("unread-count")).toHaveText(/1/);
    await visit(page, "/notifications");
    const item = page.locator('[data-notification="saved_changes"]').first();
    await expect(item).toContainText("Isha iqamah changed at Limehouse Mosque");
    await expect(item).toContainText("8:45 PM → 8:30 PM");
    expect(await seriousViolations(page)).toEqual([]);
    await saver.context.close();
  });

  test("the unsubscribe link turns that topic off without signing in", async ({ browser, request }) => {
    expect(unsubscribeUrl).not.toBe("");
    const guest = await browser.newContext({ baseURL });
    const page = await guest.newPage();
    const link = new URL(unsubscribeUrl);
    await visit(page, `${link.pathname}${link.search}`);
    await page.getByRole("button", { name: "Unsubscribe" }).click();
    await expect(page.getByRole("heading", { name: "You're unsubscribed" })).toBeVisible();
    await guest.close();

    // RFC 8058 one-click also works (idempotent).
    const token = link.searchParams.get("token") ?? "";
    const oneClick = await request.post(`/api/v1/notifications/unsubscribe?token=${encodeURIComponent(token)}`, {
      form: { "List-Unsubscribe": "One-Click" },
    });
    expect(oneClick.status()).toBe(200);
    expect(await oneClick.json()).toMatchObject({ ok: true, topic: "saved_changes", channel: "email" });
    expect((await request.post(`/api/v1/notifications/unsubscribe?token=forged.token`)).status()).toBe(400);
  });

  test("a steward is approved by a moderator, and one steward confirm verifies a value", async ({ browser, request }) => {
    await resetPlace(request, STEWARDED);
    const id = await placeId(request, STEWARDED);
    const steward = await newUser(browser, "steward");
    await visit(steward.page, `/m/${STEWARDED}`);
    await steward.page.getByRole("link", { name: "Are you involved with this mosque?" }).click();
    await steward.page.waitForURL(/\/steward$/);
    await steward.page.getByLabel("Committee member").check();
    await steward.page.getByLabel("How are you involved?").fill("I sit on the committee and print the monthly timetable.");
    await steward.page.getByRole("button", { name: "Ask to look after this mosque" }).click();
    await expect(steward.page.getByText("A moderator will review your request")).toBeVisible();
    expect(await seriousViolations(steward.page)).toEqual([]);

    const moderator = await newUser(browser, "stewardmod", { trustLevel: 3, role: "moderator", ageDays: 90 });
    await visit(moderator.page, "/admin/stewards");
    const row = moderator.page.locator("[data-steward]").filter({ hasText: `@${steward.person.username}` });
    await row.getByRole("button", { name: "Approve" }).click();
    await expect(moderator.page.getByText("Approved", { exact: true })).toBeVisible();
    await moderator.context.close();

    // A new member's value: on its own it would need two more new-member confirms to verify.
    const author = await newUser(browser, "asr.author");
    const added = await post(author.page.request, `/api/v1/places/${id}/contributions`, {
      effectiveFrom: todayIn("Europe/London"),
      source: "observed",
      changes: [{ key: "iqamah.asr", value: { t: "16:45" } }],
    });
    expect(added.ok(), await added.text()).toBeTruthy();
    const candidateId = ((await added.json()) as { results: Array<{ candidateId: string; state: string }> }).results[0]?.candidateId ?? "";
    await author.context.close();

    const vote = await post(steward.page.request, "/api/v1/votes", { candidateId, polarity: 1, source: "imam" });
    expect(vote.ok(), await vote.text()).toBeTruthy();
    expect(((await vote.json()) as { state: string }).state).toBe("verified");

    await visit(steward.page, `/m/${STEWARDED}`);
    await expect(steward.page.getByTestId("steward-badge")).toContainText(/Looked after by \d+ stewards?/);
    await visit(steward.page, "/steward");
    await expect(steward.page.locator(`[data-steward-place="${STEWARDED}"]`)).toBeVisible();
    expect(await seriousViolations(steward.page)).toEqual([]);
    await steward.context.close();
  });

  test("notification settings turn a topic off and keep it off", async ({ browser }) => {
    const member = await newUser(browser, "prefs");
    await visit(member.page, "/settings/notifications");
    const row = member.page.locator('[data-topic="saved_changes"]');
    await expect(row.getByLabel("Email")).toBeChecked();
    await row.getByLabel("Email").uncheck();
    await member.page.reload();
    await expect(member.page.locator('[data-topic="saved_changes"]').getByLabel("Email")).not.toBeChecked();
    expect(await seriousViolations(member.page)).toEqual([]);
    await member.context.close();
  });
});
