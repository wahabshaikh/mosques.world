import { expect, test } from "@playwright/test";
import { identity, signIn } from "../support/helpers";

// The one-call sign-in every other suite builds on. The real email OTP flow is covered in phase-2.
test.describe("test session endpoint", () => {
  test("signs a new person in, onboarded, with the fixture role", async ({ context, page }) => {
    const person = identity("session");
    const user = await signIn(context, person.email, { username: person.username, role: "moderator" });
    expect(user.username).toBe(person.username);
    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/settings\/profile/);
    await expect(page.getByLabel("Username")).toHaveValue(person.username);
    const session = await page.request.get("/api/auth/get-session");
    expect(((await session.json()) as { user: { role: string } }).user.role).toBe("moderator");
  });

  test("signing in again reuses the account", async ({ context }) => {
    const person = identity("again");
    const first = await signIn(context, person.email);
    await context.clearCookies();
    const second = await signIn(context, person.email);
    expect(second.id).toBe(first.id);
    expect(second.username).toBe(first.username);
  });

  test("onboarded: false stops at onboarding", async ({ context, page }) => {
    const person = identity("fresh");
    await signIn(context, person.email, { onboarded: false });
    await page.goto("/settings/profile");
    await expect(page).toHaveURL(/\/onboarding/);
  });

  test("is refused on a production host", async ({ request }) => {
    const response = await request.post("/api/v1/test/session", { data: { email: "nobody@example.com" }, headers: { host: "mosques.world" } });
    expect(response.ok()).toBeFalsy();
  });
});
