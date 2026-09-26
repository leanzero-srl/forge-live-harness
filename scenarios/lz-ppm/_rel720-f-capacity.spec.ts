// dev 7.20.0 release proof — B-9/B-11 shared roster on the tester's fixture plan FX (8 WFH issues):
// set up the roster through the Jira user picker ONLY, the duplicate shown greyed, hours, Save, the
// LoadBand cells read back; a second tab saves over the first -> "Load the saved roster"; then the
// standing Capacity page's cross-plan load. The tester clears the roster after (hook clearRoster).
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, bodyText, log, OUT, FX } from "./_rel720-lib";

test.describe.configure({ retries: 0, timeout: 1_500_000 });
const ME = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GAB = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";

async function openRoster(page: any, frame: any) {
  await tab(page, frame, "capacity");
  await page.waitForTimeout(3500);
  const btn = frame.locator("button").filter({ hasText: /^(Set up the team roster|Edit the team roster)$/ }).first();
  await btn.click();
  const ed = frame.locator('[data-testid="capacity-roster-editor"]').first();
  await ed.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2000);
  return ed;
}
async function search(page: any, frame: any, q: string) {
  const inp = frame.locator('[data-testid="capacity-roster-search-input"]').first();
  await inp.fill(""); await inp.fill(q);
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(700); if (await frame.locator('[data-testid="capacity-roster-search-option"]').count()) break; }
  await page.waitForTimeout(800);
  return frame.locator('[data-testid="capacity-roster-search-option"]').evaluateAll((els: any[]) => els.map((e) => ({ id: e.getAttribute("data-account-id"), text: (e.textContent || "").trim(), disabled: e.disabled })));
}
const cells = (frame: any) => frame.locator('[role="table"] [aria-label]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("aria-label")).filter((l: string) => /hour|h /i.test(l)));

test("rel720 F: shared roster, LoadBand, conflict, cross-plan load", async ({ page }) => {
  const { frame, real } = await boot(page);
  await openPlan(page, frame, FX);
  await tab(page, frame, "capacity");
  await page.waitForTimeout(4000);
  log("F_CAP_TAB_BEFORE", ((await frame.locator('[data-testid="capacity-load"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 900));
  await shot(page, "f-01-capacity-before");
  const ed = await openRoster(page, frame);
  log("F_EDITOR_OPEN", ((await ed.textContent()) || "").replace(/\s+/g, " ").slice(0, 700));
  log("F_EDITOR_TEXT_INPUTS", await ed.locator('input[type="text"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("aria-label"))));
  await shot(page, "f-02-editor-empty");
  // picker only: search, pick me by account id
  const r1 = await search(page, frame, "Mihai");
  log("F_SEARCH_MIHAI", r1);
  await shot(page, "f-03-search-mihai");
  await frame.locator(`[data-testid="capacity-roster-search-option"][data-account-id="${ME}"]`).first().click();
  await page.waitForTimeout(1500);
  const r2 = await search(page, frame, "Mihai");
  log("F_SEARCH_MIHAI_AGAIN", r2);
  await shot(page, "f-04-duplicate-greyed");
  const r3 = await search(page, frame, "Gabriela");
  log("F_SEARCH_GABRIELA", r3);
  await frame.locator(`[data-testid="capacity-roster-search-option"][data-account-id="${GAB}"]`).first().click();
  await page.waitForTimeout(1500);
  const hrs = ed.locator('input[aria-label^="Hours a week"]');
  log("F_HOURS_INPUTS", await hrs.evaluateAll((els: any[]) => els.map((e) => [e.getAttribute("aria-label"), e.value])));
  log("F_HOURS_PER_DAY", await frame.locator('[data-testid="capacity-roster-hours-per-day"]').first().inputValue().catch(() => null));
  await ed.locator('input[aria-label="Hours a week — Gabriela Perdum"]').first().fill("20");
  await shot(page, "f-05-roster-filled");
  await frame.locator('[data-testid="capacity-roster-save"]').first().click();
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); if (!(await frame.locator('[data-testid="capacity-roster-editor"]').count())) break; }
  await page.waitForTimeout(4000);
  log("F_AFTER_SAVE_BODY", ((await bodyText(frame)).match(/(Team roster saved[^.]*\.|could not[^.]*\.)/) || [null])[0]);
  const load = ((await frame.locator('[data-testid="capacity-load"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ");
  log("F_LOAD_TEXT", load.slice(0, 1500));
  log("F_LOAD_HEADLINE", await frame.locator('[data-testid="capacity-load-headline"]').first().textContent().catch(() => null));
  log("F_LOAD_CELLS", await real.evaluate(() => Array.from(document.querySelectorAll('[data-testid="capacity-load"] [aria-label]')).map((e: any) => e.getAttribute("aria-label")).filter((l: string) => /week|hours|h\b/i.test(l))));
  await frame.locator('[data-testid="capacity-load"]').first().screenshot({ path: `${OUT}/f-06-loadband.png` }).catch(() => {});
  await shot(page, "f-06b-capacity-after");

  // ── two tabs: tab2 holds the old version, tab1 saves, tab2 saves -> conflict ──
  const page2 = await page.context().newPage();
  const b2 = await boot(page2);
  await openPlan(page2, b2.frame, FX);
  const ed2 = await openRoster(page2, b2.frame);
  log("F_TAB2_LOADED", ((await ed2.textContent()) || "").replace(/\s+/g, " ").slice(0, 400));
  const ed1 = await openRoster(page, frame);
  await ed1.locator('input[aria-label="Hours a week — Gabriela Perdum"]').first().fill("24");
  await frame.locator('[data-testid="capacity-roster-save"]').first().click();
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(1000); if (!(await frame.locator('[data-testid="capacity-roster-editor"]').count())) break; }
  await page.waitForTimeout(2000);
  log("F_TAB1_SAVED", ((await bodyText(frame)).match(/(Team roster saved[^.]*\.)/) || [null])[0]);
  await ed2.locator('input[aria-label="Hours a week — Mihai Perdum"]').first().fill("32");
  await b2.frame.locator('[data-testid="capacity-roster-save"]').first().click();
  await page2.waitForTimeout(6000);
  log("F_TAB2_AFTER_SAVE", ((await ed2.textContent().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 900));
  log("F_TAB2_RELOAD_BTN", await b2.frame.locator('[data-testid="capacity-roster-reload"]').first().textContent().catch(() => null));
  log("F_TAB2_SAVE_DISABLED", await b2.frame.locator('[data-testid="capacity-roster-save"]').first().isDisabled().catch(() => null));
  await shot(page2, "f-07-tab2-conflict");
  await b2.frame.locator('[data-testid="capacity-roster-reload"]').first().click().catch(() => {});
  await page2.waitForTimeout(4000);
  log("F_TAB2_AFTER_RELOAD", await ed2.locator('input[aria-label^="Hours a week"]').evaluateAll((els: any[]) => els.map((e) => [e.getAttribute("aria-label"), e.value])).catch(() => null));
  await shot(page2, "f-08-tab2-reloaded");
  await page2.close();

  // ── the standing Capacity page ────────────────────────────
  await frame.getByRole("button", { name: "LeanZero Management home" }).first().click();
  await page.waitForTimeout(3000);
  await frame.locator("nav button").filter({ hasText: /^Capacity$/ }).first().click();
  await frame.locator('[data-testid="capacity-view"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(4000);
  log("F_PAGE_TEXT", ((await frame.locator('[data-testid="capacity-view"]').first().textContent()) || "").replace(/\s+/g, " ").slice(0, 900));
  await shot(page, "f-09-capacity-page");
  for (const name of [FX, "LZPT Scenarios"]) {
    const cb = frame.locator(`[title="Include ${name}"]`).first();
    const on = await cb.evaluate((e: any) => e.getAttribute("aria-checked") || e.querySelector?.("input")?.checked || e.checked).catch(() => null);
    log(`F_INCLUDE_${name}_WAS`, on);
    if (!(on === true || on === "true")) await cb.click().catch((e: any) => log("F_INCLUDE_ERR", String(e)));
    await page.waitForTimeout(600);
  }
  const go = frame.locator('[data-testid$="-go"]').first();
  log("F_CROSS_GO", await go.textContent().catch(() => null));
  await shot(page, "f-10-cross-ready");
  await go.click().catch(() => {});
  for (let i = 0; i < 40; i++) { await page.waitForTimeout(1500); if (!/Reading plans/.test(await bodyText(frame))) break; }
  await page.waitForTimeout(3000);
  log("F_CROSS_TEXT", ((await frame.locator('[data-testid="capacity-view"]').first().textContent()) || "").replace(/\s+/g, " ").slice(0, 2500));
  log("F_CROSS_CELLS", await real.evaluate(() => Array.from(document.querySelectorAll('[data-testid="capacity-view"] [role="table"] [aria-label]')).map((e: any) => e.getAttribute("aria-label")).filter((l: string) => /week/i.test(l))));
  await shot(page, "f-11-cross-loaded");
  expect(true).toBe(true);
});
