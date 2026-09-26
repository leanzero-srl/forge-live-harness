// dev 7.19.0 release proof — bed check at exit: a cold open of LZPT stages nothing.
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, isStaged, log } from "./_rel719-lib";
test.describe.configure({ retries: 0, timeout: 300_000 });
test("rel719 F: LZPT cold open stages nothing", async ({ page }) => {
  const { frame } = await boot(page);
  await openPlan(page, frame);
  await page.waitForTimeout(12_000);
  log("F_STAGED_GANTT", await isStaged(frame));
  await tab(page, frame, "table");
  await page.waitForTimeout(5000);
  const staged = await isStaged(frame);
  log("F_STAGED_TABLE", staged);
  log("F_SAVE", await frame.locator('[data-testid="plan-save-btn"]').first().textContent().catch(() => null));
  log("F_APPLY", await frame.locator('[data-testid="plan-apply-btn"]').count());
  await shot(page, "f-coldopen");
  expect(staged, "STAGED_AFTER_CLEANUP=false").toBe(false);
});
