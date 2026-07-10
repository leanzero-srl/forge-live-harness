// PERSISTENT feature journey — Dashboard metrics on the LZPT bed (read-only).
// Verifies the leaf-count fix holds (task count excludes the 8 parents) and %
// complete reflects the seeded status mix (6 Done + 4 In-Progress of 37 leaves).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 200_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT dashboard: task count excludes parents, % complete reflects status mix", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Table|Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);

  // Parse the KPI tiles from the DOM (the body text merges "45"+"37 tasks" into
  // "4537 tasks", so a text regex is unreliable — read leaf elements instead).
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  const leaf = await realFrame!.evaluate(() => {
    const leafEl = Array.from(document.querySelectorAll("*")).find((e) => e.children.length === 0 && /^\d+ tasks$/.test((e.textContent || "").trim()));
    return leafEl ? Number((leafEl.textContent || "").match(/(\d+)/)![1]) : null;
  });
  const dashBody = await bodyText(frame);
  const pctM = dashBody.match(/Complete[^\d]{0,4}(\d+)\s*%/);
  const m = { leaf, pct: pctM ? Number(pctM[1]) : null };
  console.log("DASH_METRICS:", JSON.stringify(m));
  // Leaf count = 37 (45 issues − 6 epics − 2 stories). The earlier Epic-double-
  // counting bug would have shown 45 here.
  expect(m.leaf, "dashboard task count is 37 LEAVES, not 45 (parents excluded)").toBe(37);
  // % complete: duration-weighted over leaves (done=100, in-progress=50, todo=0);
  // 6 Done + 4 In-Progress of 37 → above 0, well under 50.
  expect(m.pct, "% complete parsed").not.toBeNull();
  expect(m.pct! > 0 && m.pct! < 50, "% complete reflects the seeded status mix (0<pct<50)").toBeTruthy();
});
