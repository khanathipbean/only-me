import { expect, test } from "@playwright/test";

/**
 * Resources: the Links list that now sits beside Notes.
 *
 * Two things here are worth a browser rather than a unit test. The first is
 * that the switcher actually goes somewhere — it is drawn as a tab control
 * but built out of links, and a tab that looks selected while showing the
 * other list is the kind of thing only a real click finds.
 *
 * The second is the refusal. `tests/links-url.test.ts` covers the guard as a
 * function; this covers it as a feature: a `javascript:` address typed into
 * the real form, posted to the real action, has to come back refused and
 * leave nothing behind. The browser will not stop it on the way — such an
 * address is a valid `type="url"` value — so if the server ever stopped
 * checking, everything in front of it would still look fine.
 */

const suffix = () => Date.now().toString().slice(-6);

async function openResources(page: import("@playwright/test").Page) {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];
  /* Inside the project's own tab bar: "Resources" is also a breadcrumb
     segment on these pages, and a plain query matched both. */
  await page
    .getByRole("navigation", { name: "Project" })
    .getByRole("link", { name: "Resources" })
    .click();
  await page.waitForURL(/\/resources$/);
  return projectId;
}

test("the switcher reaches all four views, and the nav offers neither alone", async ({
  page,
}) => {
  await openResources(page);

  /* The user-visible half of this change: one tab called Resources, and
     neither of the two it swallowed still sitting beside it. */
  const projectNav = page.getByRole("navigation", { name: "Project" });
  await expect(projectNav.getByRole("link", { name: "Resources" })).toBeVisible();
  await expect(projectNav.getByRole("link", { name: "Notes", exact: true })).toHaveCount(0);
  await expect(projectNav.getByRole("link", { name: "Files", exact: true })).toHaveCount(0);

  const views = () => page.getByRole("navigation", { name: "Resources view" });
  // All is the view the tab opens on, and says so rather than merely looking
  // lit: `aria-current` is what a screen reader has to go on.
  await expect(views().getByRole("link", { name: "All" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  /* Each pill in turn, checking the address it reached and that the pill
     there knows it is the open one. A tab that looks selected while showing
     another list is the thing only a real click finds. */
  for (const [label, path] of [
    ["Notes", "/resources/notes"],
    ["Files", "/resources/files"],
    ["Links", "/resources/links"],
  ]) {
    await views().getByRole("link", { name: label }).click();
    await page.waitForURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
    await expect(views().getByRole("link", { name: label })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }

  // And back to All, so the set is a switcher rather than a one-way door.
  await views().getByRole("link", { name: "All" }).click();
  await page.waitForURL(/\/resources$/);
});

test("All lists notes, files and links together", async ({ page }) => {
  const projectId = await openResources(page);

  const mark = suffix();
  await page.goto(`/projects/${projectId}/resources/links`);
  await page.getByRole("button", { name: "+ New Link" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("https://").fill(`https://example.com/${mark}`);
  await dialog.getByPlaceholder("e.g. Jira epic for Policy Center").fill(`Link ${mark}`);
  await dialog.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto(`/projects/${projectId}/resources/notes`);
  await page.getByRole("button", { name: "+ New Note" }).click();
  const noteDialog = page.getByRole("dialog");
  await noteDialog.getByPlaceholder("e.g. Sprint 6 planning").fill(`Note ${mark}`);
  await noteDialog.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  /* Both kinds in one list, found by the one search box — which is the whole
     claim the All view makes. The fixture's files are already there, and the
     kind labels beside the rows are what tells them apart in words rather
     than by colour alone. */
  await page.goto(`/projects/${projectId}/resources?search=${mark}`);
  await expect(page.getByRole("link", { name: new RegExp(`Note ${mark}`) })).toHaveCount(1);
  await expect(page.getByRole("link", { name: new RegExp(`Link ${mark}`) })).toHaveCount(1);
  await expect(page.getByText("NOTE", { exact: true })).toHaveCount(1);
  await expect(page.getByText("LINK", { exact: true })).toHaveCount(1);

  /* The link row still leaves the app safely, even here where it sits beside
     rows that do not. */
  const linkRow = page.getByRole("link", { name: new RegExp(`Link ${mark}`) });
  await expect(linkRow).toHaveAttribute("href", `https://example.com/${mark}`);
  expect((await linkRow.getAttribute("rel")) ?? "").toContain("noopener");
});

test("a link is stored and drawn as something safe to click", async ({ page }) => {
  const projectId = await openResources(page);
  await page.goto(`/projects/${projectId}/resources/links`);

  const mark = suffix();
  const title = `Jira epic ${mark}`;
  const address = `https://maholan.atlassian.net/browse/PROM-${mark}`;

  await page.getByRole("button", { name: "+ New Link" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("https://").fill(address);
  await dialog.getByPlaceholder("e.g. Jira epic for Policy Center").fill(title);
  await dialog.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  /* Filtered through the URL rather than hoping it landed on page one: the
     fixture project keeps whatever every earlier run left behind. */
  await page.goto(`/projects/${projectId}/resources/links?search=${mark}`);
  const link = page.getByRole("link", { name: new RegExp(title) });
  await expect(link).toHaveAttribute("href", address);

  /* The two attributes that make this safe to click. Without `noopener` the
     page opened can reach back through `window.opener` and navigate the tab
     it came from — which is this app, with this reader signed in. */
  await expect(link).toHaveAttribute("target", "_blank");
  const rel = (await link.getAttribute("rel")) ?? "";
  expect(rel, "the outward link's rel").toContain("noopener");
  expect(rel, "the outward link's rel").toContain("noreferrer");
});

test("a javascript: address is refused, and nothing is stored", async ({ page }) => {
  const projectId = await openResources(page);
  await page.goto(`/projects/${projectId}/resources/links`);

  const mark = suffix();
  const title = `Refused ${mark}`;

  await page.getByRole("button", { name: "+ New Link" }).click();
  const dialog = page.getByRole("dialog");
  /* A valid `type="url"` value, so the browser submits it happily. The whole
     point: the only thing standing between this and an href on this app's
     own origin is the server. */
  await dialog.getByPlaceholder("https://").fill("javascript:alert(document.cookie)");
  await dialog.getByPlaceholder("e.g. Jira epic for Policy Center").fill(title);
  await dialog.getByRole("button", { name: "Add link" }).click();

  // Said out loud, where the person who typed it is looking.
  await expect(page.getByRole("alert").first()).toContainText(/http/i);

  /* And the list is the real check — a message on screen proves what was
     drawn, not what was written. */
  await page.goto(`/projects/${projectId}/resources/links?search=${mark}`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
});

test("archiving takes a link out of the list and the archived view finds it", async ({ page }) => {
  const projectId = await openResources(page);
  await page.goto(`/projects/${projectId}/resources/links`);

  const mark = suffix();
  const title = `Sheet ${mark}`;

  await page.getByRole("button", { name: "+ New Link" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByPlaceholder("https://").fill(`https://docs.google.com/spreadsheets/${mark}`);
  await dialog.getByPlaceholder("e.g. Jira epic for Policy Center").fill(title);
  await dialog.getByRole("button", { name: "Add link" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto(`/projects/${projectId}/resources/links?search=${mark}`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(1);

  /* One button, not a menu: `RowActions` only grows a menu when the row has
     a page of its own, and a link has none — so the trigger edits directly. */
  await page.getByRole("button", { name: `Edit ${title}` }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  /* Archiving asks first — `ConfirmForm`'s own styled dialog, not the
     browser's `window.confirm`, so there is a Confirm button to press rather
     than a native prompt to accept. */
  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Confirm" }).click();

  /* Read it off the page the action redirected to, rather than navigating
     again: a `goto` here raced the server action and sometimes won,
     cancelling the submission mid-flight — the same trap `row-layout.spec.ts`
     documents. The list comes back already filtered, so the row either went
     or it did not. */
  await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);

  await page.goto(`/projects/${projectId}/resources/links?search=${mark}&archived=1`);
  await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(1);
});
