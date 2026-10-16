import { expect, test } from "@playwright/test";

/**
 * The bug these were written for: a form that refused what you typed sent you
 * back to the list with the message but without your filters, so correcting a
 * typo meant finding your place again from the top of an unfiltered list.
 *
 * Driven through the real form, because the unit test for `errorHref` only
 * proves the helper builds the URL — not that the page hands it the query it
 * is supposed to.
 */
test("a refused Project keeps the filters the list was showing", async ({ page }) => {
  await page.goto("/projects?search=E2E&status=DRAFT");

  await page.getByRole("button", { name: "+ New Project" }).click();

  /* Scoped to the open dialog: every row carries its own Edit dialog with an
     identically named field, all of them in the DOM whether open or not. */
  /* By name, which is also the check that it has one: a native <dialog>
     takes none from the heading inside it, so this used to match nothing and
     the spec had to fall back to `dialog[open]`. A screen reader was in the
     same position. */
  const dialog = page.getByRole("dialog", { name: "New Project" });
  // A code that is certainly taken: the fixture project the suite seeds.
  await dialog.locator('input[name="code"]').fill("E2E-FIXTURE");
  await dialog.locator('input[name="name"]').fill("Duplicate on purpose");
  await dialog.getByRole("button", { name: "Create Project" }).click();

  await expect(page.getByRole("alert").filter({ hasText: /already exists/i })).toBeVisible();

  const url = new URL(page.url());
  expect(url.searchParams.get("search")).toBe("E2E");
  expect(url.searchParams.get("status")).toBe("DRAFT");
  // And the filter is really still applied, not just named in the address.
  await expect(page.locator('input[name="search"]')).toHaveValue("E2E");
});

test("uploading a file keeps the filters the Files page was showing", async ({ page }) => {
  /* Reads the id off the first project's own link rather than guessing at a
     name: the fixture's title has changed before and took this spec with it. */
  await page.goto("/projects");
  const href = await page.locator('a[href^="/projects/"]').first().getAttribute("href");
  const projectId = href!.split("/")[2];

  /* The success path, not the failure one. This page's "Choose a file first"
     cannot be reached through the form at all — the input is `required`, so
     the browser refuses to submit before the server ever sees it. The
     redirect that carries the filters is the same either way. */
  await page.goto(`/projects/${projectId}/files?search=quarterly`);
  await page.locator('input[type="file"]').setInputFiles({
    name: "quarterly-report.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("just enough to be a file"),
  });
  await page.getByRole("button", { name: /^Upload$/ }).click();

  await expect(page.getByText(/file uploaded/i)).toBeVisible();
  expect(new URL(page.url()).searchParams.get("search")).toBe("quarterly");
  await expect(page.locator('input[name="search"]')).toHaveValue("quarterly");
});
