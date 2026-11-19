import { expect, test, type Page } from "@playwright/test";

/**
 * The From and To fields on the Audit Trail.
 *
 * They were bare `datetime-local` inputs: a browser's own grey mask,
 * `mm/dd/yyyy --:-- --`, and a calendar button that belongs to the platform
 * rather than to this app. They are dressed now — a calendar mark, a
 * sentence while empty, a chevron where every other control in this app
 * keeps one — without giving up the native control underneath, which is
 * what the tests below are really about: the dressing must not have cost
 * the filtering, the time, or the way back to empty.
 */

async function openAuditTrail(page: Page) {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];
  await page.goto(`/projects/${projectId}/audit-log`);
  return projectId;
}

test("an empty field says what it wants, not how to spell it", async ({ page }) => {
  await openAuditTrail(page);

  await expect(page.getByText("Select start date")).toBeVisible();
  await expect(page.getByText("Select end date")).toBeVisible();

  /* The field's own chevron is there, which is the half of "one calendar
     button, not two" that can be asserted from here: the browser's button
     lives in a shadow tree whose computed style a page script is not given
     — `getComputedStyle(input, "::-webkit-calendar-picker-indicator")`
     reports the default whatever the stylesheet says, so a test written
     against it passes and fails for reasons of its own. The rule that hides
     it is in globals.css, under the one that styles it. */
  await expect(page.getByRole("button", { name: "From: open the calendar" })).toBeVisible();
});

test("choosing a moment filters the log, time and all", async ({ page }) => {
  const projectId = await openAuditTrail(page);

  /* `FilterForm` applies a datetime-local the moment it changes — the field
     is still one, which is the whole point of dressing rather than
     replacing it.

     Retried, because the dev server compiles this page on its first visit
     and a value typed before React has hydrated lands in an input nothing
     is listening to. That is the test harness's problem, not the app's: a
     reader cannot type faster than the page they are looking at. */
  await expect(async () => {
    /* Emptied first, every attempt. React tracks an input's value and
       drops a change event that does not change it, so a retry that types
       the same moment again is a retry that fires nothing — the loop would
       then spin until its timeout however ready the page had become. */
    await page.getByLabel("From", { exact: true }).fill("");
    await page.getByLabel("From", { exact: true }).fill("2026-11-01T14:30");
    await expect(page).toHaveURL(/[?&]from=/, { timeout: 2000 });
  }).toPass({ timeout: 20000 });
  expect(page.url()).toContain(`/projects/${projectId}/audit-log`);
  /* The time survives the round trip. A date-only field would have thrown
     the 14:30 away, and a reader asking "what happened after half two"
     would have got the whole day back. */
  expect(decodeURIComponent(page.url())).toContain("from=2026-11-01T14:30");

  /* With a value in it, the sentence gives way to the value. */
  await expect(page.getByText("Select start date")).toHaveCount(0);
});

test("clearing the filters brings the sentence back", async ({ page }) => {
  await openAuditTrail(page);

  await expect(async () => {
    /* Emptied first, every attempt. React tracks an input's value and
       drops a change event that does not change it, so a retry that types
       the same moment again is a retry that fires nothing — the loop would
       then spin until its timeout however ready the page had become. */
    await page.getByLabel("From", { exact: true }).fill("");
    await page.getByLabel("From", { exact: true }).fill("2026-11-01T14:30");
    await expect(page).toHaveURL(/[?&]from=/, { timeout: 2000 });
  }).toPass({ timeout: 20000 });
  await expect(page.getByText("Select start date")).toHaveCount(0);

  /* "Clear filters" calls `form.reset()`, which puts the value back without
     firing input or change. The field went blank and the sentence never
     came back — the one piece of state this control keeps, quietly wrong. */
  await page.getByRole("button", { name: "Clear filters" }).click();

  await expect(page.getByLabel("From", { exact: true })).toHaveValue("");
  await expect(page.getByText("Select start date")).toBeVisible();
});

test("the calendar can be opened from the chevron", async ({ page }) => {
  await openAuditTrail(page);

  /* Icon-only, so the name is the only thing a screen reader has — and the
     only thing this can find it by. */
  const chevron = page.getByRole("button", { name: "From: open the calendar" });
  await expect(chevron).toBeVisible();

  await chevron.click();
  /* The platform draws the calendar itself, outside the page, so what can
     be checked here is that the field took focus — which is what makes the
     chevron worth having for somebody who never uses a mouse. */
  await expect(page.getByLabel("From", { exact: true })).toBeFocused();
});
