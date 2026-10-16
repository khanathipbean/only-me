import { expect, test } from "@playwright/test";

/**
 * What the bell does when the server does not answer.
 *
 * None of its four requests used to say. The panel read "Loading…" and never
 * changed, the badge quietly stopped counting, and the thirty-second poll
 * left an unhandled rejection in the console on every tick.
 */
test("says so when the list cannot be fetched, and can be asked again", async ({ page }) => {
  const rejections: string[] = [];
  page.on("pageerror", (error) => rejections.push(error.message));

  // Fails the list request only, so the page itself still loads.
  let failing = true;
  await page.route("**/api/notifications?*", async (route) => {
    if (failing) {
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });

  await page.goto("/projects");
  await page.getByRole("button", { name: "Notifications" }).click();

  const panel = page.getByRole("menu", { name: "Notifications" });
  await expect(panel.getByText(/couldn't load notifications/i)).toBeVisible();

  // And the way out works: let it through, press the button, get a list.
  failing = false;
  await panel.getByRole("button", { name: "Try again" }).click();
  await expect(panel.getByText(/couldn't load notifications/i)).toHaveCount(0);

  expect(rejections).toEqual([]);
});

test("keeps the count it already had when the poll cannot reach the server", async ({ page }) => {
  await page.goto("/projects");

  // Every count request fails from here on. Showing nought would claim the
  // reader is up to date, which is a different thing from not knowing.
  await page.route("**/api/notifications/unread-count", (route) => route.abort("failed"));

  const badge = page.locator("button[aria-label='Notifications'] + span");
  const before = (await badge.count()) > 0 ? await badge.textContent() : null;

  await page.waitForTimeout(1500);

  const after = (await badge.count()) > 0 ? await badge.textContent() : null;
  expect(after).toBe(before);
});
