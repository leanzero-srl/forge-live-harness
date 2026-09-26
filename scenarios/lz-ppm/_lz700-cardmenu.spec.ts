import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz700/shots";
test.describe.configure({ retries: 0, timeout: 1_200_000, mode: "serial" });
const combos = (snap: string) => (snap.match(/- combobox[^\n]*/g) || []).map((l) => l.trim());

test("plan card menu combobox name", async ({ page }) => {
  const R: any = {};
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(4000);
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first();
  await card.getByRole("button", { name: "More", exact: true }).first().dispatchEvent("click");
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/x10-card-menu.png` });
  R.menuCombos = combos(await frame.locator("body").ariaSnapshot());
  R.assignPresent = await frame.locator('[data-testid="plan-assign-select"]').count();
  console.log("CARD MENU COMBOS", JSON.stringify(R.menuCombos), "assignSelect=", R.assignPresent);
  if (R.assignPresent) {
    const c = frame.locator('[data-testid="plan-assign-select"]').getByRole("combobox").first();
    const before = combos(await c.ariaSnapshot())[0];
    await c.dispatchEvent("click"); await page.waitForTimeout(1200);
    const during = combos(await c.ariaSnapshot())[0];
    const opts = await frame.getByRole("option").allInnerTexts();
    R.assign = { before, during, opts, nameStable: String(before).replace(/ \[expanded\]/, "") === String(during).replace(/ \[expanded\]/, "") };
    console.log("ASSIGN", JSON.stringify(R.assign));
    await page.screenshot({ path: `${OUT}/x11-assign-open.png` });
  }
  fs.writeFileSync(`${OUT}/cardmenu-results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
