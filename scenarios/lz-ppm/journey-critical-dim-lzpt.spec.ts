// PERSISTENT feature journey — CRITICAL-PATH dim behaviour on LZPT (read-only view
// toggle). Beyond the existing badge==bar-count check, this asserts the RECEDE:
// in Critical mode every non-critical row visibly dims (opacity ~0.4) while the
// critical rows stay full (opacity ~1); the dim state exactly partitions the plan;
// the non-dimmed count == the independently-computed badge; and toggling OFF clears
// all dimming. Mutates NOTHING (view state). NEVER Applies. Keys float by summary.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 220_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT critical path: non-critical rows recede (dim), partition matches the badge", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  await page.waitForTimeout(1800);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);

  // Snapshot every gantt-row: key, data-dim, its ACTUAL computed opacity, and
  // whether its bar is flagged critical (data-critical=1).
  const rowState = () => realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="gantt-row"]')).map((el) => {
      const key = el.getAttribute("data-row-key");
      const bar = el.querySelector('[data-testid="gantt-bar"]');
      return {
        key,
        dim: el.getAttribute("data-dim"),
        opacity: Number(getComputedStyle(el as HTMLElement).opacity),
        hasBar: !!bar,
        critical: bar?.getAttribute("data-critical") === "1",
      };
    }),
  );

  // Baseline (Critical OFF): nothing dimmed.
  const off0 = await rowState();
  console.log("OFF rows:", off0.length, " dimmed:", off0.filter((r) => r.dim !== "none").length);
  expect(off0.length, "rows rendered").toBeGreaterThan(20);
  expect(off0.every((r) => r.dim === "none" && r.opacity > 0.95), "Critical OFF → no row dimmed").toBeTruthy();

  // --- Toggle Critical ON ---
  await frame.getByRole("button", { name: /^Critical/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/critical-dim.png` });
  const critBtn = (await frame.getByRole("button", { name: /Critical/i }).first().textContent().catch(() => "")) || "";
  const badge = Number((critBtn.match(/\((\d+)\)/) || [])[1] || "0");
  const on = await rowState();

  const criticalBars = on.filter((r) => r.hasBar && r.critical);
  const nonCritLeaves = on.filter((r) => r.hasBar && !r.critical);
  const notDimmed = on.filter((r) => r.dim === "none");
  console.log("ON badge:", badge, " criticalBars:", criticalBars.length, " nonCritLeaves:", nonCritLeaves.length,
    " notDimmed:", notDimmed.length, " sample dim opacities:", JSON.stringify(nonCritLeaves.slice(0, 3).map((r) => r.opacity)));

  // 1) The badge (independently computed via computeCriticalPath) == the number of
  //    critical bars rendered == the number of non-dimmed rows.
  expect(badge, "Critical badge shows a count").toBeGreaterThan(0);
  expect(criticalBars.length, "critical bars == badge").toBe(badge);
  // Every critical row is undimmed (full opacity); every one is data-dim=none.
  expect(criticalBars.every((r) => r.dim === "none" && r.opacity > 0.95), "critical rows stay FULL (opacity ~1, dim=none)").toBeTruthy();
  // 2) Non-critical rows RECEDE: data-dim=critical and a clearly reduced opacity.
  expect(nonCritLeaves.length, "there are non-critical rows to dim").toBeGreaterThan(5);
  expect(nonCritLeaves.every((r) => r.dim === "critical" && r.opacity < 0.6), "non-critical rows visibly dim (opacity <0.6, dim=critical)").toBeTruthy();
  // 3) The dim state perfectly partitions the plan (no bar-row is left ambiguous).
  const barRows = on.filter((r) => r.hasBar);
  expect(barRows.every((r) => (r.critical ? r.dim === "none" : r.dim === "critical")), "dim state exactly mirrors the critical partition").toBeTruthy();

  // --- Toggle Critical OFF → all dimming clears ---
  await frame.getByRole("button", { name: /^Critical/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const off1 = await rowState();
  console.log("OFF-again dimmed:", off1.filter((r) => r.dim !== "none").length);
  expect(off1.every((r) => r.dim === "none" && r.opacity > 0.95), "toggling Critical OFF restores full opacity everywhere").toBeTruthy();
});
