import { expect, test } from "@playwright/test";

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
    await page.waitForURL("**/login?error=*");

    // The first four say nothing about a limit, or the limit would be
    // announcing itself to anyone who typed their password wrong once.
    if (attempt < 5) {
      await expect(message).toHaveText("Invalid email or password.");
    }
  }

  await page.goto("/login");
  await page.locator('input[name="email"]').fill(stranger);
  await page.locator('input[name="password"]').fill("definitely-wrong");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(message).toContainText("Too many attempts");
  await expect(message).toContainText("minutes");
});
