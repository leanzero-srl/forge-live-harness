// TESTER scratch: cold open of LZPT, prove no staged change and no AI view.
import { test } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 300_000 });
test("bed check", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(7000);
    const t = (await frame.locator("body").innerText()) || "";
    console.log("STAGED_AFTER_CLEANUP =", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(t));
    console.log("HEADER =", t.slice(0, 320).replace(/\s+/g, " "));
    console.log("GROUPING =", (t.match(/Group\s+[^\n]{0,40}/) || [])[0]);
    console.log("AI BUILD BUTTON present =", await frame.locator('button').filter({ hasText: /Build AI structure/i }).count());
    await page.screenshot({ path: `${OUT}/50-bed-check.png` });
  } finally { await ctx.close().catch(() => {}); }
  const v: any = await getTestState("lz-ppm", { what: "aiView", planId: "plan-msq9dg8l-gz6mz1" });
  console.log("aiView after =", JSON.stringify(v));
  const d: any = await getTestState("lz-ppm", { what: "clearDrafts", planId: "plan-msq9dg8l-gz6mz1" });
  console.log("clearDrafts after =", JSON.stringify(d));
});
