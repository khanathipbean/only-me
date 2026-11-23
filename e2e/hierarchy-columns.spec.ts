import { expect, test, type Page } from "@playwright/test";
import { E2E_WIDE_MODULE } from "./support/credentials";

/**
 * The Hierarchy panel's columns.
 *
 * The figures themselves are covered in `tests/dashboard.test.ts` against a
 * real database. What only a browser can answer is the part this panel was
 * rebuilt for: that each level answers the columns it can and leaves the rest
 * alone, that a requirement nothing tests is on screen at all, and that
 * opening a row still works now that the nested lists are a table.
 */

/** Narrows the panel to the fixture's own Module.
 *
 *  Other specs create Modules in this project and leave them behind — there
 *  were 164 of them when this was written — so a test that reaches for "the
 *  first Module" is reaching for whatever ran last. */
async function scopeToFixtureModule(page: Page) {
  /* Module sits behind "Show all filters" with the other narrow ones. */
  await page.getByRole("button", { name: "Show all filters" }).click();
  await page.getByRole("combobox", { name: "Module" }).click();
  await page.getByRole("option", { name: E2E_WIDE_MODULE }).click();
  await expect(rowFor(page, "Module")).toContainText(E2E_WIDE_MODULE);
}

async function openDashboard(page: Page) {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];
  await page.goto(`/projects/${projectId}/dashboard`);
  /* The panel is filled by a fetch, so wait for a row rather than for the
     page: an empty table is what this looks like a moment before it works. */
  await expect(panel(page).getByRole("row").first()).toBeVisible();
  return projectId;
}

/* By the attribute, not by role: the panel's shell is a div carrying
   `aria-label`, which gives no landmark to find it by. Changing that belongs
   to the shell both widgets share, and this change was scoped to Hierarchy. */
const panel = (page: Page) => page.locator('[aria-label="Hierarchy"]');

/** The first row at a given level, found by its badge rather than by the
 *  word anywhere in the row: "Requirements" is a column heading too. */
function rowFor(page: Page, level: string) {
  return panel(page)
    .getByRole("row")
    .filter({ has: page.getByText(level, { exact: true }) })
    .first();
}

/** The first row at that level that has something to open: a Requirement
 *  nothing tests has no twisty, and it may well be the first one. */
function openableRowFor(page: Page, level: string) {
  return panel(page)
    .getByRole("row")
    .filter({ has: page.getByText(level, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "Expand" }) })
    .first();
}

test("every column is there, in the order the design settled on", async ({ page }) => {
  await openDashboard(page);

  const heads = panel(page).getByRole("columnheader");
  await expect(heads).toHaveText([
    "Hierarchy",
    "Requirements",
    "Test Cases",
    "Coverage",
    "Passed",
    "Failed",
    "Not Run",
    "Execution %",
  ]);
});

test("a module says how many requirements it has; the levels below do not", async ({ page }) => {
  await openDashboard(page);

  /* A Scenario has no requirement count of its own, so that cell holds a
     dash. A zero there would be an answer, and the wrong one. */
  const moduleRow = openableRowFor(page, "Module");
  const cells = moduleRow.getByRole("cell");
  await expect(cells.nth(1)).not.toHaveText("—");

  await moduleRow.getByRole("button", { name: "Expand" }).click();
  /* By the level badge, exactly: the header row carries the word
     "Requirements" and would otherwise be the row this finds. */
  const requirementRow = rowFor(page, "Requirement");
  await expect(requirementRow.getByRole("cell").nth(1)).toHaveText("—");
});

test("a requirement says whether anything tests it", async ({ page }) => {
  await openDashboard(page);

  await openableRowFor(page, "Module").getByRole("button", { name: "Expand" }).click();

  const requirementRow = rowFor(page, "Requirement");
  /* The Coverage column carries the answer at this level, where the Module
     above it carries a percentage. */
  await expect(requirementRow.getByRole("cell").nth(3)).toHaveText(/Has Cases|No Cases/);
});

test("a requirement nothing tests is on screen, and can be filtered to", async ({ page }) => {
  await openDashboard(page);

  /* The whole point of the change: the tree is built upward from test cases,
     so a requirement with none used to be absent at every level. */
  const line = panel(page).getByText(/requirements have no test cases|Every requirement here/);
  await expect(line).toBeVisible();

  const noCases = panel(page).getByRole("button", { name: /^No Cases/ });
  await expect(noCases).toBeVisible();
  await noCases.click();
  await expect(noCases).toHaveAttribute("aria-pressed", "true");

  /* Everything left is a requirement with nothing under it — and its module,
     which cannot be anything else once its other requirements are gone. */
  const coverageBadges = panel(page).getByText("No Cases", { exact: true });
  expect(await coverageBadges.count()).toBeGreaterThan(0);
  await expect(panel(page).getByText("Has Cases", { exact: true })).toHaveCount(0);

  /* Pressing it again clears it, so the filter needs no third button. */
  await noCases.click();
  await expect(noCases).toHaveAttribute("aria-pressed", "false");
});

test("opening a row still reaches the case under it", async ({ page }) => {
  await openDashboard(page);

  /* Four twisties deep, which is the navigation the table had to keep: the
     nested lists it replaced were what carried it before. */
  await scopeToFixtureModule(page);

  for (const level of ["Module", "Requirement", "Scenario", "Test Group"]) {
    await openableRowFor(page, level).getByRole("button", { name: "Expand" }).click();
  }

  const caseRow = rowFor(page, "Test Case");
  await expect(caseRow).toBeVisible();

  /* A case answers none of the counting columns: its own result is the whole
     of what it has to say, and it sits in the column that counts it. */
  await expect(caseRow.getByRole("cell").nth(1)).toHaveText("—");
  await expect(caseRow.getByRole("cell").nth(3)).toHaveText("—");

  /* And the preview still opens from the name, which is how this panel has
     always been read. */
  await caseRow.getByRole("button").last().click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("the coverage figure is withheld, not zeroed, under a result filter", async ({ page }) => {
  await openDashboard(page);

  /* A requirement with no cases cannot match a question about results, so
     the figure would read 0 and look like good news. */
  /* Behind "Show all filters", where the dashboard keeps the narrower ones. */
  await page.getByRole("button", { name: "Show all filters" }).click();
  await page.getByRole("combobox", { name: "Test Result" }).click();
  await page.getByRole("option", { name: "Passed", exact: true }).click();

  await expect(
    panel(page).getByText(/set aside while a test-case filter is on/),
  ).toBeVisible();
  await expect(panel(page).getByRole("button", { name: /^No Cases/ })).toHaveCount(0);
});
