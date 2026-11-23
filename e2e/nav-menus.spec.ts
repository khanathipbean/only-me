import { expect, test } from "@playwright/test";

/**
 * The views of Overview and Resources, reached from the menu bar.
 *
 * They were a row of pills on each of the eight pages below. What this
 * covers is the part that cannot be had for free now they are not: a menu
 * has to open, say that it is open, be reachable without a pointer, and
 * close again. A pill row got all of that by being plain links.
 */

async function openFixture(page: import("@playwright/test").Page) {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  return page.url().split("/projects/")[1].split("/")[0];
}

const projectNav = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Project" });

test("each menu opens, lists its views, and reaches them", async ({ page }) => {
  await openFixture(page);

  for (const [entry, items] of [
    ["Overview", ["Summary", "Dashboard", "Problem Cases", "Audit Trail"]],
    ["Testing", ["Test Cases", "Test Runs"]],
    ["Resources", ["Notes", "Files", "Links"]],
  ] as const) {
    const trigger = projectNav(page).getByRole("button", { name: entry });
    /* Shut to begin with, and saying so. `aria-expanded` is the only thing
       a screen reader has to go on. */
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    const menu = page.getByRole("menu", { name: entry });
    for (const item of items) {
      await expect(menu.getByRole("menuitem", { name: new RegExp(`^${item}`) })).toBeVisible();
    }
    /* Exactly these, so a view quietly dropped from the menu is a failure
       rather than something nobody notices. */
    await expect(menu.getByRole("menuitem")).toHaveCount(items.length);

    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  }
});

test("Testing keeps the two addresses it took over", async ({ page }) => {
  const projectId = await openFixture(page);

  /* The entry is new; the pages are not. Anything anyone has bookmarked or
     pasted into a chat still has to land, which is the whole reason the
     merge touched the menu and nothing else. */
  for (const [item, path] of [
    ["Test Cases", "modules"],
    ["Test Runs", "runs"],
  ] as const) {
    await projectNav(page).getByRole("button", { name: "Testing" }).click();
    await page
      .getByRole("menu", { name: "Testing" })
      .getByRole("menuitem", { name: new RegExp(`^${item}`) })
      .click();
    await page.waitForURL(new RegExp(`/projects/${projectId}/${path}$`));

    /* And the entry stays lit on the page it opened, so a reader two levels
       in can still see which part of the app they are in. */
    await expect(projectNav(page).getByRole("button", { name: "Testing" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  }
});

test("the All view is off the Resources menu, and its page still answers", async ({ page }) => {
  const projectId = await openFixture(page);

  await projectNav(page).getByRole("button", { name: "Resources" }).click();
  await expect(
    page.getByRole("menu", { name: "Resources" }).getByRole("menuitem", { name: /^All/ }),
  ).toHaveCount(0);

  /* Hidden, not deleted: the address still works, so putting it back is one
     entry in the menu rather than a page to write again. */
  const response = await page.goto(`/projects/${projectId}/resources`);
  expect(response?.status()).toBe(200);
});

test("a menu can be opened and walked without a pointer", async ({ page }) => {
  await openFixture(page);

  /* The whole reason this is a button and not a hover target: on a touch
     screen there is no hover at all, and for a keyboard there is none
     either. Enter opens it and puts focus on the first view. */
  const trigger = projectNav(page).getByRole("button", { name: "Overview" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  const menu = page.getByRole("menu", { name: "Overview" });
  await expect(menu.getByRole("menuitem", { name: /^Summary/ })).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: /^Dashboard/ })).toBeFocused();
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitem", { name: /^Audit Trail/ })).toBeFocused();
  await page.keyboard.press("Home");
  await expect(menu.getByRole("menuitem", { name: /^Summary/ })).toBeFocused();

  /* Escape closes it and hands focus back, or the reader is left standing
     on something that no longer exists. */
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

test("choosing a view goes there, and the entry stays lit", async ({ page }) => {
  const projectId = await openFixture(page);

  await projectNav(page).getByRole("button", { name: "Overview" }).click();
  await page
    .getByRole("menu", { name: "Overview" })
    .getByRole("menuitem", { name: /^Problem Cases/ })
    .click();
  await page.waitForURL(/\/problem-cases$/);

  /* The menu shuts behind the choice rather than hanging over the page it
     just opened. */
  await expect(page.getByRole("menu", { name: "Overview" })).toHaveCount(0);

  /* And the bar still says which part of the app this is. Two levels down
     with nothing lit is how a reader loses their place — and it has to say
     so in something other than a colour. */
  const trigger = projectNav(page).getByRole("button", { name: "Overview" });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toHaveAttribute("aria-current", "true");
  /* The entries it does not belong to stay unlit. */
  await expect(projectNav(page).getByRole("button", { name: "Resources" })).not.toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Problem Cases", level: 1 })).toBeVisible();
  expect(page.url()).toContain(`/projects/${projectId}/problem-cases`);
});

test("no page carries a switcher any more", async ({ page }) => {
  const projectId = await openFixture(page);

  /* The row that used to sit above every one of these titles. Its absence
     is the visible half of this change, and the reason it was asked for:
     on a project with nothing in it, four pills pointed at four empty
     pages. */
  for (const path of [
    `/projects/${projectId}`,
    `/projects/${projectId}/dashboard`,
    `/projects/${projectId}/problem-cases`,
    `/projects/${projectId}/audit-log`,
    `/projects/${projectId}/resources/notes`,
    `/projects/${projectId}/resources/files`,
    `/projects/${projectId}/resources/links`,
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("navigation", { name: /view$/ }),
      `a switcher is still on ${path}`,
    ).toHaveCount(0);
  }
});

test("the open menu is actually on screen, not clipped by the bar", async ({ page }) => {
  /* It opened and could not be seen: the tab bar scrolls sideways on a
     narrow screen, so it clips what overflows it, and the panel hangs below
     the bar. Every assertion about the menu still passed — Playwright finds
     an element a container has clipped — which is why this measures the box
     instead of asking whether the element is there.

     The panel is drawn through a portal now, and this is what would catch
     it being put back inside the bar. */
  await openFixture(page);

  const trigger = projectNav(page).getByRole("button", { name: "Overview" });
  await trigger.click();

  const triggerBox = await trigger.boundingBox();
  const panel = page.getByRole("menu", { name: "Overview" });
  const panelBox = await panel.boundingBox();

  expect(panelBox, "the panel has no box at all").not.toBeNull();
  /* Below the trigger and of a real size — a clipped panel reports a height
     of nothing, or sits off the top of the page. */
  expect(panelBox!.height, "the panel is flattened").toBeGreaterThan(100);
  expect(panelBox!.y, "the panel is not below its trigger").toBeGreaterThanOrEqual(
    triggerBox!.y,
  );

  /* And inside the window, which is the part a clipping parent breaks. */
  const viewport = page.viewportSize()!;
  expect(panelBox!.y + panelBox!.height, "the panel runs off the bottom").toBeLessThanOrEqual(
    viewport.height,
  );
  expect(panelBox!.x, "the panel runs off the left").toBeGreaterThanOrEqual(0);

  /* The last item has to be clickable, not merely present: the bug hid the
     whole panel while leaving every item findable. */
  await expect(panel.getByRole("menuitem", { name: /^Audit Trail/ })).toBeInViewport();
});
