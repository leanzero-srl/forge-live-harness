import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const SHOT = "/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6690";
test.describe.configure({ retries: 0, timeout: 600_000, mode: "serial" });
const bodyText = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("TIPS: beat cut copy + hues, then LZPT dashboard % complete", async ({ page }) => {
  const st = JSON.parse(fs.readFileSync(`${SHOT}/naming-state.json`, "utf8"));
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  let s = await enterForgeSurface(page, { surface: "custom" });
  let frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  let realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2000);
  await frame.getByText(st.planName, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  await page.waitForTimeout(6000);
  const beats = await realFrame!.evaluate(() =>
    [...document.querySelectorAll('[data-testid="storyline-beat"]')].map((el) => ({
      id: el.getAttribute("data-beat-id"), named: el.getAttribute("data-named"),
      cutReason: el.getAttribute("data-cut-reason"), cutWhy: el.getAttribute("data-cut-why"),
      color: el.getAttribute("data-color"), bg: getComputedStyle(el as HTMLElement).background.slice(0, 40),
    })));
  console.log("BEATS:", JSON.stringify(beats, null, 1));
  // hover beat 2 for the real tooltip
  const bar = frame.locator('[data-testid="storyline-beat"]').nth(1);
  const box = await bar.boundingBox();
  if (box) { await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(1500); }
  const tip = await realFrame!.evaluate(() => {
    const nodes = [...document.querySelectorAll("body *")].filter((e) => {
      const st = getComputedStyle(e as HTMLElement);
      return st.position === "fixed" || st.position === "absolute";
    }).map((e) => (e as HTMLElement).innerText).filter((t) => t && /cut here|natural break|no room|beat/i.test(t));
    return nodes.slice(0, 3);
  });
  console.log("HOVER_TOOLTIP:", JSON.stringify(tip, null, 1));
  await page.screenshot({ path: `${SHOT}/i3-5-beat-hover.png` });

  // ---- LZPT dashboard % complete (reconciliation) ----
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  s = await enterForgeSurface(page, { surface: "custom" });
  frame = s.kind === "custom" ? s.frame : null;
  realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2500);
  const cardText = await bodyText(frame);
  const idx = cardText.indexOf("LZPT Scenarios");
  console.log("PLANS_PAGE_LZPT_CARD:", JSON.stringify(cardText.slice(Math.max(0, idx - 120), idx + 500)));
  await page.screenshot({ path: `${SHOT}/i5-plans-page.png` });
  await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const dash = await bodyText(frame);
  console.log("DASH_COMPLETE:", JSON.stringify((dash.match(/(\d+)%[^\n]{0,40}/g) || []).slice(0, 12)));
  console.log("DASH_SNIPPET:", JSON.stringify(dash.slice(dash.indexOf("Dashboard"), dash.indexOf("Dashboard") + 900)));
  await page.screenshot({ path: `${SHOT}/i5-lzpt-dashboard.png`, fullPage: false });
  console.log("STAGED_AFTER_CLEANUP=" + /Apply \d+ change|Save \(\d+\)/.test(await bodyText(frame)));
  expect(true).toBeTruthy();
});
