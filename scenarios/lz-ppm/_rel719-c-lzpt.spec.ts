// dev 7.19.0 release proof — LZPT MUTATING lane. (b) rename through the app's own resolver door
// (restored), step 3 admin half (Settings → Maintenance limits), step 16 Save/Apply tooltips (then
// Discard All), and ONE date Applied to Jira on LZPT-216 (due 2026-05-12 → 05-13), then restored by a
// second Apply. Every change is reversed here; the tester re-checks the bed from the hook afterwards.
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, realHover, bodyText, isStaged, log, invokeInFrame, PLAN_ID, PLAN, T } from "./_rel719-lib";
import { getTarget } from "../../config/targets";
import { enterForgeSurface } from "../../forge/frame";

test.describe.configure({ retries: 0, timeout: 1_800_000 });
const KEY_A = "LZPT-216", KEY_B = "LZPT-222";

async function jiraDue(page: any, key: string) {
  return page.evaluate(async (k: string) => { const r = await fetch(`/rest/api/3/issue/${k}?fields=duedate,customfield_10015`, { credentials: "include" }); const d = await r.json(); return { due: d.fields?.duedate, start: d.fields?.customfield_10015 }; }, key);
}
/** Click the Table cell for `field` on `key` and pick `iso` in the picker. */
async function setTableDate(page: any, frame: any, real: any, key: string, field: string, iso: string) {
  const idx = await real.evaluate((f: string) => {
    const hdr = document.querySelector(`[data-testid="table-sort-${f}"]`);
    if (!hdr) return -1;
    const cells = Array.from(hdr.parentElement!.children);
    return cells.indexOf(hdr);
  }, field);
  const row = frame.locator(`[data-testid="table-row"][data-row-key="${key}"]`).first();
  await row.scrollIntoViewIfNeeded();
  const cell = row.locator(":scope > *").nth(idx);
  await cell.click();
  await page.waitForTimeout(900);
  for (let i = 0; i < 8; i++) {
    const b = frame.locator(`.lz-datepicker button[aria-label="${iso}"]`).first();
    if (await b.count()) { await b.dispatchEvent("click"); await page.waitForTimeout(1500); return idx; }
    const anyDay = await frame.locator('.lz-datepicker button[aria-label^="20"]').first().getAttribute("aria-label").catch(() => null);
    const nav = anyDay && anyDay.slice(0, 7) > iso.slice(0, 7) ? "Previous month" : "Next month";
    await frame.locator(".lz-datepicker").getByRole("button", { name: nav }).first().dispatchEvent("click");
    await page.waitForTimeout(300);
  }
  return -2;
}
async function tipOf(page: any, frame: any, loc: any) {
  await page.mouse.move(3, 3); await page.waitForTimeout(400);
  await realHover(page, loc);
  await page.waitForTimeout(800);
  return frame.locator('[data-testid="lz-tooltip"]').last().textContent().catch(() => null);
}
async function applyAll(page: any, frame: any, tag: string) {
  await frame.locator('[data-testid="plan-apply-btn"]').first().click();
  await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2500);
  const rows = await frame.locator('[data-testid="apply-change-row"]').allTextContents();
  log(`${tag}_REVIEW_ROWS`, rows.map((r: string) => r.replace(/\s+/g, " ")));
  await shot(page, `${tag}-review`);
  await frame.locator('[data-testid="apply-review-modal"]').getByRole("button", { name: /Apply \d+ Change/i }).first().click();
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(2000);
    const t = await bodyText(frame);
    const ph = (t.match(/(Writing to Jira|Verifying|Applied[^.]{0,80}|Apply failed[^.]{0,120})/) || [null])[0];
    if (i % 5 === 0) log(`${tag}_PHASE_${i}`, ph);
    if (/Applied|Apply failed/.test(ph || "") || (!(await isStaged(frame)) && i > 3)) break;
  }
  await page.waitForTimeout(3000);
  await shot(page, `${tag}-done`);
  log(`${tag}_BODY_AFTER`, ((await bodyText(frame)).match(/(Applied[^.]*\.|Apply failed[^.]*\.|written[^.]*\.)/) || [null])[0]);
  // close any result modal
  await frame.getByRole("button", { name: /^(Close|Done|OK)$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
}

test("rel719 C: LZPT rename, maintenance limits, save/apply tips, one-date apply + restore", async ({ page }) => {
  const { frame, real } = await boot(page);
  await openPlan(page, frame);
  log("C_STAGED_ON_OPEN", await isStaged(frame));
  // ── (b) rename through the screens door, then restore ──
  const r1 = await invokeInFrame(real, "updatePlan", { planId: PLAN_ID, changes: { name: `${PLAN} REL719` } });
  log("B_RENAME_1", JSON.stringify(r1).slice(0, 300));
  await page.waitForTimeout(90_000); // the tester reads ?resource=audit&group=plans in this window (marker below)
  const r2 = await invokeInFrame(real, "updatePlan", { planId: PLAN_ID, changes: { name: PLAN } });
  log("B_RENAME_2", JSON.stringify(r2).slice(0, 300));
  // ── step 16 ──
  await tab(page, frame, "table");
  await page.waitForTimeout(2500);
  const jA0 = await jiraDue(page, KEY_A), jB0 = await jiraDue(page, KEY_B);
  log("C_JIRA_BEFORE", { [KEY_A]: jA0, [KEY_B]: jB0 });
  log("S16_SAVE_TIP_IDLE", await frame.locator('[data-testid="plan-save-btn"]').first().getAttribute("title"));
  log("S16_EDIT_A_IDX", await setTableDate(page, frame, real, KEY_A, "dueDate", "2026-05-13"));
  log("S16_SAVE_BTN_1", await frame.locator('[data-testid="plan-save-btn"]').first().textContent());
  log("S16_SAVE_TIP_1", await tipOf(page, frame, frame.locator('[data-testid="plan-save-btn"]').first()));
  await frame.locator('[data-testid="plan-save-btn"]').first().click();
  await page.waitForTimeout(4000);
  log("S16_SAVE_BTN_AFTER_SAVE", await frame.locator('[data-testid="plan-save-btn"]').first().textContent());
  log("S16_EDIT_B_IDX", await setTableDate(page, frame, real, KEY_B, "dueDate", "2026-05-12"));
  log("S16_SAVE_BTN_2", await frame.locator('[data-testid="plan-save-btn"]').first().textContent());
  log("S16_APPLY_BTN_2", await frame.locator('[data-testid="plan-apply-btn"]').first().textContent());
  log("S16_APPLY_TIP", await tipOf(page, frame, frame.locator('[data-testid="plan-apply-btn"]').first()));
  await shot(page, "s16-apply-tip");
  log("S16_SAVE_TIP_2", await tipOf(page, frame, frame.locator('[data-testid="plan-save-btn"]').first()));
  await shot(page, "s16-save-tip");
  // ── discard everything ──
  await frame.locator('[data-testid="plan-apply-btn"]').first().click();
  await frame.locator('[data-testid="apply-review-modal"]').first().waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500);
  log("S16_REVIEW_ROWS", (await frame.locator('[data-testid="apply-change-row"]').allTextContents()).map((r: string) => r.replace(/\s+/g, " ")));
  await frame.getByRole("button", { name: /Discard All/i }).first().click();
  await page.waitForTimeout(1500);
  await frame.getByRole("button", { name: /^(Discard|Discard all|Discard All changes|Yes)/i }).last().click().catch(() => {});
  await page.waitForTimeout(4000);
  log("C_STAGED_AFTER_DISCARD", await isStaged(frame));
  await shot(page, "c-after-discard");
  // ── (b) ONE date applied ──
  log("B_EDIT_IDX", await setTableDate(page, frame, real, KEY_A, "dueDate", "2026-05-13"));
  log("B_APPLY_BTN", await frame.locator('[data-testid="plan-apply-btn"]').first().textContent());
  await applyAll(page, frame, "b-apply1");
  const jA1 = await jiraDue(page, KEY_A);
  log("B_JIRA_AFTER_APPLY", jA1);
  console.log("MARKER_APPLY_DONE — the tester reads APPLY_WRITTEN now");
  await page.waitForTimeout(20_000);
  // ── restore via a second Apply ──
  await tab(page, frame, "table");
  await page.waitForTimeout(2000);
  log("B_RESTORE_IDX", await setTableDate(page, frame, real, KEY_A, "dueDate", "2026-05-12"));
  await applyAll(page, frame, "b-apply2");
  const jA2 = await jiraDue(page, KEY_A);
  log("B_JIRA_AFTER_RESTORE", jA2);
  log("C_END_STAGED", await isStaged(frame));
  expect(jA1.due, "Apply wrote the new due").toBe("2026-05-13");
  expect(jA2.due, "restore wrote the old due back").toBe(jA0.due);
  // ── step 3 admin half: Settings → Maintenance ──
  const A = getTarget("lz-ppm-admin");
  await page.goto(A.deepLink(A.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const af: any = s.kind === "custom" ? s.frame : null;
  await af.getByText("Maintenance", { exact: true }).first().click({ timeout: 60_000 });
  await page.waitForTimeout(5000);
  const inputs = await af.locator("input").evaluateAll((els: any[]) => els.map((e) => ({ v: e.value, l: (e.closest("label")?.textContent || "").replace(/\s+/g, " ").trim() })));
  log("S3_MAINT_INPUTS", inputs);
  log("S3_MAINT_TEXT", ((await af.locator("body").textContent()) || "").replace(/\s+/g, " ").match(/AI[^]{0,600}/)?.[0]);
  await shot(page, "s3-maintenance");
});
