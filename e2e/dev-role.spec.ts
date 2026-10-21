import { expect, test } from "@playwright/test";
import {
  E2E_ASSIGNED_CASE,
  E2E_DEV_EMAIL,
  E2E_DEV_PASSWORD,
  E2E_OVERDUE_CASE,
} from "./support/credentials";

/**
 * What a DEV may open, checked by opening it.
 *
 * Four pages moved from "any member" to "any member except a DEV", and the
 * menu stopped offering them. Hiding a link is decoration: the hole
 * `/projects/new` once had was exactly this, a button that was gone and a URL
 * that still worked. So each of the four is typed in here rather than looked
 * for in the menu, and the test wants a 404 — not a page without its buttons.
 *
 * Signed in as the DEV account the seed creates, so `storageState` is cleared
 * for this file.
 */
test.use({ storageState: { cookies: [], origins: [] } });

let projectId = "";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(E2E_DEV_EMAIL);
  await page.locator('input[name="password"]').fill(E2E_DEV_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/projects");

  if (!projectId) {
    await page.goto("/projects?search=E2E-FIXTURE");
    await page.getByRole("link", { name: "E2E Fixture" }).click();
    /* The project's own address sends a DEV straight on, so the id has to be
       read from where they land rather than from where they clicked. */
    await page.waitForURL(/\/projects\/[^/]+\/my-work$/);
    projectId = page.url().split("/projects/")[1].split("/")[0];
  }
});

test("lands on My Work instead of the Overview it was linked to", async ({ page }) => {
  await page.goto(`/projects/${projectId}`);
  await page.waitForURL(/\/my-work$/);
  await expect(page.getByRole("heading", { name: "My Work" })).toBeVisible();
});

test("is offered only the five pages it may open", async ({ page }) => {
  await page.goto(`/projects/${projectId}/my-work`);
  const tabs = page.getByRole("navigation", { name: "Project" });

  for (const label of ["My Work", "Dashboard", "Modules", "Notes", "Files"]) {
    await expect(tabs.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  /* First for a DEV, who has no Overview in front of it. */
  await expect(tabs.getByRole("link").first()).toHaveText("My Work");
  for (const label of ["Overview", "Problem Cases", "Test Runs", "Import", "Audit Trail"]) {
    await expect(tabs.getByRole("link", { name: label, exact: true })).toHaveCount(0);
  }
});

/* The four addresses, typed in. A page that merely hid its controls would
 * answer 200 here and pass a test that only looked at the menu. */
for (const [label, path] of [
  ["Problem Cases", "problem-cases"],
  ["Test Runs", "runs"],
  ["Import", "import"],
  ["Audit Trail", "audit-log"],
] as const) {
  test(`is refused ${label} by the URL, not just by the menu`, async ({ page }) => {
    const response = await page.goto(`/projects/${projectId}/${path}`);
    expect(response?.status()).toBe(404);
  });
}

test("sees the case it was given, with what went wrong", async ({ page }) => {
  await page.goto(`/projects/${projectId}/my-work`);

  const card = page.getByRole("group", { name: E2E_ASSIGNED_CASE, exact: true });
  await expect(card).toBeVisible();
  /* The tester's words, which are the reason this page exists — and the one
     line that survives the card being shut, which is why it is readable
     without expanding anything. `first`, because the open card prints the
     same words again in full underneath. */
  await expect(card.getByText("The page hangs on a spinner").first()).toBeVisible();

  // The rest is folded away until asked for.
  await expect(card.getByText("What should happen")).toBeHidden();
  await card.getByText("What happened").click();
  await expect(card.getByText("What should happen")).toBeVisible();

  /* And how it got here. Checked for having entries rather than for the
     first one's words: the card shows the latest ten moves, the fixture
     database is not reset between runs, and the note written when the case
     was first handed over drops off the end once the suite has run a few
     times. */
  await card.getByText("How it got here").click();
  await expect(card.getByRole("listitem").first()).toBeVisible();
});

test("puts what is already late at the top, in red", async ({ page }) => {
  await page.goto(`/projects/${projectId}/my-work`);

  const late = page.getByRole("link", { name: E2E_OVERDUE_CASE });
  await expect(late).toBeVisible();
  await expect(page.getByText(/Overdue by \d+ days?/)).toBeVisible();

  /* Above the other card, not merely present: "ดันขึ้นบนสุด" is the whole
     point, and a red badge halfway down a page nobody scrolled to is not it.
     Compared by position on the page rather than by DOM order, because what
     matters is what a reader sees first. */
  /* And one that is not late says how far into its window it is, rather than
     only how much is left — the window is the thing being spent. */
  await expect(
    page.getByRole("group", { name: E2E_ASSIGNED_CASE, exact: true }).getByText(/Day \d+ of \d+/),
  ).toBeVisible();

  const lateBox = await late.boundingBox();
  const otherBox = await page.getByRole("link", { name: E2E_ASSIGNED_CASE }).boundingBox();
  expect(lateBox!.y).toBeLessThan(otherBox!.y);
});

test("can say how far a repair has got, and nothing else", async ({ page }) => {
  await page.goto(`/projects/${projectId}/my-work`);

  /* The one write a DEV has. Everything else on this page is read-only, and
     every other page refuses them outright. */
  /* `force`, because the radio itself is `sr-only`: the label is what anyone
     clicks, and Playwright will not click a control it cannot see. */
  const card = page.getByRole("group", { name: E2E_ASSIGNED_CASE, exact: true });
  /* No Save: it writes on the press, like the result control on the Test
     Case list. */
  await card.getByRole("button", { name: "In progress" }).click();

  await page.waitForURL(/toast=/);
  /* It has moved sections, and what was said about the move is on the card's
     own history — which is the whole point of writing it down. */
  await expect(page.getByText("You said you are on these")).toBeVisible();
  const after = page.getByRole("group", { name: E2E_ASSIGNED_CASE, exact: true });
  await after.getByText("How it got here").click();
  /* `first`: the history keeps every move, so a database the suite has run
     against before holds one of these per run. */
  await expect(after.getByText("In progress").first()).toBeVisible();

  // Back where the seed left it, so the next run starts the same way.
  const moved = page.getByRole("group", { name: E2E_ASSIGNED_CASE, exact: true });
  await moved.getByRole("button", { name: "To fix" }).click();
  await page.waitForURL(/toast=/);
});

test("cannot say a repair is fixed without saying what was done", async ({ page }) => {
  await page.goto(`/projects/${projectId}/my-work`);
  const card = page.getByRole("group", { name: E2E_ASSIGNED_CASE, exact: true });

  await card.getByRole("button", { name: "Ready to retest" }).click();

  /* The one move that is a claim rather than an observation, so it asks.
     Saving is refused until something is written — an empty answer is what
     the dialog exists to prevent. */
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

  await dialog.getByRole("textbox").fill("Fixed in abc123 — the loader raced the filter.");
  await dialog.getByRole("button", { name: "Save" }).click();
  await page.waitForURL(/toast=/);

  const moved = page.getByRole("group", { name: E2E_ASSIGNED_CASE, exact: true });
  await moved.getByText("How it got here").click();
  await expect(moved.getByText("Fixed in abc123").first()).toBeVisible();

  // Back where the seed left it.
  await moved.getByRole("button", { name: "To fix" }).click();
  await page.waitForURL(/toast=/);
});

/**
 * Nothing that would be refused is offered.
 *
 * Every write in the app goes through `EDITOR_ROLES`, so a DEV pressing one
 * of these was always turned away — but turned away with a 404, which reads
 * as the app being broken rather than as the reader not being allowed. The
 * controls were drawn for everybody, so a VIEWER had met the same thing for
 * as long as the pages have existed.
 *
 * Walked page by page as the DEV rather than asserted in a unit test,
 * because what is being checked is what a person is shown.
 */
test("can look at what it handed nobody, and at everyone's", async ({ page }) => {
  await page.goto(`/projects/${projectId}/my-work`);

  /* Three readings of the same list; the page opens on its own, whatever the
     role, because a page called My Work that opens on somebody else's is
     lying about its name. */
  const filter = page.getByRole("combobox", { name: "Whose repairs to show" });
  await expect(filter).toHaveText(/Assigned to me/);

  await filter.click();
  await page.getByRole("option", { name: "Handed out by me" }).click();
  await page.waitForURL(/who=handed-out/);
  // A DEV hands nothing out, so this view is empty for them.
  await expect(page.getByText("You have not handed anything over")).toBeVisible();

  await page.getByRole("combobox", { name: "Whose repairs to show" }).click();
  await page.getByRole("option", { name: "Everyone" }).click();
  await page.waitForURL(/who=all/);
  await expect(page.getByRole("link", { name: E2E_ASSIGNED_CASE })).toBeVisible();
});

test("is offered no control it would be refused for using", async ({ page }) => {
  const pages = ["modules", "notes", "files", "dashboard"];

  for (const path of pages) {
    await page.goto(`/projects/${projectId}/${path}`);
    await expect(page.getByRole("button", { name: /^\+ New/ })).toHaveCount(0);
    // The "⋮" menu that holds Edit, Archive and Duplicate on every row.
    await expect(page.getByRole("button", { name: /^Actions for/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Upload/ })).toHaveCount(0);
    // And nothing leaked as literal text where a conditional should have been.
    await expect(page.getByText(/canEdit/)).toHaveCount(0);
  }
});

test("is shown a Test Case to read, not to change", async ({ page }) => {
  /* Reached from My Work's own link rather than clicked down five levels:
     the card links straight to the case, which is the road a Dev actually
     takes. */
  await page.goto(`/projects/${projectId}/my-work`);
  await page.getByRole("link", { name: E2E_ASSIGNED_CASE }).click();
  await page.waitForURL(/\/test-cases\//);

  // The two controls that used to be drawn for everybody and answered 404.
  await expect(page.getByRole("button", { name: "Update Result" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload Attachment" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Test Result" })).toHaveCount(0);
  /* Assigning is an editor's move: a DEV may say how far a repair has got,
     never who is on it. */
  await expect(page.getByRole("combobox", { name: /^Assign / })).toHaveCount(0);

  // Still readable, which is the point of letting a DEV this far down.
  await expect(page.getByText("Result history")).toBeVisible();
});

test("may still read a Test Case, and the rounds it has been through", async ({ page }) => {
  /* Deliberate, and written down in the plan: what a DEV is kept out of is
     managing rounds, not the history of what happened to a case. Modules is
     open to them, and Run History sits five levels below it. */
  await page.goto(`/projects/${projectId}/modules`);
  await expect(page.getByRole("heading", { name: /modules/i })).toBeVisible();
});
