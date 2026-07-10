// Create-or-open the "LZPT Scenarios" plan (sourced from project = LZPT) and
// validate the seeded scenarios render. Guarded: SEED=1. Also the first real
// end-to-end check that the seed data flows through the app.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 320_000 });

test("create/open LZPT Scenarios plan + validate render", async ({ page }) => {
  test.skip(process.env.SEED !== "1", "guarded: set SEED=1");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2500);

  const hasPlan = await frame.getByText(PLAN, { exact: false }).first().isVisible().catch(() => false);
  if (!hasPlan) {
    console.log("Creating plan via wizard…");
    await frame.getByRole("button", { name: /New Plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    await frame.getByPlaceholder(/Q2 Release Plan/i).fill(PLAN).catch(() => {});
    await page.waitForTimeout(400);
    await frame.getByRole("button", { name: /Continue/i }).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    await frame.getByPlaceholder(/project = PROJ AND type/i).first().fill("project = LZPT").catch(() => {});
    await page.waitForTimeout(2500); // JQL validation
    // Continue through calendar / visibility / milestones, then Create.
    for (let i = 0; i < 5; i++) {
      const createBtn = frame.locator("button").filter({ hasText: /^Create/i }).first();
      if (await createBtn.isVisible().catch(() => false)) { await createBtn.click().catch(() => {}); break; }
      await frame.getByRole("button", { name: /Continue/i }).first().click().catch(() => {});
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SHOT}/lzpt-created.png` });
    // Wait for indexing to finish (up to ~90s).
    for (let i = 0; i < 30; i++) {
      const body = (await frame.locator("body").textContent().catch(() => "")) || "";
      if (/Gantt/i.test(body) && !/indexing|Building your plan|Fetching/i.test(body)) break;
      await page.waitForTimeout(3000);
    }
  }

  // Open the plan.
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  // If we're on the plan list, an "Open plan" for the right card; else already in.
  if (!/Gantt/i.test((await frame.locator("body").textContent().catch(() => "")) || "")) {
    await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  }
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${SHOT}/lzpt-gantt.png` });

  const rootHandle = await frame.locator(":root").elementHandle();
  const realFrame = await rootHandle!.ownerFrame();
  const stats = await realFrame!.evaluate(() => {
    const bars = Array.from(document.querySelectorAll('[data-testid="gantt-bar"]'));
    const arrows = Array.from(document.querySelectorAll('[data-testid="dep-arrow-hit"]'));
    const parents = bars.filter((b) => b.getAttribute("data-parent") === "true").length;
    const body = document.body.textContent || "";
    const m = body.match(/Showing (\d+) of (\d+)/);
    return { bars: bars.length, parents, arrows: arrows.length, showing: m ? m[0] : null };
  });
  console.log("LZPT_RENDER:", JSON.stringify(stats));
  expect(stats.bars, "seeded scenario bars render").toBeGreaterThan(20);
  expect(stats.arrows, "dependency arrows render").toBeGreaterThan(5);
});
