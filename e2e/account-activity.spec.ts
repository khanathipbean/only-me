import { expect, test } from "@playwright/test";
import { E2E_VIEWER_EMAIL, E2E_VIEWER_PASSWORD } from "./support/credentials";

/**
 * The tab exists so the record can be read. An entry written to a table
 * nobody opens answers nothing — which is why this is checked through the
 * page rather than only through the library.
 */
test("an administrator can see what was done to an account, and get back", async ({ page }) => {
  await page.goto("/members");

  // Two tabs, People first.
  const activityTab = page.getByRole("link", { name: "Account activity" });
  await expect(activityTab).toBeVisible();
  await expect(page.getByRole("link", { name: "People" })).toHaveAttribute("aria-current", "page");

  /* Something worth recording. Setting a password is the one account action
     always available — unlock only appears while somebody is locked.
     Set to the password the suite already uses, not a new one: the first
     version of this spec changed it and left it changed, and the rate-limit
     spec that signs in as this viewer afterwards went red for a reason that
     had nothing to do with the limit. Shared fixtures get put back. */
  async function setViewerPassword(value: string) {
    const row = page.getByRole("row").filter({ hasText: E2E_VIEWER_EMAIL });
    await row.getByRole("button", { name: /^Edit access/ }).click();
    const dialog = page.locator("dialog[open]");
    await dialog.locator('input[name="password"]').fill(value);
    await dialog.getByRole("button", { name: "Set password" }).click();
    await expect(page.getByText(/password set/i)).toBeVisible();
  }

  await setViewerPassword(E2E_VIEWER_PASSWORD);

  await page.getByRole("link", { name: "Account activity" }).click();
  await expect(page).toHaveURL(/tab=activity/);
  await expect(activityTab).toHaveAttribute("aria-current", "page");

  /* The newest entry says what happened, who did it and to whom. The actor's
     name is not asserted literally — whichever seed created the admin decides
     that, and a spec that pins it goes red for a reason that has nothing to do
     with the feature. What matters is that somebody is named rather than the
     "Deleted user" fallback. */
  const firstRow = page.getByRole("row").nth(1);
  await expect(firstRow).toContainText("Password set by an administrator");
  await expect(firstRow).toContainText("E2E Viewer");
  await expect(firstRow).not.toContainText("Deleted user");
  await expect(firstRow).not.toContainText("Deleted account");

  // And the way back works.
  await page.getByRole("link", { name: "People" }).click();
  await expect(page).toHaveURL(/\/members$/);
});
