import { expect, test } from "@playwright/test";

/**
 * "Show more" used to swap the clamped text for the full text and let the box
 * land on its new height in one frame.
 *
 * Proven by sampling the height while it changes rather than by looking at
 * it: a jump produces two values, the before and the after. A transition
 * produces a run of values between them.
 */
const LONG_DESCRIPTION =
  "ระบบ Data Governance เป็นระบบสำหรับบริหารจัดการข้อมูลขององค์กรให้มีมาตรฐาน " +
  "สามารถค้นหา ทำความเข้าใจ และนำไปใช้งานได้อย่างถูกต้อง โดยรวบรวมข้อมูลจากแหล่งต่าง ๆ " +
  "มาจัดเก็บไว้ในที่เดียว พร้อมกำหนดสิทธิ์การเข้าถึงและติดตามการใช้งานได้ทั้งหมด " +
  "เพื่อให้ทุกหน่วยงานทำงานบนชุดข้อมูลเดียวกัน";

test("a long description grows instead of jumping", async ({ page }) => {
  /* Its own project rather than the shared fixture, whose description is
     under the clamp and whose seed is idempotent — changing it there would
     not reach a database that already has one. */
  const code = `EXPAND-${Date.now().toString(36)}`;
  await page.goto("/projects");
  await page.getByRole("button", { name: "+ New Project" }).click();
  const dialog = page.locator("dialog[open]");
  await dialog.locator('input[name="code"]').fill(code);
  await dialog.locator('input[name="name"]').fill(`Expand ${code}`);
  await dialog.locator('textarea[name="description"]').fill(LONG_DESCRIPTION);
  await dialog.getByRole("button", { name: "Create Project" }).click();
  await page.waitForURL(/\/projects\/[^/]+$/);
  // Without the query: creating redirects with a toast on it, and
  // `${url}/modules` built from that lands nowhere.
  const overview = page.url().split("?")[0];

  /* An empty Project shows the getting-started panel instead of the overview
     the description lives on — see `projects/[id]/page.tsx`, which only
     fetches a summary once there is a Module. So give it one. */
  await page.goto(`${overview}/modules`);
  await page.getByRole("button", { name: "+ New Module" }).click();
  await page
    .getByPlaceholder("One menu of the system under test, e.g. Dashboard")
    .fill("Something to summarise");
  await page.getByRole("button", { name: /add module/i }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  await page.goto(overview);

  const more = page.getByRole("button", { name: "Show more" });
  await expect(more).toBeVisible();

  /* The visible paragraph, found by its own words: `main p` alone picks up
     the project code and the hidden measuring copy as well. */
  const sample = () =>
    page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const el = [...document.querySelectorAll("main p")].find(
          (node) =>
            node.textContent?.includes("Data Governance") &&
            (node as HTMLElement).offsetParent !== null,
        ) as HTMLElement | undefined;
        if (!el) {
          resolve([]);
          return;
        }
        const seen: number[] = [];
        const tick = () => {
          seen.push(el.getBoundingClientRect().height);
          if (seen.length < 60) requestAnimationFrame(tick);
          else resolve(seen);
        };
        requestAnimationFrame(tick);
        setTimeout(() => resolve(seen), 600);
      }),
  );

  const growing = sample();
  await more.click();
  const heights = [...new Set((await growing).map((h) => Math.round(h)))];

  expect(heights.length, `growing: ${heights.join(", ")}`).toBeGreaterThan(3);
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();

  /* And back. This is the direction that needs the hidden measuring copy:
     without it there is nothing to read the collapsed height from once the
     full text is on screen, and the box would snap shut. */
  const shrinking = sample();
  await page.getByRole("button", { name: "Show less" }).click();
  const back = [...new Set((await shrinking).map((h) => Math.round(h)))];

  expect(back.length, `shrinking: ${back.join(", ")}`).toBeGreaterThan(3);
  await expect(page.getByRole("button", { name: "Show more" })).toBeVisible();
});
