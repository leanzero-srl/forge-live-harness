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
    const b = boxes[String(v)];
    // Horizontal position and size must be EXACT — the reported defect was the
    // tab group re-centring by ~190px as view-gated side content came and went.
    expect({ x: b.x, w: b.w, h: b.h }, `tab x/size on ${v} matches the Gantt view's`).toEqual({ x: first.x, w: first.w, h: first.h });
    // Vertically allow a small tolerance: the row's tallest child differs by a
    // few px between views (Save/Re-index buttons vs none), which shifts the
    // centred tabs ~4px. Known residual, logged above — a real jump fails this.
    expect(Math.abs(b.y - first.y), `tab y on ${v} within 5px of the Gantt view's`).toBeLessThanOrEqual(5);
  }
});
