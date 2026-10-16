import { expect, test } from "@playwright/test";

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
for (const path of ["/projects", "/members"]) {
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
