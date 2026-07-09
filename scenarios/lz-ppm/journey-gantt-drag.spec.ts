// PERSISTENT journey J3 — Gantt bar drag. Verifies: (a) a PARENT bar is NOT draggable
// (rolls up from children — matches the Table read-only fix; the drag handler gates on
// isParent), (b) a LEAF bar IS draggable → stages a change. Discards to leave clean.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 200_000 });

async function dragBar(page: any, box: any, dx: number) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 4 });
  await page.mouse.up();
}
// Robust "is there a staged change?" via body text (the animated Apply/Save button
// defeats getByRole name matching).
async function isStaged(frame: any): Promise<boolean> {
  const t = (await frame.locator("body").textContent().catch(() => "")) || "";
  return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t);
}

test("J3 gantt: parent bar not draggable, leaf bar draggable", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);

  const parentBars = frame.locator('[data-testid="gantt-bar"][data-parent="true"]');
  const leafBars = frame.locator('[data-testid="gantt-bar"][data-parent="false"]');
  console.log("PARENT_BARS:", await parentBars.count().catch(() => 0), " LEAF_BARS:", await leafBars.count().catch(() => 0));

  // (a) Drag a PARENT bar → must NOT stage a change (gated).
  const stagedBefore = await isStaged(frame); // may be true if a prior run left a draft
  const pBox = await parentBars.first().boundingBox().catch(() => null);
  if (pBox) await dragBar(page, pBox, 90);
  await page.waitForTimeout(900);
  const stagedAfterParent = await isStaged(frame);
  console.log("STAGED_BEFORE:", stagedBefore, " STAGED_AFTER_PARENT_DRAG:", stagedAfterParent, "(parent drag must not ADD one)");
  await page.screenshot({ path: `${SHOT}/j3-after-parent-drag.png` });

  // (b) Drag a LEAF bar → SHOULD stage a change.
  const lBox = await leafBars.first().boundingBox().catch(() => null);
  console.log("LEAF_BOX_FOUND:", !!lBox);
  if (lBox) await dragBar(page, lBox, 90);
  await page.waitForTimeout(1200);
  const stagedAfterLeaf = await isStaged(frame);
  console.log("STAGED_AFTER_LEAF_DRAG (should be TRUE):", stagedAfterLeaf);
  await page.screenshot({ path: `${SHOT}/j3-after-leaf-drag.png` });

  // CLEANUP: discard any staged change (incl. a lingering prior-run draft). NEVER Apply.
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

  // parent drag must not ADD a staged change beyond whatever was already there.
  expect(stagedAfterParent, "parent bar drag must not stage a NEW change").toBe(stagedBefore);
  expect(stagedAfterLeaf, "leaf bar drag stages a change").toBeTruthy();
  expect(stagedAfterCleanup, "cleanup left the plan clean").toBeFalsy();
});
