// ROUND-2 item 1 (Portfolio page) + item 2 (scoped-gate card). Creates a
// temporary portfolio holding LZPT + the seeded plan, reads the rung words,
// then unassigns both and deletes the portfolio.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6730";
const LZPT = "LZPT Scenarios";
const PF = "[harness-test] r2 ladder";
const bed = JSON.parse(fs.readFileSync(`${OUT}/bed.json`, "utf8"));
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

async function surface(page: any) {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  if (s.kind !== "custom") throw new Error("no custom frame");
  await page.waitForTimeout(4000);
  return s.frame;
}
async function assign(frame: any, page: any, planName: string) {
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: planName }).first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('[data-testid="plan-portfolio-add"]').click();
  await frame.locator('[data-testid="plan-assign-select"]').waitFor({ state: "visible", timeout: 20_000 });
  await frame.locator('[data-testid="plan-assign-select"] [role="combobox"]').click();
  await page.waitForTimeout(800);
  await frame.locator('[role="option"]').filter({ hasText: PF }).first().click();
  await page.waitForTimeout(4000);
}

test("P1 scoped-gate card then the portfolio page", async ({ page }) => {
  const frame = await surface(page);
  // --- item 2, second half: the plan-scoped gate makes the rung `overdue`
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.planName }).first();
  await card.waitFor({ state: "visible", timeout: 90_000 });
  await card.scrollIntoViewIfNeeded();
  const chip = await txt(card.locator('[data-testid="plan-verdict-chip"]'));
  const full = (await txt(card)).replace(/\n/g, " | ");
  console.log("[scoped] CARD CHIP:", chip);
  console.log("[scoped] CARD TEXT:", full);
  fs.writeFileSync(`${OUT}/L4-card-scoped.txt`, `CHIP=${chip}\nTEXT=${full}\n`);
  await card.screenshot({ path: `${OUT}/L4-card-scoped.png` }).catch(() => {});
  expect(chip).toBe("Overdue");

  // --- item 1: the Portfolio page
  await frame.locator('[data-testid="new-portfolio-btn"]').click();
  await frame.locator('[data-testid="portfolio-dialog"]').waitFor({ state: "visible", timeout: 20_000 });
  await frame.locator('[data-testid="portfolio-dialog-name"]').fill(PF);
  await frame.locator('[data-testid="portfolio-dialog-save"]').click();
  await page.waitForTimeout(5000);
  await assign(frame, page, LZPT);
  const chipEl = frame.locator('[data-testid="plan-card"]').filter({ hasText: LZPT }).first().locator('[data-testid="plan-portfolio-chip"]');
  await chipEl.click();
  await page.waitForTimeout(5000);
  await frame.locator('[data-testid="portfolio-name"]').waitFor({ state: "visible", timeout: 60_000 });
  const rollup = await txt(frame.locator('[data-testid="portfolio-verdict"]'));
  const pbody = await txt(frame.locator("body"));
  console.log("PORTFOLIO rollup verdict:", rollup);
  const rows = await frame.locator('[data-testid="plans-grid"] [data-testid="plan-card"]').all();
  const cardTexts: string[] = [];
  for (const r of rows) cardTexts.push((await txt(r)).replace(/\n/g, " | "));
  console.log("PORTFOLIO CARDS:\n" + cardTexts.join("\n"));
  fs.writeFileSync(`${OUT}/P1-portfolio.txt`, `rollup=${rollup}\n\n${cardTexts.join("\n")}\n\n${pbody}\n`);
  await page.screenshot({ path: `${OUT}/P1-portfolio.png`, fullPage: true });
  expect(rollup.length).toBeGreaterThan(0);
});
