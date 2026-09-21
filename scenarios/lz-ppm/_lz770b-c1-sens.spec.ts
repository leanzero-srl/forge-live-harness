// LZ770B C1b — drive the finish-sensitivity control itself (it only runs when pressed).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const PLAN = "[harness-test] LZ770B saved-edit bed";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

test("C1b: finish sensitivity with one undated leaf", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(6000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click();
  await page.waitForTimeout(12000);
  const btn = frame.getByRole("button", { name: /Test finish sensitivity/i }).first();
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click();
  for (let i = 0; i < 60; i++) {
    if (/tasks tested ·/.test((await bodyText(frame)).replace(/\s+/g, " "))) break;
    await page.waitForTimeout(1000);
  }
  const sect = (await frame.locator('[data-testid="finish-sensitivity"]').first().textContent().catch(() => "")) || "";
  console.log("SENS_SECTION", sect.replace(/\s+/g, " "));
  const t = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("SENS_LINE", t.match(/Whole plan · settled finish [^·]*·[^·]*·[^.]*\./)?.[0] ?? t.match(/settled finish.{0,140}/)?.[0] ?? "NOT FOUND");
  const n = await frame.locator('[data-testid="finish-effect"]').count();
  console.log("SENS_ROWS", n);
  for (let i = 0; i < n; i++) console.log("  ", await frame.locator('[data-testid="finish-effect"]').nth(i).getAttribute("data-key"), (await frame.locator('[data-testid="finish-effect"]').nth(i).textContent())?.replace(/\s+/g, " "));
  await frame.locator('[data-testid="finish-sensitivity"]').first().screenshot({ path: `${OUT}/c1-03-sens.png` }).catch(async () => { await page.screenshot({ path: `${OUT}/c1-03-sens.png` }); });
  expect(n, "sensitivity produced rows").toBeGreaterThan(0);
});
