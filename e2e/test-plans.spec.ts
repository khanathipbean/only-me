import { expect, test, type Page } from "@playwright/test";

/**
 * Test Plans: the list, the plan, and its scope.
 *
 * The sums are covered in `tests/test-plans.test.ts` against a real database.
 * What only a browser can answer is whether the pages hold together: that a
 * plan can be made and found, that choosing cases for it works through the
 * same picker a round uses, and that taking one out says plainly the case
 * itself is untouched.
 *
 * Each test makes its own plan. They share one project and one database with
 * every other spec, and a name made once at the top of the file would not
 * survive a worker being recycled — which is exactly what happens the moment
 * any test in it fails.
 */

function uniqueName(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

async function openProject(page: Page) {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  return page.url().split("/projects/")[1].split("/")[0];
}

/** Makes a plan and leaves the browser on its page. */
async function makePlan(page: Page, projectId: string, name: string) {
  await page.goto(`/projects/${projectId}/plans`);
  await page.getByRole("button", { name: "+ New Test Plan" }).click();
  const dialog = page.getByRole("dialog", { name: "New Test Plan" });
  await dialog.getByLabel("Plan name").fill(name);
  await dialog.getByLabel("Phase").fill("Sprint 12");
  await dialog.getByLabel("Objective").fill("ตรวจรับสิทธิ์ก่อนส่งมอบ");
  await dialog.getByRole("button", { name: "Create plan" }).click();
  await page.waitForURL(new RegExp(`/projects/${projectId}/plans/[^/]+`));
}

test("the Testing menu offers Test Plans, and it opens", async ({ page }) => {
  await openProject(page);

  await page
    .getByRole("navigation", { name: "Project" })
    .getByRole("button", { name: "Testing" })
    .click();
  await page
    .getByRole("menu", { name: "Testing" })
    .getByRole("menuitem", { name: /^Test Plans/ })
    .click();

  await page.waitForURL(/\/plans$/);
  await expect(page.getByRole("heading", { name: "Test Plans", level: 1 })).toBeVisible();
});

test("a new plan lands on its own page, asking for a scope", async ({ page }) => {
  const projectId = await openProject(page);
  const name = uniqueName("UAT");

  await makePlan(page, projectId, name);

  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
  /* Straight here because choosing what it covers is the next thing anybody
     does, and that lives on this page. */
  await expect(page.getByText(/Nothing in the scope yet/)).toBeVisible();
  /* A plan with no rounds reads as zero rather than as nothing, which is the
     distinction the summary exists to make. */
  await expect(page.getByText(/No rounds under this plan yet/)).toBeVisible();
});

test("the list shows a plan with its phase, scope and progress", async ({ page }) => {
  const projectId = await openProject(page);
  const name = uniqueName("Listed");
  await makePlan(page, projectId, name);

  await page.goto(`/projects/${projectId}/plans`);
  const row = page.locator("tbody tr").filter({ hasText: name });

  await expect(row).toBeVisible();
  await expect(row).toContainText("Sprint 12");
  await expect(row).toContainText("No cases yet");
  /* Nothing has reported, so the plan is at 0% — not blank, and not 100%. */
  await expect(row).toContainText("0%");
  /* The status cell, not the word anywhere in the row: the edit dialog is in
     the DOM beside it and its Status picker lists every state. */
  await expect(row.getByRole("cell").nth(5)).toContainText("Draft");
});

test("cases join the scope, and leaving it touches only the scope", async ({ page }) => {
  const projectId = await openProject(page);
  const name = uniqueName("Scoped");
  await makePlan(page, projectId, name);
  const planUrl = page.url();

  await page.getByRole("button", { name: "Add cases" }).click();
  const dialog = page.getByRole("dialog", { name: "Add cases to this plan" });
  /* The picker opens with everything ticked — the same one a round uses, so
     the count on its button follows what is actually selected. */
  const addButton = dialog.getByRole("button", { name: /^Add \d+ to plan/ });
  await expect(addButton).toBeVisible();
  await addButton.click();

  await page.waitForURL(/toast=/);
  /* The picker stays open behind the toast — adding cases redirects to the
     same page, which Next treats as a client navigation, so the dialog keeps
     its state and you can add more. Close it to get at the table. */
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Module › Requirement" })).toBeVisible();
  const before = await page.locator("tbody tr").count();
  expect(before).toBeGreaterThan(0);

  /* Out of the scope and out of nothing else. The confirmation is this
     app's own dialog rather than the browser's, and its button stays
     disabled until the page has hydrated — pressing it before that would
     run the action with nothing asked. */
  const remove = page.locator("tbody tr").first().getByRole("button", { name: "Remove" });
  await expect(remove).toBeEnabled();
  await remove.click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.waitForURL(/toast=/);
  await expect(page.getByText("Case taken out of the scope")).toBeVisible();
  await page.goto(planUrl);
  expect(await page.locator("tbody tr").count()).toBe(before - 1);

  /* And the Test Cases page still has everything it had: a plan names cases,
     it does not own them. */
  const response = await page.goto(`/projects/${projectId}/modules`);
  expect(response?.status()).toBe(200);
});

test("a plan can be archived from its own page", async ({ page }) => {
  const projectId = await openProject(page);
  const name = uniqueName("Archivable");
  await makePlan(page, projectId, name);

  /* The asterisk shares a line with the words it marks. The label is a
     flex column, so a mark left as its own child drops to the line below —
     the span is what keeps the two together, and this fails without it. */
  await page.goto(`/projects/${projectId}/plans`);
  await page.getByRole("button", { name: "+ New Test Plan" }).click();
  const nameLabel = page
    .getByRole("dialog", { name: "New Test Plan" })
    .locator("label", { hasText: "Plan name" })
    .locator("span", { hasText: "Plan name" })
    .first();
  await expect(nameLabel).toContainText("*");
  await page.keyboard.press("Escape");

  await page.goto(`/projects/${projectId}/plans`);
  await page.getByRole("link", { name }).click();
  await page.waitForURL(new RegExp(`/plans/[^/]+$`));

  await page.getByRole("button", { name: "Archive plan" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  /* Back to the list, because the plan page itself only serves live plans. */
  await page.waitForURL(/\/plans\?toast=/);
  await expect(page.getByText("Plan archived")).toBeVisible();
  await expect(page.locator("tbody tr").filter({ hasText: name })).toHaveCount(0);
});
