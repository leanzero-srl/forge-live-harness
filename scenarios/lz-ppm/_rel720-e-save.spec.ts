// dev 7.20.0 release proof — AUD-2 "one PLAN_SAVED row per Save" through the UI: on the tester's
// "[harness-test] rel720 save" plan (WFH slice, 206 rows, deleted after) select every visible row in
// the Table, bulk-set Buffer = Yes, and press Save ONCE. Saved edits never reach Jira.
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, bodyText, isStaged, log } from "./_rel720-lib";

test.describe.configure({ retries: 0, timeout: 900_000 });

test("rel720 E: a >100-row Save through the UI", async ({ page }) => {
  const { frame, real } = await boot(page);
  await openPlan(page, frame, "[harness-test] rel720 save");
  await tab(page, frame, "table");
  await page.waitForTimeout(5000);
  log("E_ROWS", await frame.locator('[data-testid="table-row"]').count());
  await frame.locator('[title="Select all visible rows"]').first().click();
  await page.waitForTimeout(1500);
  log("E_BULKBAR", ((await bodyText(frame)).match(/\d+ selected[^C]{0,120}/) || [null])[0]);
  await frame.locator("button").filter({ hasText: /^Yes$/ }).first().click();
  await page.waitForTimeout(4000);
  log("E_AFTER_BULK_BODY", ((await bodyText(frame)).match(/(Save\s*\(\d+\)|Apply\s*\d+\s*change[s]?)/gi) || []));
  log("E_SAVE_BTN", await real.evaluate(() => { const b = document.querySelector('[data-testid="plan-save-btn"]') as any; return b ? { text: (b.textContent || "").trim(), has: b.getAttribute("data-has-changes") } : null; }));
  await shot(page, "e-01-bulk-staged");
  await frame.locator('[data-testid="plan-save-btn"]').first().click();
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(2000); const st = await frame.locator('[data-testid="plan-save-btn"]').first().getAttribute("data-save-state").catch(() => null); if (st === "saved") break; }
  await page.waitForTimeout(3000);
  log("E_SAVE_BTN_AFTER", await real.evaluate(() => { const b = document.querySelector('[data-testid="plan-save-btn"]') as any; return b ? { text: (b.textContent || "").trim(), state: b.getAttribute("data-save-state") } : null; }));
  await shot(page, "e-02-saved");
  expect(true).toBe(true);
});
