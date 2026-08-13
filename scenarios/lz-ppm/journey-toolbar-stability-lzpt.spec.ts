// PERSISTENT journey — #1 "the tab bar jumps between views". The fix moved the
// Gantt-only controls (zoom, Critical, Assess) into the Gantt's own strip so the
// shared toolbar renders identically on every view. Assert it: the view-tab
// button's box (position AND size) must be identical across all five views —
// if the toolbar reflows or grows on any view, the tab moves and this fails.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 1, timeout: 240_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT toolbar: the tab bar does not move between views", async ({ page }) => {
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
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);

  const views = [/^Gantt/i, /^Table/i, /^Dashboard/i, /^Schedule/i, /^Permissions/i];
  const boxes: Record<string, any> = {};
  for (const v of views) {
    await frame.getByRole("button", { name: v }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    // Measure the GANTT tab's box on every view — one stable element, five states.
    const b = await frame.getByRole("button", { name: /^Gantt/i }).first().boundingBox();
    expect(b, `tab visible on ${v}`).toBeTruthy();
    boxes[String(v)] = { x: Math.round(b!.x), y: Math.round(b!.y), w: Math.round(b!.width), h: Math.round(b!.height) };
  }
  console.log("TAB_BOXES", JSON.stringify(boxes));
  const first = boxes[String(views[0])];
  for (const v of views.slice(1)) {
    expect(boxes[String(v)], `tab box on ${v} matches the Gantt view's`).toEqual(first);
  }
});
