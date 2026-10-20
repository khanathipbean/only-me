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

test("a refused upload keeps the filters the Files page was showing", async ({ page }) => {
  /* Reads the id off the first project's own link rather than guessing at a
     name: the fixture's title has changed before and took this spec with it. */
  await page.goto("/projects");
  const href = await page.locator('a[href^="/projects/"]').first().getAttribute("href");
  const projectId = href!.split("/")[2];

  await page.goto(`/projects/${projectId}/files?search=quarterly`);

  /* Submitting with nothing chosen, which the browser normally refuses: the
     file input is `required`. The server-side guard behind it is not
     decoration — it is what answers a request that did not come from this
     form — and it is the redirect this spec is about.

     The first version uploaded a real file instead. That needs
     SUPABASE_URL and a service key, which CI does not have and a developer's
     machine points at the production bucket, so every local run wrote a file
     into it. Nothing else in this suite touches storage; the seed even
     fabricates a row pointing at an object it never uploads. */
  await page.locator('input[type="file"]').evaluate((el) => el.removeAttribute("required"));
  await page.getByRole("button", { name: /^Upload$/ }).click();

  /* "That file is empty", not "Choose a file first": an unfilled file input
     still submits a File, it is just a zero-byte one, so the guard it trips is
     the size check rather than the one above it. Both leave through the same
     redirect, which is the one this spec is about. */
  await expect(page.getByText(/that file is empty/i)).toBeVisible();
  expect(new URL(page.url()).searchParams.get("search")).toBe("quarterly");
  await expect(page.locator('input[name="search"]')).toHaveValue("quarterly");
});
