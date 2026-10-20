import { expect, test } from "@playwright/test";

/**
 * A panel anchored with fixed coordinates has to close when the page moves
 * underneath it, or it floats away from the button that opened it. The
 * listener for that is capture-phase, so it also hears the panel's own list
 * scrolling inside itself — which moves nothing, and closed the panel on the
 * first wheel tick of any list long enough to need scrolling.
 *
 * `Select` already guarded against this. The shared hook and the project
 * picker did not.
 */
test("scrolling the notification list keeps it open; scrolling the page closes it", async ({
  page,
}) => {
  await page.goto("/projects");

  const panel = page.getByRole("menu", { name: "Notifications" });
  await page.getByRole("button", { name: "Notifications" }).click();
  await expect(panel).toBeVisible();

  const list = panel.locator("ul");
  await expect(list).toBeVisible();

  /* Scroll the list itself. It may be short enough not to move, which is
     fine — the event fires either way, and the event is what used to close
     the panel. */
  await list.evaluate((el) => {
    el.scrollTop = 40;
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });

  await expect(panel, "the list's own scroll closed the panel").toBeVisible();

  /* The page moving underneath still closes it, which is what the listener is
     for. Dispatched on `document`, which is where a real page scroll is
     targeted — on `window` it never reaches a capture-phase listener the same
     way, and the first version of this test proved nothing because of it. */
  await page.evaluate(() => document.dispatchEvent(new Event("scroll")));
  await expect(panel).toHaveCount(0);
});
