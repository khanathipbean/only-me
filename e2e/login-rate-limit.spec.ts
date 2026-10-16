import { expect, test } from "@playwright/test";
import { E2E_VIEWER_EMAIL, E2E_VIEWER_PASSWORD } from "./support/credentials";

/**
 * Drives the real form, because the message is the part the unit tests cannot
 * see: they prove the limit is enforced, not that anybody is told why they
 * are being turned away.
 *
 * Signed out on purpose — this spec is about the login page — and against an
 * address no account owns, so a run of it can never lock the account every
 * other spec signs in as.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test("tells you to come back later after five wrong passwords", async ({ page }) => {
  /* Scoped to <main>: Next's own route announcer is a `role="alert"` too, and
     an unscoped query matches both. */
  const message = page.getByRole("main").getByRole("alert");
  const stranger = `locked-out-${Date.now().toString(36)}@example.com`;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(stranger);
    await page.locator('input[name="password"]').fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();

    /* Waits for the message, not for a URL. This used to wait on the glob
       "**" + "/login?error=*", which quietly also required `error` to be the
       first parameter — so the spec went red the day the page started
       building that URL through a shared helper, although both spellings are
       the same address. */
    if (attempt < 5) {
      // The first four say nothing about a limit, or the limit would be
      // announcing itself to anyone who typed their password wrong once.
      await expect(message).toHaveText("Invalid email or password.");
    } else {
      await expect(message).toBeVisible();
    }
  }

  await page.goto("/login");
  await page.locator('input[name="email"]').fill(stranger);
  await page.locator('input[name="password"]').fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(message).toContainText("Too many attempts");
  await expect(message).toContainText("minutes");
});

/**
 * The other half: an administrator can see who is locked out and let them
 * back in, because fifteen minutes is a long time to sit and wait when the
 * person is right there.
 *
 * Uses the viewer account rather than the suite's admin: locking the admin
 * out is how you find out, slowly, that every other spec signs in as it.
 */
test.describe("an administrator letting somebody back in", () => {
  test.use({ storageState: "e2e/.auth/user.json" });

  test("shows who is locked and unlocks them", async ({ page, browser }) => {
    const stranded = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const theirBrowser = await stranded.newPage();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await theirBrowser.goto("/login");
      await theirBrowser.locator('input[name="email"]').fill(E2E_VIEWER_EMAIL);
      await theirBrowser.locator('input[name="password"]').fill("not-their-password");
      await theirBrowser.getByRole("button", { name: "Sign in" }).click();
      await expect(theirBrowser.getByRole("main").getByRole("alert")).toBeVisible();
    }

    // The right password no longer works, which is the situation the button
    // exists for.
    await theirBrowser.goto("/login");
    await theirBrowser.locator('input[name="email"]').fill(E2E_VIEWER_EMAIL);
    await theirBrowser.locator('input[name="password"]').fill(E2E_VIEWER_PASSWORD);
    await theirBrowser.getByRole("button", { name: "Sign in" }).click();
    await expect(theirBrowser.getByRole("main").getByRole("alert")).toContainText(
      "Too many attempts",
    );

    await page.goto("/members");
    const row = page.getByRole("row").filter({ hasText: E2E_VIEWER_EMAIL });
    await expect(row.getByText(/Locked/)).toBeVisible();

    await row.getByRole("button", { name: /^Unlock/ }).click();
    await expect(row.getByText(/Locked/)).toHaveCount(0);

    // And the proof that the badge is not just hidden: they can sign in.
    await theirBrowser.goto("/login");
    await theirBrowser.locator('input[name="email"]').fill(E2E_VIEWER_EMAIL);
    await theirBrowser.locator('input[name="password"]').fill(E2E_VIEWER_PASSWORD);
    await theirBrowser.getByRole("button", { name: "Sign in" }).click();
    await theirBrowser.waitForURL("**/projects");

    await stranded.close();
  });
});
