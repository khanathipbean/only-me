import { expect, test } from "@playwright/test";
import { E2E_HANDOFF_CASE, E2E_HANDOFF_RUN } from "./support/credentials";

/**
 * Handing a failed case to somebody, from the round where it failed.
 *
 * The control saves on the change — no Save button beside it — which is the
 * part no unit test can reach: the service function is covered in
 * `tests/work.test.ts`, and what this adds is that the Select, the server
 * action it submits to and the row it redraws are actually joined up.
 *
 * It also checks the name survives a reload. An earlier version of this
 * column rendered the assignee from the control's own state, so it read
 * correctly until the page was opened again — which is exactly the shape of
 * bug that only a browser finds.
 */
/**
 * Puts the row back to Unassigned before the test starts rather than after it
 * finishes.
 *
 * Tidying up at the end only runs when the test got there. One of these
 * timed out once, left the case assigned, and every run after it failed on
 * the first line for a different reason than the one that broke it — a test
 * that poisons its own fixture reports the wrong fault forever.
 */
async function clearAssignee(page: import("@playwright/test").Page) {
  const picker = page
    .getByRole("row", { name: new RegExp(E2E_HANDOFF_CASE) })
    .getByRole("combobox", { name: `Assign ${E2E_HANDOFF_CASE}` });
  if ((await picker.textContent())?.includes("Unassigned")) {
    return;
  }
  await picker.click();
  await page.getByRole("option", { name: "Unassigned" }).click();
  /* Wait for the page to settle before anything else is pressed. A second
     action fired while the first redirect is still in flight is cancelled,
     which this spec found the hard way: the row read Unassigned, the next
     press was swallowed, and the failure pointed at the press rather than at
     the one before it.
     The toast is the signal, and it is waited for in both directions. A
     check for the parameter being absent from the URL is not a wait at all —
     it is already absent at the moment of the press, so it passes
     immediately and changes nothing. */
  await expect(page.getByRole("status")).toContainText(/Unassigned/);
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(picker).toHaveText(/Unassigned/);
}

async function openHandoffRun(page: import("@playwright/test").Page) {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  await page
    .getByRole("navigation", { name: "Project" })
    .getByRole("link", { name: "Test Runs" })
    .click();
  await page.waitForURL(/\/runs$/);
  await page.getByRole("link", { name: E2E_HANDOFF_RUN }).click();
  await page.waitForURL(/\/runs\/[^/]+$/);
}

test("a case can be handed to somebody from the round it failed in", async ({ page }) => {
  await openHandoffRun(page);
  await clearAssignee(page);

  const row = page.getByRole("row", { name: new RegExp(E2E_HANDOFF_CASE) });
  const picker = row.getByRole("combobox", { name: `Assign ${E2E_HANDOFF_CASE}` });

  await expect(picker).toHaveText(/Unassigned/);

  await picker.click();
  await page.getByRole("option", { name: "E2E Dev" }).click();

  /* The row is server-rendered again after the action, so this is the stored
     value and not the click. */
  await expect(
    page
      .getByRole("row", { name: new RegExp(E2E_HANDOFF_CASE) })
      .getByRole("combobox", { name: `Assign ${E2E_HANDOFF_CASE}` }),
  ).toHaveText(/E2E Dev/);

  await page.reload();
  await expect(
    page
      .getByRole("row", { name: new RegExp(E2E_HANDOFF_CASE) })
      .getByRole("combobox", { name: `Assign ${E2E_HANDOFF_CASE}` }),
  ).toHaveText(/E2E Dev/);

  // Put it back, so the next run starts where this one did.
  await page
    .getByRole("row", { name: new RegExp(E2E_HANDOFF_CASE) })
    .getByRole("combobox", { name: `Assign ${E2E_HANDOFF_CASE}` })
    .click();
  await page.getByRole("option", { name: "Unassigned" }).click();
  await expect(
    page
      .getByRole("row", { name: new RegExp(E2E_HANDOFF_CASE) })
      .getByRole("combobox", { name: `Assign ${E2E_HANDOFF_CASE}` }),
  ).toHaveText(/Unassigned/);
});

test("a whole selection can be handed over at once", async ({ page }) => {
  await openHandoffRun(page);
  await clearAssignee(page);

  await page.getByRole("button", { name: "Select cases" }).click();
  await page.getByRole("checkbox", { name: `Select ${E2E_HANDOFF_CASE}` }).check();

  const panel = page.getByRole("combobox", {
    name: "Who to assign the selected cases to",
  });
  await panel.click();
  await page.getByRole("option", { name: "E2E Dev" }).click();
  await page.getByRole("button", { name: "Assign" }).click();

  await expect(
    page
      .getByRole("row", { name: new RegExp(E2E_HANDOFF_CASE) })
      .getByRole("combobox", { name: `Assign ${E2E_HANDOFF_CASE}` }),
  ).toHaveText(/E2E Dev/);

  await page
    .getByRole("row", { name: new RegExp(E2E_HANDOFF_CASE) })
    .getByRole("combobox", { name: `Assign ${E2E_HANDOFF_CASE}` })
    .click();
  await page.getByRole("option", { name: "Unassigned" }).click();
  await expect(
    page
      .getByRole("row", { name: new RegExp(E2E_HANDOFF_CASE) })
      .getByRole("combobox", { name: `Assign ${E2E_HANDOFF_CASE}` }),
  ).toHaveText(/Unassigned/);
});
