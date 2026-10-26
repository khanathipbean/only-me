import { expect, test } from "@playwright/test";
import {
  E2E_ASSIGNED_CASE,
  E2E_FINISHED_CASE,
  E2E_HANDOFF_CASE,
  E2E_HANDOFF_RUN,
} from "./support/credentials";

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

/**
 * The page opens on the end of the hand-off the reader is standing at.
 *
 * This runs as the suite's admin — somebody who hands work out rather than
 * does it — so "my work" means the cases they pushed and are waiting on. A
 * Dev gets the other default; `dev-role.spec` checks that end.
 */
test("opens on what the reader handed out, for somebody who hands work out", async ({
  page,
}) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  await page.goto(`/projects/${projectId}/my-work`);
  await expect(
    page.getByRole("combobox", { name: "Whose repairs to show" }),
  ).toHaveText(/Handed out by me/);

  // And it is their own hand-offs on it: the seed made these two.
  await expect(page.getByRole("link", { name: E2E_ASSIGNED_CASE })).toBeVisible();
});

/**
 * Who the repairs are with, on the page that is about them.
 *
 * This lived on the Dashboard, where it counted every case carrying an
 * assignee — including ones whose repair finished weeks ago, because closing
 * a loop keeps the name — and drew "Unassigned" as a bar running the width of
 * the panel beside slivers for the actual people.
 */
test("says who the repairs are with, and counts only live ones", async ({ page }) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  /* The admin's own default: the cases they handed out. */
  await page.goto(`/projects/${projectId}/my-work`);
  const strip = page.getByRole("group", { name: "By Assignee" });
  await expect(strip).toBeVisible();
  await expect(strip.getByText("E2E Dev")).toBeVisible();

  /* Nobody is not a person and does not appear. The finished case is not a
     live repair and is not counted — the number beside the name is what the
     list underneath actually holds. */
  await expect(strip.getByText(/unassigned/i)).toHaveCount(0);

  /* Pressing a name narrows the list to that person, and the strip keeps
     everybody so the way back is still on screen. */
  await strip.getByRole("link", { name: /E2E Dev/ }).click();
  await page.waitForURL(/person=/);
  await expect(page.getByRole("link", { name: "Everyone" })).toBeVisible();
  await page.getByRole("link", { name: "Everyone" }).click();
  await expect(page).not.toHaveURL(/person=/);

  // And it stays out of the way on the reading where every row is yours.
  await page.goto(`/projects/${projectId}/my-work?who=me`);
  await expect(page.getByRole("group", { name: "By Assignee" })).toHaveCount(0);
});

test("counts the tab it is sitting above", async ({ page }) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  /* The strip said "6 in hand" over a table of three finished cases — one
     screen describing two different populations. */
  await page.goto(`/projects/${projectId}/my-work?who=handed-out`);
  await expect(page.getByRole("group", { name: "By Assignee" })).toContainText("in hand");

  await page.goto(`/projects/${projectId}/my-work?who=handed-out&tab=finished`);
  await expect(page.getByRole("group", { name: "By Assignee" })).toContainText("finished");
});

/**
 * The chain under a case name gives up room when there is none, and takes it
 * back when there is.
 *
 * Measured rather than eyeballed: a clipped line and a full one look the same
 * in a class list, and the failure this guards against — the chain taking the
 * width it wanted and pushing the other three columns off the side — showed
 * up as a horizontal scrollbar nobody noticed until the columns were missed.
 */
test("gives the chain the room there is, and no more", async ({ page }) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  async function measure(width: number) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/projects/${projectId}/my-work?who=handed-out&tab=finished`);
    const chain = page
      .getByRole("row", { name: new RegExp(E2E_FINISHED_CASE) })
      .locator("p")
      .first();
    return chain.evaluate((el) => el.scrollWidth > el.clientWidth);
  }

  // Narrow: cut, with an ellipsis, so the row still fits.
  expect(await measure(900)).toBe(true);
  await expect(page.getByRole("columnheader", { name: "Closed by" })).toBeInViewport();

  // Wide: there is room, so nothing is cut.
  expect(await measure(1800)).toBe(false);
  await expect(page.getByRole("columnheader", { name: "Closed by" })).toBeInViewport();
});

/**
 * A round's own buttons stay where the reader looks for them.
 *
 * The header puts the title and its line of badges, counts and Module names
 * on the left and the actions on the right. Left to wrap at any width, the
 * left block takes whatever room its content asks for — so a round drawing on
 * two Modules with real names pushed Export, Add and Close onto a row of
 * their own on a laptop screen.
 */
test("keeps a round's actions on the title's row on a desk-sized screen", async ({
  page,
}) => {
  await openHandoffRun(page);

  for (const width of [1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const title = await page.getByRole("heading", { level: 1 }).boundingBox();
    const action = await page.getByRole("link", { name: "Export results" }).boundingBox();
    expect(
      action!.y,
      `actions dropped below the title at ${width}px`,
    ).toBeLessThan(title!.y + title!.height);
  }

  /* And the line that caused it is capped rather than shortened: the Module
     names are what somebody wanted, so they stay — on hover when they do not
     fit. */
  const reach = page.locator("[title*='Requirement']").first();
  await expect(reach).toHaveAttribute("title", /Modules?/);
});

/**
 * The view switch sits in the same place on every page that has one.
 *
 * It started in the header's right-hand slot on My Work, which is where the
 * actions live — and changing which view you are looking at is navigation,
 * not an action. The Users page had it right: its own row under the title,
 * whatever belongs to the open view on the right of that row.
 */
test("puts the view switch where the Users page puts it", async ({ page }) => {
  async function tabRow(url: string, label: string) {
    await page.goto(url);
    const heading = await page.getByRole("heading", { level: 1 }).boundingBox();
    const tabs = await page.getByRole("navigation", { name: label }).boundingBox();
    return { below: tabs!.y > heading!.y + heading!.height, left: Math.round(tabs!.x) };
  }

  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  const mine = await tabRow(`/projects/${projectId}/my-work`, "My Work view");
  const users = await tabRow("/settings/members", "Users view");

  expect(mine.below, "My Work's tabs should sit under the title").toBe(true);
  expect(users.below).toBe(true);
  // And starting at the same edge, so the eye finds them in the same place.
  expect(mine.left).toBe(users.left);
});
