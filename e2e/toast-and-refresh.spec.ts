import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

/**
 * Two things that were found by hand and had no test behind them:
 *
 * 1. A Server Action refreshes nothing by itself. Archiving a row redirects
 *    to the list the user is already on, and the router answered that from
 *    its own cache — the archived row stayed on screen, and pressing the
 *    button again just wrote the same change a second time (the audit log
 *    caught someone doing it fourteen times). `invalidateRouteCache` is what
 *    fixes it; this is what proves it stays fixed.
 *
 * 2. The toast that confirms the change belongs in the top-right corner and
 *    has to actually appear.
 *
 * These write to the database, so they rely on the e2e database being its own
 * (see `e2e/support/database.ts`) — the guard in the setup project refuses to
 * start otherwise.
 */
const unique = () => Date.now().toString().slice(-6);

test("creating a project confirms with a toast in the top-right", async ({ page }, testInfo) => {
  const code = `E2E-${unique()}`;

  await page.goto("/projects");
  await page.getByRole("button", { name: "+ New Project" }).click();
  await page.locator('input[name="code"]').fill(code);
  await page.locator('input[name="name"]').fill(`E2E project ${code}`);
  await page.getByRole("button", { name: "Create Project" }).click();

  const toast = page.getByRole("status");
  await expect(toast).toBeVisible();
  await expect(toast).toHaveText(/project created/i);

  // Top-right, not the old bottom-centre: measured rather than asserted from
  // the class list, so a later restyle that moves it is caught.
  const box = (await toast.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.x + box.width).toBeGreaterThan((viewport.width * 2) / 3);
  expect(box.y).toBeLessThan(viewport.height / 3);
  // Below the header, not across it. At `top-4` the box sat over the search
  // field and the account menu, which a position assertion alone would have
  // called a pass.
  const header = (await page.locator("header").boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(header.y + header.height);

  // Kept for a human to look at — where the box sits can be asserted, but
  // whether it looks right cannot. Attached for the HTML report, and written
  // to a fixed path as well so it can be opened without one.
  const shot = await page.screenshot();
  await testInfo.attach("toast", { body: shot, contentType: "image/png" });
  await writeFile("test-results/toast.png", shot);
});

test("archiving a Module takes it off the list straight away", async ({ page }) => {
  const suffix = unique();
  const moduleName = `E2E module ${suffix}`;

  // A project of its own, so this never depends on what another test left.
  await page.goto("/projects");
  await page.getByRole("button", { name: "+ New Project" }).click();
  await page.locator('input[name="code"]').fill(`E2E-M${suffix}`);
  await page.locator('input[name="name"]').fill(`E2E archive host ${suffix}`);
  await page.getByRole("button", { name: "Create Project" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);

  await page.getByRole("link", { name: "Modules" }).click();
  await page.waitForURL(/\/modules/);

  await page.getByRole("button", { name: "+ New Module" }).click();
  await page.locator('input[name="name"]').fill(moduleName);
  await page.getByRole("button", { name: /add module/i }).click();

  const row = page.getByRole("row", { name: new RegExp(moduleName) });
  await expect(row).toBeVisible();

  // Archive, through the row's own Edit dialog.
  await row.getByRole("button", { name: /edit/i }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  // The point of the whole test: no reload, no second click — the row is gone
  // and the toast says why.
  await expect(page.getByRole("status")).toHaveText(/module archived/i);
  await expect(row).toBeHidden();
});
