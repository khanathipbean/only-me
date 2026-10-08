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

    /* A menu, not a two-way switch: there are three themes now, and the one
       button that used to say "switch to dark mode" became "Change theme"
       with the choice inside. The spec went on pressing a button that had not
       existed for weeks, and nobody noticed because nothing was running it.

       Opened under `toPass` because the first press can land before the page
       has hydrated, and a press nothing is listening for is simply lost. */
    const trigger = page.getByRole("button", { name: /change theme/i });
    const menu = page.getByRole("menu");
    await expect(async () => {
      await trigger.click();
      await expect(menu).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });

    /* The three are "Light", "Bull Terrier" and "Dark", so either word picks
       out one of them on its own. */
    const wanted = before === "light" ? "Dark" : "Light";
    await menu.getByRole("menuitemradio").filter({ hasText: wanted }).click();
    await expect(html).not.toHaveAttribute("data-theme", before ?? "");

    const after = await html.getAttribute("data-theme");
    await page.reload();
    await expect(html).toHaveAttribute("data-theme", after ?? "");
  });
});
