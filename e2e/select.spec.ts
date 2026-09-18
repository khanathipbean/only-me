import { expect, test } from "@playwright/test";

/**
 * The dropdown was pinned to exactly its trigger's width, which is fine on a
 * form field and wrong on a filter: those are about sixty pixels wide, so
 * "Critical" came out as "Critic / al" across two lines.
 *
 * Measured rather than eyeballed — a wrapped option is simply a taller one,
 * and nothing about the class list would have shown it.
 */
const SINGLE_LINE_MAX_HEIGHT = 34;

test("a short option in a narrow filter stays on one line", async ({ page }) => {
  const suffix = Date.now().toString().slice(-6);

  // A Module of its own to reach a Requirements list, where the narrowest
  // filters live. Nothing here depends on what another test left behind.
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  await page.getByRole("link", { name: "Modules" }).click();
  await page.waitForURL(/\/modules/);

  await page.getByRole("button", { name: "+ New Module" }).click();
  // By placeholder, not by field name: every row's Edit dialog holds a field
  // with the same name, so `input[name="name"]` stops being unique the moment
  // the list has a row in it.
  await page
    .getByPlaceholder("One menu of the system under test, e.g. Dashboard")
    .fill(`Select spec ${suffix}`);
  await page.getByRole("button", { name: /add module/i }).click();

  // Filtered through the URL, not by hoping it landed on page one: the fixture
  // project keeps every Module each run leaves behind, and the list pages at
  // ten.
  await page.goto(`${page.url().split("?")[0]}?search=${suffix}`);
  const moduleRow = page.getByRole("row", { name: new RegExp(`Select spec ${suffix}`) });
  await moduleRow.getByRole("link").first().click();
  await page.waitForURL(/\/requirements/);

  // Priority: the trigger reads "All", so it is about sixty pixels wide while
  // its options run to "Critical".
  const trigger = page.getByRole("combobox", { name: "Priority" });
  await trigger.click();

  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();

  for (const option of await options.all()) {
    const box = (await option.boundingBox())!;
    expect.soft(box.height).toBeLessThanOrEqual(SINGLE_LINE_MAX_HEIGHT);
  }

  // And the popup is at least as wide as the field it belongs to. Measured on
  // the box the width is set on, not the <ul> scrolling inside it — that one
  // is narrower by the popup's own border.
  const popup = page.getByRole("listbox").locator("..");
  const popupBox = (await popup.boundingBox())!;
  const triggerBox = (await trigger.boundingBox())!;
  expect(popupBox.width).toBeGreaterThanOrEqual(triggerBox.width);
});
