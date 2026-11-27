import { expect, test, type Page } from "@playwright/test";

/**
 * The drawing beside each menu's list.
 *
 * What this covers is the part the figures themselves cannot prove: that the
 * pane is drawn at all, that it follows the pointer and the keyboard down the
 * list, that it is on screen rather than hanging off the right of a window
 * twice as narrow as the panel is wide, that nothing is fetched until a menu
 * is actually opened, and that the menu is still a working list of links when
 * the fetch never answers. The sums behind it are covered in
 * `tests/menu-preview.test.ts`, against a real database.
 */

const PREVIEW_ROUTE = /\/api\/projects\/[^/]+\/menu-preview/;

async function openFixture(page: Page) {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  return page.url().split("/projects/")[1].split("/")[0];
}

const projectNav = (page: Page) => page.getByRole("navigation", { name: "Project" });
const pane = (page: Page) => page.getByTestId("nav-menu-preview");

/** Opens a menu and waits for the figures, so an assertion about what is
 *  drawn is never racing the fetch. */
async function openMenu(page: Page, entry: string) {
  await projectNav(page).getByRole("button", { name: entry }).click();
  await expect(pane(page)).toBeVisible();
  await expect(page.getByTestId("menu-preview-skeleton")).toHaveCount(0);
}

test("the menu opens with a drawing beside its list", async ({ page }) => {
  await openFixture(page);
  await openMenu(page, "Overview");

  /* Summary is where the Overview menu lands, since that is the page the
     reader is on. */
  await expect(pane(page).getByText("What this project is made of")).toBeVisible();
});

test("the drawing follows the pointer down the list", async ({ page }) => {
  await openFixture(page);
  await openMenu(page, "Overview");

  const menu = page.getByRole("menu", { name: "Overview" });

  await menu.getByRole("menuitem", { name: /^Dashboard/ }).hover();
  await expect(pane(page).getByText("Run so far")).toBeVisible();
  await expect(pane(page).getByText("What this project is made of")).toHaveCount(0);

  await menu.getByRole("menuitem", { name: /^Problem Cases/ }).hover();
  await expect(pane(page).getByText(/want a second look|Nothing needs a second look/)).toBeVisible();

  await menu.getByRole("menuitem", { name: /^Audit Trail/ }).hover();
  await expect(pane(page).getByText(/Last seven days|Nothing recorded yet/)).toBeVisible();
});

test("the keyboard moves it too, not only the pointer", async ({ page }) => {
  await openFixture(page);

  /* Arrowing down a menu has to change what is drawn exactly as moving the
     mouse down it does, or the pane is a thing only a pointer can reach —
     which is the whole bug the menus themselves were written to avoid. */
  const trigger = projectNav(page).getByRole("button", { name: "Overview" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("menu-preview-skeleton")).toHaveCount(0);

  await expect(pane(page).getByText("What this project is made of")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await expect(pane(page).getByText("Run so far")).toBeVisible();
});

test("the figure in the ring sits upright", async ({ page }) => {
  await openFixture(page);
  await openMenu(page, "Overview");
  await page
    .getByRole("menu", { name: "Overview" })
    .getByRole("menuitem", { name: /^Dashboard/ })
    .hover();

  /* It came out lying on its side: the rotation that starts the first arc
     at twelve o'clock is on a group, and a group's transform turns
     everything inside it — the figure in the middle included. What catches
     that is where the text sits in the drawing, not whether it is there. */
  const rotated = await pane(page)
    .locator("svg text")
    .first()
    .evaluate((node) => Boolean(node.closest("g")));
  expect(rotated, "the percentage is inside the rotated group").toBe(false);
});

test("the Resources menu draws its own three", async ({ page }) => {
  await openFixture(page);
  await openMenu(page, "Resources");

  const menu = page.getByRole("menu", { name: "Resources" });

  await menu.getByRole("menuitem", { name: /^Notes/ }).hover();
  await expect(pane(page).getByText(/newest first|No notes yet/)).toBeVisible();

  await menu.getByRole("menuitem", { name: /^Files/ }).hover();
  await expect(pane(page).getByText(/file(s)? ·|No files yet/)).toBeVisible();

  await menu.getByRole("menuitem", { name: /^Links/ }).hover();
  await expect(pane(page).getByText(/link(s)?$|No links yet/)).toBeVisible();
});

test("every pane reaches the foot of the panel", async ({ page }) => {
  await openFixture(page);

  /* The complaint this answers: a pane is as tall as the list beside it
     however much it has to say, so the short ones left an inch of nothing
     under the drawing and read as a panel that had failed to finish
     loading. The line at the foot is what closes it, and only a
     measurement can say it is really at the foot. */
  for (const [entry, items] of [
    ["Overview", ["Summary", "Dashboard", "Problem Cases", "Audit Trail"]],
    ["Testing", ["Test Cases", "Test Plans", "Test Runs"]],
    ["Resources", ["Notes", "Files", "Links"]],
  ] as const) {
    await openMenu(page, entry);
    const panel = page.getByRole("menu", { name: entry });

    for (const item of items) {
      await panel.getByRole("menuitem", { name: new RegExp(`^${item}`) }).hover();

      const foot = pane(page).getByText(`Open ${item} →`);
      await expect(foot, `${item} has no line at the foot`).toBeVisible();

      const panelBox = (await panel.boundingBox())!;
      const footBox = (await foot.boundingBox())!;
      const gap = panelBox.y + panelBox.height - (footBox.y + footBox.height);
      expect(gap, `${item} leaves ${Math.round(gap)}px of empty panel below it`).toBeLessThan(28);
    }

    await page.keyboard.press("Escape");
  }
});

test("the panes carry the figures a reader opens the page for", async ({ page }) => {
  await openFixture(page);
  await openMenu(page, "Overview");
  const menu = page.getByRole("menu", { name: "Overview" });

  /* The ring above is the project's whole life; this is the sitting
     somebody is in, which is usually why the Dashboard is opened. */
  await menu.getByRole("menuitem", { name: /^Dashboard/ }).hover();
  await expect(pane(page).getByText(/\d+ of \d+/)).toBeVisible();

  /* And the cases themselves, not only how many of them there are. */
  await menu.getByRole("menuitem", { name: /^Problem Cases/ }).hover();
  /* Two of them are named, so this takes the first rather than asserting
     on a locator that matches both. */
  await expect(pane(page).getByText(/\d+ fails?$/).first()).toBeVisible();
});

test("nothing is fetched until a menu is opened, and then only once", async ({ page }) => {
  const asked: string[] = [];
  page.on("request", (request) => {
    if (PREVIEW_ROUTE.test(request.url())) {
      asked.push(request.url());
    }
  });

  await openFixture(page);
  /* A reader who never opens a menu pays nothing: seven queries on every
     page in the project is what rendering this into the layout would have
     cost. */
  expect(asked, "the figures were fetched before any menu was opened").toHaveLength(0);

  await openMenu(page, "Overview");
  expect(asked).toHaveLength(1);

  /* The second menu is drawn from the answer the first one already has. */
  await page.keyboard.press("Escape");
  await openMenu(page, "Resources");
  expect(asked, "the second menu fetched the same thing again").toHaveLength(1);
});

test("the menu still works when the figures never arrive", async ({ page }) => {
  await page.route(PREVIEW_ROUTE, (route) => route.abort());
  const projectId = await openFixture(page);

  await projectNav(page).getByRole("button", { name: "Overview" }).click();

  /* The shape of what was coming stays, and nothing apologises: the menu
     beside it is a working list of links either way, and an error about a
     drawing nobody asked for would be louder than the drawing. */
  await expect(page.getByTestId("menu-preview-skeleton")).toBeVisible();
  await expect(page.getByText(/error|failed|try again/i)).toHaveCount(0);

  await page
    .getByRole("menu", { name: "Overview" })
    .getByRole("menuitem", { name: /^Dashboard/ })
    .click();
  await page.waitForURL(/\/dashboard$/);
  expect(page.url()).toContain(`/projects/${projectId}/dashboard`);
});

test("the panel stays on screen even where it is widest", async ({ page }) => {
  /* Resources is the last entry in the bar, and the panel hangs from its
     left edge. Twice as wide as it used to be, it is far enough over to run
     off the right of the window — which a measurement catches and a
     "is it visible" assertion does not. */
  await page.setViewportSize({ width: 800, height: 720 });
  await openFixture(page);
  await openMenu(page, "Resources");

  const box = await page.getByRole("menu", { name: "Resources" }).boundingBox();
  expect(box, "the panel has no box at all").not.toBeNull();
  expect(box!.x, "the panel runs off the left").toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, "the panel runs off the right").toBeLessThanOrEqual(800);

  /* And the pane is drawn at its full width, not squeezed: at anything
     narrower the Dashboard's legend truncates the words it is there to
     say. */
  const paneBox = await pane(page).boundingBox();
  expect(paneBox!.width).toBeGreaterThanOrEqual(384);
});
