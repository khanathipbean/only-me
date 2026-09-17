import { expect, test } from "@playwright/test";

/**
 * The thin end of the wedge: proves the browser, the session and the app are
 * wired together. Deliberately read-only — nothing here creates, renames or
 * deletes, so it is safe to point at any environment.
 */
test.describe("signed in", () => {
  test("lands on the projects page", async ({ page }) => {
    await page.goto("/projects");
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole("heading", { name: /projects/i })).toBeVisible();
  });

  test("keeps the session across a reload", async ({ page }) => {
    await page.goto("/projects");
    await page.reload();
    // A lost session bounces to /login, which is the failure this catches.
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("switches theme and remembers it", async ({ page }) => {
    await page.goto("/projects");
    const html = page.locator("html");
    const before = await html.getAttribute("data-theme");

    await page.getByRole("button", { name: /switch to (light|dark) mode/i }).click();
    await expect(html).not.toHaveAttribute("data-theme", before ?? "");

    const after = await html.getAttribute("data-theme");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", after ?? "");
  });
});
