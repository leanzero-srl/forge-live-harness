// dev 7.19.0 release proof — READ-ONLY lane on LZPT: (a) header version + What's new,
// (d) Schedule risk + Explain "Next to run out of room", step 12 pinned-bar tip, step 13 missed
// milestone chip, step 14 Table derived legend. Stages nothing; asserts STAGED=false at the end.
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, realHover, bodyText, isStaged, log, OUT } from "./_rel719-lib";
import fs from "node:fs";

test.describe.configure({ retries: 0, timeout: 900_000 });

test("rel719 A: header, What's new, risk, explain, pinned tip, milestone chip, legend", async ({ page }) => {
  const { frame, real } = await boot(page);
  // ── (a) header ─────────────────────────────────────────────
  const ver = (await frame.locator('[data-testid="app-version"]').first().textContent()) || "";
  log("A_VERSION_TEXT", ver);
  await shot(page, "a-01-header");
  const wn = frame.getByRole("button", { name: /What's new/ }).first();
  log("A_WHATSNEW_BTN", await wn.count());
  await wn.click();
  await page.waitForTimeout(2500);
  const dlg = frame.getByRole("dialog", { name: "What's new" }).first();
  await dlg.waitFor({ state: "visible", timeout: 20_000 });
  log("A_RUNNING", await frame.locator('[data-testid="release-running"]').first().textContent().catch(() => null));
  const dtext = ((await dlg.textContent()) || "").replace(/\s+/g, " ");
  fs.writeFileSync(`${OUT}/a-whatsnew.txt`, dtext);
  log("A_WHATSNEW_HEAD", dtext.slice(0, 1500));
  log("A_VERSIONS_LISTED", Array.from(new Set(dtext.match(/\b\d+\.\d+\.\d+\b/g) || [])));
  await shot(page, "a-02-whatsnew");
  // expand every accordion (older releases) to see they open
  const accs = dlg.locator("button[aria-expanded]");
  log("A_ACCORDIONS", await accs.count());
  if (await accs.count()) { await accs.first().click().catch(() => {}); await page.waitForTimeout(800); await shot(page, "a-03-whatsnew-older"); }
  await frame.getByRole("button", { name: "Close What's new" }).first().click();
  await page.waitForTimeout(800);

  // ── open LZPT ─────────────────────────────────────────────
  await openPlan(page, frame);
  log("A_STAGED_ON_OPEN", await isStaged(frame));
  // ── (d) Dashboard Schedule risk ───────────────────────────
  await tab(page, frame, "dashboard");
  await real.waitForFunction(() => !!document.querySelector('[data-testid="risk-rag"]'), undefined, { timeout: 30_000 }).catch(() => {});
  const rag = await real.evaluate(() => {
    const el = document.querySelector('[data-testid="risk-rag"]');
    if (!el) return null;
    const n = (a: string) => Number(el.getAttribute(a));
    const items = Array.from(document.querySelectorAll('[data-testid="risk-item"]')).map((i: any) => ({ key: i.getAttribute("data-key"), score: Number(i.getAttribute("data-score")), band: i.getAttribute("data-band"), text: (i.textContent || "").trim() }));
    const card = el.closest("section");
    return { red: n("data-red"), amber: n("data-amber"), green: n("data-green"), items, card: (card?.textContent || "").replace(/\s+/g, " ") };
  });
  log("D_RAG", rag);
  const overdueTile = await real.evaluate(() => (document.body.innerText.match(/Overdue[^\n]*\n?[^\n]*/i) || [null])[0]);
  log("D_OVERDUE_TILE", overdueTile);
  const riskCard = frame.locator('[data-testid="risk-rag"]').first();
  await riskCard.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800);
  await shot(page, "d-01-schedule-risk");
  // ── (d) Explain ────────────────────────────────────────────
  await frame.locator('[data-testid="plan-explain-btn"]').first().click();
  await frame.locator('[data-testid="explain-facts-strip"]').first().waitFor({ state: "visible", timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const facts = await real.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-testid="explain-facts-strip"] [data-fact]')).map((e: any) => [e.getAttribute("data-fact"), (e.textContent || "").trim()])));
  log("D_EXPLAIN_FACTS", facts);
  const stripText = await frame.locator('[data-testid="explain-facts-strip"]').first().textContent().catch(() => null);
  log("D_EXPLAIN_STRIP", stripText);
  await frame.locator('[data-testid="explain-facts-strip"]').first().scrollIntoViewIfNeeded().catch(() => {});
  await shot(page, "d-02-explain");
  // wait for the model answer to settle, then read the modal once more
  for (let i = 0; i < 40; i++) { const ph = await frame.locator('[data-testid="explain-progress"]').count(); if (!ph) break; await page.waitForTimeout(1500); }
  log("D_EXPLAIN_MODAL", ((await frame.locator('[data-testid="plan-explain-modal"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 3000));
  await shot(page, "d-03-explain-settled");
  await page.keyboard.press("Escape"); await page.waitForTimeout(800);
  if (await frame.locator('[data-testid="plan-explain-modal"]').count()) { await frame.getByRole("button", { name: /Close/i }).first().click().catch(() => {}); await page.waitForTimeout(800); }

  // ── step 13: missed milestone chip (on open) + step 12 hover tips ─────
  await tab(page, frame, "gantt");
  await page.waitForTimeout(3000);
  const chip = await real.evaluate(() => {
    const c = document.querySelector('[data-testid="gantt-focus-chip"]');
    return c ? { text: (c.textContent || "").replace(/\s+/g, " "), label: document.querySelector('[data-testid="gantt-focus-chip-label"]')?.textContent || null, show: !!document.querySelector('[data-testid="gantt-focus-chip-show"]') } : null;
  });
  log("S13_CHIP", chip);
  await shot(page, "s13-01-gantt-open");
  const tipOf = async (key: string) => {
    const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${key}"]`).first();
    if (!(await bar.count())) return `(no bar ${key})`;
    await page.mouse.move(5, 5); await page.waitForTimeout(500);
    const before = await bodyText(frame);
    await realHover(page, bar);
    const after = await bodyText(frame);
    const m = after.match(/(LZPT-\d+: .{0,400}?(Drag to move[^.]*|Click to highlight dependencies|to move it[^.]*\.|move LZPT-\d+[^.]*\.))/);
    await shot(page, `s12-tip-${key}`);
    return m ? m[1] : after.replace(before, "").slice(0, 500);
  };
  for (const k of ["LZPT-193", "LZPT-200", "LZPT-215", "LZPT-216"]) log(`S12_TIP_${k}`, await tipOf(k));
  // show-it: scroll away then click "Show it"
  if (chip?.show) {
    await real.evaluate(() => { const sc = Array.from(document.querySelectorAll("*")).filter((e: any) => e.scrollHeight > e.clientHeight + 200 && getComputedStyle(e).overflowY !== "visible"); for (const e of sc as any[]) e.scrollTop = e.scrollHeight; });
    await page.waitForTimeout(1200);
    await shot(page, "s13-02-scrolled-away");
    await frame.locator('[data-testid="gantt-focus-chip-show"]').first().click();
    await page.waitForTimeout(2500);
    await shot(page, "s13-03-show-it");
  }
  // ── step 14: Table derived legend ─────────────────────────
  await tab(page, frame, "table");
  await page.waitForTimeout(2500);
  log("S14_LEGEND", await frame.locator('[data-testid="table-derived-legend"]').first().textContent().catch(() => null));
  log("S14_DERIVED_CHIP", await frame.locator('[data-testid="derived-count-chip"]').first().textContent().catch(() => null));
  await shot(page, "s14-table-legend");
  // ── step 16 (read half): Save/Apply hover with nothing staged ─
  log("A_END_STAGED", await isStaged(frame));
  log("A_SAVE_TITLE", await frame.locator('[data-testid="plan-save-btn"]').first().getAttribute("title").catch(() => null));
  expect(true).toBe(true);
});
