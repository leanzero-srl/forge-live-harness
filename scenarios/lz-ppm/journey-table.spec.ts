// PERSISTENT journey J2 — Table: filter / sort / group-by + no-results edge.
// Adversarial: asserts behavior AND hunts (logs counts, screenshots for audit).
// Read-only/view-only (no plan mutation) — safe to run every tick.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 200_000 });

test("J2 Table: filter / sort / group / empty-edge", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const surface = await enterForgeSurface(page, { surface: "custom" });
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("no frame");
  await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  const filter = frame.getByPlaceholder(/Filter tasks/i);
  const bodyText = async () => (await frame.locator("body").textContent().catch(() => "")) || "";

  // Baseline: count text present.
  const base = await bodyText();
  const baseCount = (base.match(/(\d+)\s+issues/) || [])[1];
  console.log("BASELINE_COUNT:", baseCount);

  // --- Filter: real query ---
  await filter.fill("MVP");
  await page.waitForTimeout(900);
  const filtered = await bodyText();
  const ofMatch = filtered.match(/(\d+)\s+of\s+(\d+)/);
  console.log("FILTER_MVP_OF:", ofMatch ? `${ofMatch[1]} of ${ofMatch[2]}` : "none");
  await page.screenshot({ path: `${SHOT}/j2-filter.png`, clip: { x: 310, y: 230, width: 1190, height: 400 } });
  // hunt: filtered count must be > 0 and < total
  const fN = ofMatch ? Number(ofMatch[1]) : -1, fTot = ofMatch ? Number(ofMatch[2]) : -1;
  console.log("FILTER_OK:", fN > 0 && fN < fTot);

  // --- Filter: no-results edge ---
  await filter.fill("zzq_nomatch_999");
  await page.waitForTimeout(900);
  const noRes = await bodyText();
  const emptyShown = /No tasks match/i.test(noRes);
  console.log("EMPTY_STATE_SHOWN:", emptyShown);
  await page.screenshot({ path: `${SHOT}/j2-empty.png`, clip: { x: 310, y: 230, width: 1190, height: 300 } });

  // --- Clear filter → back to baseline ---
  await filter.fill("");
  await page.waitForTimeout(700);
  const cleared = await bodyText();
  const clearedCount = (cleared.match(/(\d+)\s+issues/) || [])[1];
  console.log("CLEARED_COUNT:", clearedCount, "(== baseline?", clearedCount === baseCount, ")");

  // --- Sort by DURATION (click header twice = asc/desc) ---
  await frame.getByText(/^DURATION$/i).first().click().catch(() => {});
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOT}/j2-sort-dur.png`, clip: { x: 310, y: 230, width: 1190, height: 500 } });
  console.log("SORTED_DURATION: (audit screenshot for non-decreasing order)");

  // --- Group-by via custom Select ---
  const groupSel = frame.getByText("No grouping").first();
  const groupSelVisible = await groupSel.isVisible().catch(() => false);
  console.log("GROUP_SELECT_FOUND:", groupSelVisible);
  if (groupSelVisible) {
    await groupSel.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOT}/j2-group-open.png` });
    // pick the first non-"No grouping" option (listbox)
    const opts = frame.getByRole("option");
    const optCount = await opts.count().catch(() => 0);
    console.log("GROUP_OPTIONS:", optCount);
    if (optCount > 1) {
      await opts.nth(1).click().catch(() => {});
      await page.waitForTimeout(900);
      const grouped = await bodyText();
      const grpMatch = grouped.match(/(\d+)\s+group/);
      console.log("GROUPED:", grpMatch ? grpMatch[0] : "no 'group' text found");
      await page.screenshot({ path: `${SHOT}/j2-grouped.png`, clip: { x: 310, y: 230, width: 1190, height: 500 } });
    }
  }

  // Hard assertions (the ones I'm confident about):
  expect(fN, "filtered count > 0").toBeGreaterThan(0);
  expect(fN, "filtered count < total").toBeLessThan(fTot);
  expect(emptyShown, "no-results empty state shown").toBeTruthy();
  expect(clearedCount, "clearing filter restores baseline").toBe(baseCount);
});
