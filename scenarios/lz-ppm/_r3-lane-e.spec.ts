// ROUND-3 lane E: build the storyline on the REST-OWNED twin of bed 2 so the
// storyline report can be captured over REST (the UI's template chooser does not
// reach the backend — see the finding). Then read the DOCUMENT.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const twin = JSON.parse(fs.readFileSync(`${OUT}/P1-key-in.json`, "utf8"));
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
const body = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("E1 build the storyline on the REST-owned twin", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1300 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no frame");
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: twin.name }).first().click();
  await page.waitForTimeout(7000);
  if (!/Gantt/i.test(await body(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  await page.waitForTimeout(4000);
  const cta = frame.locator('[data-testid="storyline-build-cta"]').or(frame.locator('[data-testid="storyline-rebuild"]'));
  if (await cta.count()) {
    await cta.first().click(); await page.waitForTimeout(1500);
    const conf = frame.locator('[data-testid="confirm-dialog"], [role="dialog"]').first();
    if (await conf.count()) await conf.getByRole("button", { name: /Rebuild|Build|Continue|Yes/i }).first().click().catch(() => {});
    for (let i = 0; i < 200; i++) {
      const bar = await txt(frame.locator('[data-testid="storyline-build"]'));
      if (!/Building|Reading|Working|Thinking/i.test(bar) && await frame.locator('[data-testid="storyline-view"]').count()) break;
      await page.waitForTimeout(3000);
    }
  }
  await frame.locator('[data-testid="storyline-view"]').waitFor({ state: "visible", timeout: 300_000 });
  await page.waitForTimeout(4000);
  const t = await txt(frame.locator('[data-testid="storyline-view"]'));
  fs.writeFileSync(`${OUT}/E1-twin-storyline.txt`, t);
  console.log("=== TWIN STORYLINE ===\n" + t);
  await page.screenshot({ path: `${OUT}/E1-twin.png`, fullPage: true });
  expect(await frame.locator('[data-testid="storyline-block"]').count()).toBeGreaterThan(0);
});
