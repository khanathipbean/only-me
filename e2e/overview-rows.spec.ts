import { expect, test } from "@playwright/test";

/**
 * The three panels at the foot of a project's Overview — Recent notes, Latest
 * test runs, Recent files — sit side by side in one grid, so a reader's eye
 * reads across them as well as down each one.
 *
 * Nothing stated their row height. It fell out of whatever the tallest thing
 * in the row happened to be, which is the icon, and Recent files draws a
 * bigger one on purpose because its icon carries a "PDF"/"CSV" label inside.
 * Files ended up on 64px rows beside notes and runs on 56px ones, and the
 * three columns did not line up.
 *
 * Measured rather than read off the classes: the height is the product of the
 * padding, the icon box and two lines of text together, and a change to any of
 * those three moves it. This asks the browser what it actually drew.
 */
test("a row is the same height in all three Overview panels", async ({ page }, testInfo) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);

  /* By href rather than by panel heading: each panel's rows link somewhere
     only that panel links to, and the "View all" link above them goes to the
     bare section (`/runs`), which these patterns do not match. */
  const panels = {
    "Recent notes": page.locator('a[href*="noteId="]'),
    "Latest test runs": page.locator('a[href*="/runs/"]'),
    "Recent files": page.locator('a[href*="fileId="]'),
  };

  const heights: { panel: string; height: number }[] = [];
  for (const [panel, rows] of Object.entries(panels)) {
    const count = await rows.count();
    /* A panel with nothing in it draws an empty-state line instead of rows,
       and three empty panels would agree with each other perfectly while
       proving nothing. The fixture seeds all three. */
    expect(count, `${panel} has no rows to measure`).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const box = await rows.nth(index).boundingBox();
      heights.push({ panel, height: Math.round(box!.height) });
    }
  }

  const distinct = [...new Set(heights.map((row) => row.height))];
  expect(
    distinct,
    `rows differ: ${heights.map((r) => `${r.panel} ${r.height}px`).join(", ")}`,
  ).toHaveLength(1);

  await testInfo.attach("overview", { body: await page.screenshot(), contentType: "image/png" });
});
