// LagStamp probe UI: plan card (finish/room/verdict) + Dashboard finish, on the
// scratch fixture plan "LagStamp Probe" (WFH-3442..3444, lag 5 on 3443->3444).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lagbed";
const NAME = "LagStamp Probe";
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

async function surface(page: any, w = 1600, h = 1200) {
  await page.setViewportSize({ width: w, height: h });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no custom frame");
  await page.waitForTimeout(4000);
  return s.frame;
}

test("card + dashboard agree on the lagged finish", async ({ page }) => {
  const frame = await surface(page);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(3000);
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
  await card.scrollIntoViewIfNeeded();
  const dump = {
    cardText: (await txt(card)).replace(/\n/g, " | "),
    finish: await txt(card.locator('[data-testid="plan-finish"]')),
    room: await txt(card.locator('[data-testid="plan-room"]')),
    verdict: await txt(card.locator('[data-testid="plan-verdict-chip"]')),
    punchline: await txt(card.locator('[data-testid="plan-punchline"]')),
  };
  console.log("CARD:", JSON.stringify(dump, null, 2));
  fs.writeFileSync(`${OUT}/ui-card.json`, JSON.stringify(dump, null, 2));
  await card.screenshot({ path: `${OUT}/shot-card.png` });
  await page.screenshot({ path: `${OUT}/shot-plans-page.png` });

  await card.click();
  await page.waitForTimeout(9000);
  const b = await txt(frame.locator("body"));
  if (!/Gantt/i.test(b)) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  // Dashboard tab
  await frame.locator('[data-testid="view-tab-dashboard"]').first().click().catch(async () => {
    await frame.getByRole("button", { name: /^Dashboard$/i }).first().click();
  });
  await page.waitForTimeout(8000);
  const tiles = await frame.locator('[data-testid="kpi-tile"]').allInnerTexts().catch(() => []);
  const health = {
    verdict: await txt(frame.locator('[data-testid="plan-health-verdict"]')),
    punchline: await txt(frame.locator('[data-testid="plan-health-punchline"]')),
  };
  console.log("KPI TILES:", JSON.stringify(tiles, null, 2));
  console.log("HEALTH:", JSON.stringify(health, null, 2));
  fs.writeFileSync(`${OUT}/ui-dashboard.json`, JSON.stringify({ tiles, health }, null, 2));
  await page.screenshot({ path: `${OUT}/shot-dashboard.png`, fullPage: false });
  expect(tiles.length).toBeGreaterThan(0);
});
