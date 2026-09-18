import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

/**
 * A list row's name cell was a run of inline text: the name, then a Feature
 * tag, then "N scenario(s)". The line broke wherever the text ran out, which
 * on a long name landed inside that last phrase and left "scenario(s)" alone
 * on the next line — with most of the column still empty to the right.
 *
 * The count is one phrase. This checks it is still one line, whatever the name
 * beside it does.
 */
const LONG_NAME =
  "REQ-LAYOUT-001 ผู้ใช้สามารถเข้าถึง ค้นหา และเลือก Semantic Type เพื่อดูความหมายเชิง Semantic ของข้อมูล";

test("a long name doesn't break the count across two lines", async ({ page }, testInfo) => {
  const suffix = Date.now().toString().slice(-6);

  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  await page.getByRole("link", { name: "Modules" }).click();
  await page.waitForURL(/\/modules/);

  await page.getByRole("button", { name: "+ New Module" }).click();
  await page
    .getByPlaceholder("One menu of the system under test, e.g. Dashboard")
    .fill(`Layout spec ${suffix}`);
  await page.getByRole("button", { name: /add module/i }).click();

  // Filtered through the URL, not by hoping it landed on page one: the fixture
  // project keeps every Module each run leaves behind, and the list pages at
  // ten.
  await page.goto(`${page.url().split("?")[0]}?search=${suffix}`);
  const moduleRow = page.getByRole("row", { name: new RegExp(`Layout spec ${suffix}`) });
  await moduleRow.getByRole("link").first().click();
  await page.waitForURL(/\/requirements/);

  await page.getByRole("button", { name: "+ New Requirement" }).click();
  // By placeholder: every row's Edit dialog carries a field of the same name.
  await page.getByPlaceholder("e.g. A user can filter the Dashboard").fill(LONG_NAME);
  // With a Feature, so the row carries everything it carries in real use: the
  // name, the tag and the count, which is the combination that used to break.
  await page.getByPlaceholder("Sub-area of the module, e.g. Policy Center").fill("Semantic Type");
  await page.getByRole("button", { name: "Create Requirement" }).click();

  const count = page.getByText(/\d+ scenario\(s\)/).first();
  await expect(count).toBeVisible();

  // Across a range of widths, because where a line happens to break depends on
  // exactly how much room is left — at one width the whole phrase moves to the
  // next line intact and nothing looks wrong.
  for (const width of [1280, 1024, 920, 820]) {
    await page.setViewportSize({ width, height: 720 });

    // One line box. An inline element broken across lines reports one rect per
    // line, which is the defect exactly: "1" left on one row and "scenario(s)"
    // on the next.
    const lines = await count.evaluate((element) => element.getClientRects().length);
    expect.soft(lines, `at ${width}px`).toBe(1);
  }

  await page.setViewportSize({ width: 1280, height: 720 });

  await testInfo.attach("row", { body: await page.screenshot(), contentType: "image/png" });
  await writeFile("test-results/row-layout.png", await page.screenshot());
});
