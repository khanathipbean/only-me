import { expect, test } from "@playwright/test";
import { MISSING_FILE_NAME } from "./support/credentials";

/**
 * A file row whose bytes are gone from storage. The download route already
 * answered 410 and said why, but nothing in the browser read it: the preview
 * frame rendered that JSON as the document, and the Download button handed the
 * same JSON to the browser as a page.
 *
 * The app has seven files in this state, from two changes to the storage key
 * layout that old rows were never migrated through. Nothing brings those bytes
 * back — what this covers is that the app says so instead of showing a broken
 * frame.
 */
test("a file whose object is gone says so, and offers no download", async ({ page }) => {
  // Filtered rather than hunted for: the list is paged, and every run that
  // creates a project of its own pushes the fixture further down it.
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);

  await page.getByRole("link", { name: "Files" }).click();
  await page.waitForURL(/\/files/);

  // The card, not the Remove button that also carries the filename.
  await page
    .getByRole("button", { name: new RegExp(`^${MISSING_FILE_NAME}`) })
    .click();

  // Scoped to the dialog: Next's own route announcer is also role="alert".
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText(/no longer in storage/i);
  await expect(dialog.getByRole("link", { name: "Download" })).toHaveCount(0);
  // The preview frame must not be showing the error response as a document.
  await expect(dialog.locator("iframe")).toHaveCount(0);
});
