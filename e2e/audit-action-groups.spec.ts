import { expect, test } from "@playwright/test";

/**
 * The Action filter's thirteen verbs, under four headings.
 *
 * They were one undifferentiated column — create, update, delete, archive,
 * restore, duplicate, move, update-assignee… — and a reader had to know the
 * app well enough to tell which of them could possibly answer their
 * question. The headings say what kind of thing each run is before any of
 * them is read.
 */
test("the Action filter groups its options under headings", async ({ page }) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  await page.goto(`/projects/${projectId}/audit-log`);
  await page.getByRole("combobox", { name: "Action" }).click();

  const list = page.getByRole("listbox");
  for (const heading of ["General", "Organization", "Assignment & testing", "Import"]) {
    await expect(list.getByText(heading, { exact: true })).toBeVisible();
  }

  /* A heading is a label, not something to choose. A listbox that counted it
     as an option would let the arrow keys land on it, and `aria-activedescendant`
     would point at something that cannot be picked. */
  await expect(list.getByRole("option", { name: "General", exact: true })).toHaveCount(0);

  /* And the options themselves are all still there — grouping must not have
     dropped any. "All" plus the thirteen actions. */
  await expect(list.getByRole("option")).toHaveCount(14);
});
