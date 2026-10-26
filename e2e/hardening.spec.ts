import { expect, test } from "@playwright/test";
import { E2E_VIEWER_EMAIL } from "./support/credentials";

/**
 * The headers and the error pages: two things that are only true if a browser
 * says so. Neither existed before, and neither shows up in a unit test.
 */
test("every response carries the security headers", async ({ page }) => {
  const response = await page.goto("/projects");
  const headers = response!.headers();

  // SAMEORIGIN rather than DENY on purpose — the file preview draws PDFs in
  // an iframe pointed at this app's own route, and DENY would break it. The
  // next test is the one that holds that promise.
  expect(headers["x-frame-options"]).toBe("SAMEORIGIN");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["strict-transport-security"]).toContain("max-age=");
});

test("a same-origin iframe still renders, so the preview dialog survives", async ({ page }) => {
  await page.goto("/projects");

  /* Reads what landed in the frame rather than waiting for `onload`, which
     fires either way — a blocked frame loads Chrome's own refusal page, so
     the first version of this test passed under DENY as well and proved
     nothing. Same origin, so the document is readable: if the frame was
     refused there is no <main> in it. */
  const framedBody = await page.evaluate(
    () =>
      new Promise<string>((resolve) => {
        const frame = document.createElement("iframe");
        frame.src = "/login";
        frame.addEventListener("load", () => {
          try {
            resolve(frame.contentDocument?.querySelector("main") ? "rendered" : "empty");
          } catch {
            resolve("blocked");
          }
        });
        document.body.append(frame);
        setTimeout(() => resolve("timed out"), 8000);
      }),
  );

  expect(framedBody).toBe("rendered");
});

test("an address that is not there says so, and offers a way back", async ({ page }) => {
  const response = await page.goto("/projects/does-not-exist-at-all");

  expect(response!.status()).toBe(404);
  await expect(page.getByRole("heading", { name: /couldn't find that/i })).toBeVisible();
  // The wording has to cover "not yours" as well as "not there" — this is the
  // page `requireProjectRoleOrNotFound` renders for a non-member.
  await expect(page.getByText(/not a member of/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /back to projects/i })).toBeVisible();
});

/**
 * The session cookie's own settings.
 *
 * Nothing in this project sets them: `authConfig` declares no `cookies`
 * block, so these are Auth.js defaults, which means nobody chose them and
 * nothing would notice if a later `cookies: { … }` got one wrong. `secure`
 * is absent below on purpose — it comes from `url.protocol === "https:"`
 * inside @auth/core, so it is false here over http and true on Netlify, which
 * also renames the cookies with the `__Secure-` and `__Host-` prefixes.
 */
test("the session cookie cannot be read by script and does not travel cross-site", async ({
  page,
  context,
}) => {
  await page.goto("/projects");

  const cookies = await context.cookies();
  const session = cookies.find((c) => c.name.endsWith("authjs.session-token"));
  expect(session, "no session cookie at all").toBeDefined();

  // Without httpOnly, any injected script could read the session outright.
  expect(session!.httpOnly).toBe(true);
  // Lax is what stops the cookie riding along on a cross-site POST.
  expect(session!.sameSite).toBe("Lax");
  expect(session!.path).toBe("/");

  // Eight hours, matching `authConfig.session.maxAge` — a session cookie with
  // no expiry would outlive the browser's idea of a session.
  const hours = (session!.expires * 1000 - Date.now()) / 3_600_000;
  expect(hours).toBeGreaterThan(7);
  expect(hours).toBeLessThanOrEqual(8);

  // The CSRF token is held to the same bar.
  const csrf = cookies.find((c) => c.name.endsWith("authjs.csrf-token"));
  expect(csrf!.httpOnly).toBe(true);
  expect(csrf!.sameSite).toBe("Lax");
});

/**
 * Every control a screen reader would land on has a name.
 *
 * Lint cannot answer this: `jsx-a11y` flagged sixty-five things in this
 * codebase and sixty-four were the rule not understanding a `<label>` wrapped
 * around a custom combobox. The one that was real — an unnamed Result filter
 * on the Test Run page — showed up because a script went looking for
 * `ariaLabel` at every call site, not because a rule found it.
 *
 * This asks the rendered page instead, which is also how the unnamed
 * `<dialog>` turned up.
 */
for (const path of ["/projects", "/settings", "/settings/members", "/settings/roles"]) {
  test(`every control on ${path} has an accessible name`, async ({ page }) => {
    await page.goto(path);

    const unnamed = await page.evaluate(() => {
      const problems: string[] = [];
      const NATIVE = new Set(["INPUT", "SELECT", "TEXTAREA"]);
      const selector =
        "button, [role='combobox'], [role='button'], input:not([type='hidden']), select, textarea";

      for (const el of Array.from(document.querySelectorAll(selector))) {
        /* Skip anything inside a closed dialog: every row carries its own Edit
           dialog in the DOM, and nothing reaches those until it opens. */
        if (el.closest("dialog:not([open])")) continue;

        const named =
          el.getAttribute("aria-label")?.trim() ||
          el.getAttribute("title")?.trim() ||
          (el.getAttribute("aria-labelledby") &&
            document.getElementById(el.getAttribute("aria-labelledby")!)?.textContent?.trim()) ||
          (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent?.trim()) ||
          /* A wrapping `<label>` names a native control and nothing else. The
             trigger of this app's `Select` is a button, so a `<label>` around
             it names nothing — which is exactly how the Result filter on the
             Test Run page ended up unnamed while looking labelled in the
             source. That distinction is the whole point of this check. */
          (NATIVE.has(el.tagName) ? el.closest("label")?.textContent?.trim() : "") ||
          /* Not for a combobox. Its own text is the option currently chosen,
             so counting it means "Active, combobox" passes as named — the
             reader hears the value and never learns what it is the value of.
             The first version of this check did count it, and so let the very
             bug it was written for walk straight through. */
          (el.getAttribute("role") === "combobox" ? "" : (el as HTMLElement).innerText?.trim()) ||
          (el as HTMLInputElement).placeholder?.trim();

        if (!named) {
          const role = el.getAttribute("role");
          problems.push(
            `${el.tagName.toLowerCase()}${role ? `[role=${role}]` : ""}` +
              ` name=${el.getAttribute("name") ?? "-"}`,
          );
        }
      }
      return problems;
    });

    expect(unnamed, `unnamed controls on ${path}`).toEqual([]);
  });
}

test("the site's own address goes somewhere", async ({ page }) => {
  /* There was no page at `/` at all, so the domain on its own answered 404 —
     always had, and the not-found page only made it look deliberate. */
  await page.goto("/");
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole("heading", { name: /projects/i })).toBeVisible();
});

/**
 * The app's own menu, for the half of it that is not inside a Project.
 *
 * Members used to be reachable only through an icon in the header, and the
 * Projects list had no menu at all. The row that fixes that must not show up
 * on a Project page, which has its own — two rows of tabs under one header
 * is two menus arguing about where the reader is.
 */
test("the app menu leads to Settings and stands aside inside a Project", async ({ page }) => {
  await page.goto("/settings");
  await expect(
    page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Settings" }),
  ).toHaveAttribute("aria-current", "page");

  // The card is the way in, and it is the card that is the link.
  await page.getByRole("link", { name: "Users" }).click();
  await page.waitForURL(/\/settings\/members$/);
  await expect(page.getByRole("heading", { name: "Users", level: 1 })).toBeVisible();
  // Still inside the section, three clicks down.
  await expect(
    page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Settings" }),
  ).toHaveAttribute("aria-current", "page");

  /* The address Members used to live at, with whatever was on the end of it.
     It is in bookmarks and in every notification written before the move. */
  await page.goto("/members?tab=activity");
  await page.waitForURL(/\/settings\/members\?tab=activity$/);
  await expect(page.getByRole("link", { name: "Account activity" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // And a Project keeps one row, not two.
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  await expect(page.getByRole("navigation", { name: "Sections" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Project" })).toBeVisible();
});

/**
 * Deleting an account is a row action, not something buried at the bottom of
 * the dialog for editing one.
 *
 * The confirmation is the whole reason that is safe, so this presses the
 * button and checks the question names the right account — and then backs
 * out, because a test that deletes a fixture account is a test that breaks
 * the next one.
 *
 * Located by the email cell. A first pass filtered rows on a name and caught
 * the admin's row instead, which carries a chip for every Project in the
 * database — and so nearly asked to delete the account the suite signs in
 * with. The email is the one cell on this page that is unique by
 * construction.
 */
test("deleting a user is offered in the row, and asks first", async ({ page }) => {
  await page.goto("/settings/members");
  const row = page
    .getByRole("row")
    .filter({ has: page.getByRole("cell", { name: E2E_VIEWER_EMAIL, exact: true }) });

  await expect(row.getByRole("button", { name: "Edit access" })).toBeVisible();

  /* Enabled only once the page is running. `ConfirmForm` disables itself
     until then, because a Next server-action form posts without JavaScript
     while the question it asks does not exist until React has hydrated —
     clicking inside that window used to delete the account outright, which
     is how this was found. */
  const remove = row.getByRole("button", { name: /^Delete / });
  await expect(remove).toBeEnabled();
  await remove.click();

  const confirm = page.locator("dialog[open]");
  await expect(confirm).toHaveCount(1);
  await expect(confirm).toContainText("This cannot be undone");
  /* The question has to name the account, or it is a confirmation of
     nothing in particular. Case-insensitive: the address is lower-case
     and the display name is not. */
  await expect(confirm).toContainText(new RegExp(E2E_VIEWER_EMAIL.split("@")[0], "i"));

  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("cell", { name: E2E_VIEWER_EMAIL, exact: true })).toBeVisible();
});

/**
 * What each role can reach, read off the rules rather than retyped.
 *
 * The page is a claim about the app's own behaviour, so what is worth
 * checking in a browser is that it is drawn from the catalogue and changes
 * when the role does — a page showing the same boxes for every role would
 * look right in a screenshot and be useless.
 */
test("the roles page shows a different set for a different role", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: "Roles & Permissions" }).click();
  await page.waitForURL(/\/settings\/roles$/);

  const held = () => page.locator("input[type=checkbox]:checked");
  const boxes = await page.locator("input[type=checkbox]").count();
  const admin = await held().count();
  // Admin holds everything, which is the one role that is true of.
  expect(admin).toBe(boxes);

  /* Two boxes are fixed and the rest are not: Settings and the Users page
     inside it are the way back in, and nothing here may take them away. */
  expect(await page.locator("input[type=checkbox][disabled]").count()).toBe(2);
  expect(
    await page.locator("input[type=checkbox]:not([disabled])").count(),
  ).toBeGreaterThan(0);

  await page
    .getByRole("navigation", { name: "Roles" })
    .getByRole("link", { name: /^Dev/ })
    .click();
  await page.waitForURL(/role=DEV/);
  const dev = await held().count();
  expect(dev).toBeGreaterThan(0);
  expect(dev).toBeLessThan(admin);
  // The one write a DEV has, and the page says so.
  await expect(page.getByText("Move a repair along")).toBeVisible();
});

/**
 * Changing what a role may do, from the page.
 *
 * The unit tests prove the stored rule wins over the code; what only a
 * browser can say is that the form carries the whole set — a checkbox sends
 * nothing when it is off, so "untick" and "never existed" look identical on
 * the wire, and the page has to send enough for the server to tell them
 * apart.
 *
 * Puts the tick back at the end. A test that leaves a permission changed
 * changes the suite that runs after it.
 */
test("a permission can be given and taken back", async ({ page }) => {
  await page.goto("/settings/roles?role=DEV");
  const notes = page.getByRole("checkbox", { name: /Write and archive Notes/ });
  const authoring = page.getByRole("checkbox", { name: /View Modules, Requirements/ });

  await expect(notes).not.toBeChecked();
  // A DEV holds this one, and it must survive a save that is about another.
  await expect(authoring).toBeChecked();

  await notes.check();
  await page.getByRole("button", { name: /Save Changes/ }).click();
  await page.waitForURL(/toast=/);

  await page.goto("/settings/roles?role=DEV");
  await expect(notes).toBeChecked();
  await expect(authoring).toBeChecked();

  await notes.uncheck();
  await page.getByRole("button", { name: /Save Changes/ }).click();
  await page.waitForURL(/toast=/);
  await page.goto("/settings/roles?role=DEV");
  await expect(notes).not.toBeChecked();
});

/**
 * The two that are the way back in cannot be touched from here.
 *
 * A screen that can take away its own way back is a screen that locks the
 * install. The server refuses them as well — this only checks the page is
 * not offering what the server will refuse.
 */
test("the way back into Settings is not on offer", async ({ page }) => {
  await page.goto("/settings/roles?role=ADMIN");
  for (const name of [/Open Settings/, /Add users and set what they can reach/]) {
    await expect(page.getByRole("checkbox", { name })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name })).toBeChecked();
  }
  // And they say why, rather than looking broken.
  await expect(page.getByText(/the way back into Settings/).first()).toBeVisible();
});
