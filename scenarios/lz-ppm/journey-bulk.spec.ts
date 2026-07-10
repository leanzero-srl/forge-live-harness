// PERSISTENT journey J11 — Table bulk multi-select. Verifies parents are EXCLUDED from
// bulk (they roll up; buffer is a leaf concept — same theme as J5). Select-all must pick
// only LEAVES (count < total), and bulk-set buffer stages a change. Discards to clean.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 200_000 });

async function isStaged(frame: any): Promise<boolean> {
  const t = (await frame.locator("body").textContent().catch(() => "")) || "";
  return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t);
}

test("J11 bulk: select-all excludes parents; bulk buffer stages", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  const body0 = (await frame.locator("body").textContent().catch(() => "")) || "";
  const total = Number((body0.match(/(\d+)\s+issues/) || [])[1] || 0);
  console.log("TOTAL_ISSUES:", total);

  // Select all → should pick LEAVES only (parents have no checkbox).
  await frame.locator('[title="Select all visible rows"]').first().click().catch(() => {});
  await page.waitForTimeout(1000);
  const body1 = (await frame.locator("body").textContent().catch(() => "")) || "";
  const selected = Number((body1.match(/(\d+)\s+selected/) || [])[1] || 0);
  console.log("SELECTED_AFTER_SELECT_ALL:", selected, " (must be < total, ~leaf count)");
  await page.screenshot({ path: `${SHOT}/j11-selected.png`, clip: { x: 300, y: 850, width: 900, height: 100 } });

  // Bulk-set buffer Yes across the selected leaves → stages a change.
  await frame.getByRole("button", { name: /^Yes$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  const stagedAfterBulk = await isStaged(frame);
  console.log("STAGED_AFTER_BULK_BUFFER:", stagedAfterBulk);
  await page.screenshot({ path: `${SHOT}/j11-after-bulk.png`, clip: { x: 300, y: 130, width: 1200, height: 120 } });

  // CLEANUP: discard. NEVER Apply.
  if (await isStaged(frame)) {
    await frame.locator('button').filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await frame.getByRole("button", { name: /^Discard$|Confirm|Yes/i }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
  }
  const stagedAfterCleanup = await isStaged(frame);
  console.log("STAGED_AFTER_CLEANUP (should be FALSE):", stagedAfterCleanup);

  expect(total, "total issue count read").toBeGreaterThan(0);
  expect(selected, "select-all picks fewer than total (parents excluded)").toBeGreaterThan(0);
  expect(selected, "select-all excludes parents").toBeLessThan(total);
  expect(stagedAfterBulk, "bulk buffer stages a change").toBeTruthy();
  expect(stagedAfterCleanup, "cleanup left the plan clean").toBeFalsy();
});
