import { expect, test as setup } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./support/credentials";

/**
 * Signs in once and writes the session cookie to disk. Every other spec picks
 * it up through `storageState`, so the login form is driven exactly once per
 * run instead of before each test.
 *
 * Credentials come from `support/credentials.ts`, which is also what the
 * global setup seeds, so the two can never disagree.
 */
const AUTH_FILE = "e2e/.auth/user.json";

setup("sign in", async ({ page }) => {
  await page.goto("/login");
  // By field name, not by label: the password field shares its <label> with
  // the show/hide toggle button, so `getByLabel("Password")` matches both.
  await page.locator('input[name="email"]').fill(E2E_EMAIL);
  await page.locator('input[name="password"]').fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The app sends a signed-in user to /projects. Waiting on the URL rather
  // than on any one element keeps this from breaking every time that page's
  // layout is redesigned.
  await page.waitForURL("**/projects");
  await expect(page.locator("header")).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });
});
