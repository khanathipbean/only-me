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

/**
 * The same hole the DEV role turned up, which a VIEWER had been meeting for
 * as long as these pages have existed: the create and edit controls were
 * drawn for every member, and pressing one answered 404. A VIEWER is "sees
 * everything, changes nothing", so there should be nothing to press.
 */
test("a viewer is not offered controls that would refuse them", async ({ page }) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  for (const path of ["modules", "notes", "files"]) {
    await page.goto(`/projects/${projectId}/${path}`);
    await expect(page.getByRole("button", { name: /^\+ New/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Actions for/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Upload/ })).toHaveCount(0);
  }
});

/**
 * Settings holds what is set once for the whole install, and the same rule
 * that has always gated Members gates the section around it: ADMIN of some
 * Project. A VIEWER should not see the tab, and typing the address should
 * not get round it — hiding a link has never been the guard here.
 */
test("a viewer gets no Settings tab and no Settings page", async ({ page }) => {
  await expect(page.getByRole("navigation", { name: "Sections" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Settings" }),
  ).toHaveCount(0);

  const response = await page.goto("/settings");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("link", { name: "Users" })).toHaveCount(0);

  /* And every page under it, not only the one with the cards on. */
  expect((await page.goto("/settings/roles"))?.status()).toBe(404);
  await expect(page.getByRole("navigation", { name: "Roles" })).toHaveCount(0);
});

/**
 * The menu and the page have to agree about Import.
 *
 * They did not: the tab was shown to anybody who was not a DEV, while the
 * page itself asks for an editor — so a VIEWER was offered a link and met a
 * 404 at the end of it. Each tab names the capability its own page checks
 * now, which is what closed it.
 */
test("a viewer is not offered the Import tab it cannot open", async ({ page }) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  const nav = page.getByRole("navigation", { name: "Project" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Import" })).toHaveCount(0);
  // The tabs a VIEWER may open are still there.
  await expect(nav.getByRole("link", { name: "Modules" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Audit Trail" })).toBeVisible();

  // And the address behind it was never open to them anyway.
  expect((await page.goto(`/projects/${projectId}/import`))?.status()).toBe(404);
});
