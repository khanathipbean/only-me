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
