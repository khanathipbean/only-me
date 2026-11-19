import { expect, test } from "@playwright/test";

/**
 * The two exports behind one button.
 *
 * They were two buttons of their own, which made a four-wide header row and
 * spent as much weight on the choice of file format as on the import beside
 * it. What matters here is that collapsing them lost nothing: both formats
 * are still reachable, and each still points at the address that serves it.
 */
test("one Export button offers both formats, and each still downloads", async ({ page }) => {
  await page.goto("/projects?search=E2E-FIXTURE");
  await page.getByRole("link", { name: "E2E Fixture" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  const projectId = page.url().split("/projects/")[1].split("/")[0];

  await page.goto(`/projects/${projectId}/modules`);

  /* Shut to begin with, or it is not a menu — it is two buttons wearing a
     box. `<details>` reports this without any state of ours. */
  const menu = page.locator("details").filter({ hasText: "Export" });
  await expect(menu).not.toHaveAttribute("open", /.*/);

  await page.getByText("Export", { exact: true }).click();
  await expect(menu).toHaveAttribute("open", /.*/);

  /* Plain links, still pointed at the routes that serve each format — the
     whole reason this is built on `<details>` rather than on a click
     handler is that these keep working when JavaScript does not. */
  await expect(page.getByRole("link", { name: /Excel/ })).toHaveAttribute(
    "href",
    `/api/projects/${projectId}/export?format=xlsx`,
  );
  await expect(page.getByRole("link", { name: /CSV/ })).toHaveAttribute(
    "href",
    `/api/projects/${projectId}/export`,
  );

  // Escape closes it, which a bare `<details>` does not do on its own.
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", /.*/);
});
