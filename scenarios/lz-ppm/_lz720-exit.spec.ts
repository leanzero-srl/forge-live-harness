// LZ720 exit check: the created plan is GONE from the dashboard, and the
// profile's per-plan space memory for it is removed (it points at a dead plan).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const bed = JSON.parse(fs.readFileSync("/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz700/bed.json", "utf8"));
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz720";
const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 0, timeout: 900_000 });

test("exit: plan deleted, profile memory cleaned", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(4000);
  const stillExists = await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).count();
  const cards = await frame.locator('[data-testid="plan-card"]').allInnerTexts();
  const realFrame = (await (await frame.locator(":root").elementHandle())!.ownerFrame())!;
  const storage = await realFrame.evaluate(() => {
    const hit = Object.keys(localStorage).filter((k) => k.startsWith("lz.confluence.space."));
    const dump = hit.map((k) => `${k}=${localStorage.getItem(k)}`);
    hit.forEach((k) => localStorage.removeItem(k));
    return { removed: dump, left: Object.keys(localStorage).filter((k) => k.startsWith("lz.confluence.space.")) };
  });
  await page.screenshot({ path: `${OUT}/z01-exit.png` });
  console.log("STILL_EXISTS=" + (stillExists > 0));
  console.log("CARDS", JSON.stringify(cards.map((c) => c.replace(/\s+/g, " ").slice(0, 60))));
  console.log("STORAGE", JSON.stringify(storage));
  expect(stillExists).toBe(0);
});
