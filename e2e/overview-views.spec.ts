import { expect, test } from "@playwright/test";

/**
 * Overview, Dashboard and Problem Cases under one tab.
 *
 * Three pages that all answer the same kind of question — how are we doing —
 * reached by a switcher rather than by three tabs of their own. The pages
 * themselves did not change; what this covers is that the one tab reaches
 * all three and that each of them knows which view is open.
 *
 * Worth a browser rather than a unit test for the same reason the Resources
 * switcher was: it is drawn as a tab control but built out of links, and a
 * pill that looks selected while showing another page is something only a
 * real click finds.
 */
test("one tab reaches all three readings of the project", async ({ page }) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);

  const projectNav = page.getByRole("navigation", { name: "Project" });
  await expect(projectNav.getByRole("link", { name: "Overview", exact: true })).toBeVisible();
  /* The two it swallowed are not beside it any more. */
  await expect(projectNav.getByRole("link", { name: "Dashboard", exact: true })).toHaveCount(0);
  await expect(
    projectNav.getByRole("link", { name: "Problem Cases", exact: true }),
  ).toHaveCount(0);
  await expect(projectNav.getByRole("link", { name: "Audit Trail", exact: true })).toHaveCount(0);

  const views = () => page.getByRole("navigation", { name: "Overview view" });
  /* "Summary", not "Overview": the pill no longer repeats the name of the
     nav tab above it. */
  await expect(views().getByRole("link", { name: "Summary" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  for (const [label, path] of [
    ["Dashboard", "/dashboard"],
    ["Problem Cases", "/problem-cases"],
    ["Audit Trail", "/audit-log"],
  ]) {
    await views().getByRole("link", { name: label }).click();
    await page.waitForURL(new RegExp(`${path.replace(/\//g, "\\/")}$`));
    await expect(views().getByRole("link", { name: label })).toHaveAttribute(
      "aria-current",
      "page",
    );
    /* The nav tab stays lit on all three, or a reader two clicks in has no
       idea which part of the app they are in. */
    await expect(
      page
        .getByRole("navigation", { name: "Project" })
        .getByRole("link", { name: "Overview", exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }

  // And back, so the set is a switcher rather than a one-way door.
  await views().getByRole("link", { name: "Summary" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
});

test("the switcher sits above the title it changes", async ({ page }) => {
  /* It was below it, and read as a filter on the page rather than as the
     way off it — a control that changes which page you are on cannot sit
     under that page's own name. Measured rather than asserted from the
     markup: what matters is where it lands on screen, and the two pages
     below arrange their headers differently. */
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  for (const [path, heading] of [
    [`/projects/${projectId}/dashboard`, "Dashboard"],
    [`/projects/${projectId}/problem-cases`, "Problem Cases"],
    [`/projects/${projectId}/audit-log`, "Audit Trail"],
    [`/projects/${projectId}/resources`, "Resources"],
  ]) {
    await page.goto(path);
    const label = path.endsWith("/resources") ? "Resources view" : "Overview view";
    const switcher = await page.getByRole("navigation", { name: label }).boundingBox();
    const title = await page.getByRole("heading", { name: heading, level: 1 }).boundingBox();
    expect(switcher!.y + switcher!.height, `${heading}: switcher above its title`).toBeLessThan(
      title!.y,
    );
  }
});

test("the header sits at the same height on every view", async ({ page }) => {
  /* The Overview used to sit 8px lower than the two beside it, because its
     breadcrumb shared a row with the Project Settings button — 36px of
     button against 20px of text, centred, so the text gained 8px above and
     below. Switching between the three made the whole page hop.

     Measured, because that is the only way to see it: nothing in the markup
     says a row is taller than its text. */
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  const seen: { name: string; crumbs: number; switcher: number }[] = [];
  for (const [name, path, label] of [
    ["Overview", `/projects/${projectId}`, "Overview view"],
    ["Dashboard", `/projects/${projectId}/dashboard`, "Overview view"],
    ["Problem Cases", `/projects/${projectId}/problem-cases`, "Overview view"],
    ["Audit Trail", `/projects/${projectId}/audit-log`, "Overview view"],
    ["Resources", `/projects/${projectId}/resources`, "Resources view"],
  ] as const) {
    await page.goto(path);
    const crumbs = await page.getByLabel("Breadcrumb").boundingBox();
    const switcher = await page.getByRole("navigation", { name: label }).boundingBox();
    seen.push({
      name,
      crumbs: Math.round(crumbs!.y),
      switcher: Math.round(switcher!.y),
    });
  }

  const where = seen.map((s) => `${s.name} ${s.crumbs}/${s.switcher}`).join(", ");
  expect(new Set(seen.map((s) => s.crumbs)).size, `breadcrumbs differ: ${where}`).toBe(1);
  expect(new Set(seen.map((s) => s.switcher)).size, `switchers differ: ${where}`).toBe(1);
});
