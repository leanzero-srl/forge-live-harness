// LZ730 — photograph the FINISH block of the on-screen storyline document, and
// read BOTH captures' finish blocks.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz730/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz730";
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });

test("finish block, both captures, photographed", async ({ page }) => {
  const R: any = {};
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(18000);
  await frame.getByRole("button", { name: /^Planning$/i }).first().click();
  await page.waitForTimeout(6000);
  await frame.getByRole("button", { name: /^Sponsor reports$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  await frame.locator('[data-testid="sponsor-reports"]').first().waitFor({ state: "visible", timeout: 60_000 });

  for (const [tag, name] of [["cap1", "LZ730 capture 1 baseline"], ["cap2", "LZ730 capture 2 with promise"]] as const) {
    const entry = frame.getByRole("button", { name: new RegExp(name) }).first();
    if (await entry.count()) await entry.dispatchEvent("click");
    else await frame.getByText(name, { exact: false }).first().dispatchEvent("click");
    await page.waitForTimeout(9000);
    const fin = frame.locator('[data-testid="storyline-report-finish"]').first();
    await fin.waitFor({ state: "attached", timeout: 30_000 });
    await fin.scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(1200);
    R[tag] = {
      finishBlock: ((await fin.textContent()) || "").replace(/\s+/g, " ").trim(),
      verdictLine: ((await frame.locator('[data-testid="storyline-report-verdict-line"]').first().textContent().catch(() => "")) || "").trim(),
      undated: ((await frame.locator('[data-testid="storyline-report-undated"]').first().textContent().catch(() => "(absent)")) || "(absent)").trim(),
    };
    await fin.screenshot({ path: `${OUT}/c-${tag}-finish.png` }).catch(async () => { await page.screenshot({ path: `${OUT}/c-${tag}-finish-page.png` }); });
    await page.screenshot({ path: `${OUT}/c-${tag}-page.png` });
    console.log(tag.toUpperCase(), JSON.stringify(R[tag], null, 1));
  }
  fs.writeFileSync(`${OUT}/finish-blocks.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
