import { expect, test } from "@playwright/test";
import {
  E2E_VIEWER_EMAIL,
  E2E_VIEWER_PASSWORD,
} from "./support/credentials";

/**
 * Only an ADMIN of some Project may create one. The rule lived on `/projects`,
 * where the button is, and nowhere else — so `/projects/new`, an unlinked page
 * left behind when that button became a Modal, let any signed-in account
 * create a Project by typing the URL.
 *
 * Runs as its own signed-in user, not the suite's admin, so `storageState` is
 * cleared for this file.
 */
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(E2E_VIEWER_EMAIL);
  await page.locator('input[name="password"]').fill(E2E_VIEWER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/projects");
});

test("a viewer is not offered a way to create a Project", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /projects/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ New Project" })).toHaveCount(0);
});

test("a viewer typing /projects/new gets nothing", async ({ page }) => {
  const response = await page.goto("/projects/new");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("button", { name: "Create Project" })).toHaveCount(0);
});
