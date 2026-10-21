import { expect, test } from "@playwright/test";
import { E2E_HANDOFF_CASE } from "./support/credentials";

/**
 * The note a result is recorded with, from the list rather than the case's
 * own page.
 *
 * Choosing Failed there opens a dialog asking what happened, because a red
 * square nobody explained is the thing the Problem Cases report cannot act
 * on. This checks the words actually arrive — the dialog closing and the
 * result saving is not evidence that the note went with them, and the two
 * travel in the same form.
 */
test("a failure recorded from the list keeps the note typed with it", async ({ page }) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  /* Filtered rather than hunted for: the fixture project collects whatever
     the other specs leave behind, so "the first row" is not a stable thing
     to click. */
  await page.goto(`/projects/${projectId}/modules?search=Unassigned`);
  await page.getByRole("link", { name: "Unassigned", exact: true }).first().click();
  await page.waitForURL(/\/requirements/);
  await page.getByRole("link", { name: "Unassigned", exact: true }).first().click();
  await page.waitForURL(/\/scenarios/);
  await page.getByRole("link", { name: "Handing a failure over" }).first().click();
  await page.waitForURL(/\/test-groups/);
  await page.getByRole("link", { name: "Hand-off", exact: true }).first().click();
  await page.waitForURL(/\/test-cases/);

  const note = `Note from the list ${Date.now().toString().slice(-6)}`;
  const row = page.getByRole("row", { name: new RegExp(E2E_HANDOFF_CASE) });
  await row.getByRole("combobox", { name: `Test Result for ${E2E_HANDOFF_CASE}` }).click();
  await page.getByRole("option", { name: "Failed", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("textbox").fill(note);
  await dialog.getByRole("button", { name: "Save" }).click();

  /* Read back from the case's own page, not from the control that was just
     used: the question is whether the words were stored, and the row redraws
     either way. */
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: E2E_HANDOFF_CASE }).click();
  await page.waitForURL(/\/test-cases\//);
  await expect(page.getByRole("textbox", { name: "Actual Result" })).toHaveValue(note);
});
