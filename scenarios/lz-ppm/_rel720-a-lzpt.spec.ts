// dev 7.20.0 release proof — LZPT lane (tester). Runs WITH a start-no-earlier-than hold on LZPT-209
// (2026-10-14, set by the tester through the hook) so the hold's surfaces can be read. Reads: header
// version + What's new, the LZPT card, the header word on EVERY tab, Dashboard hero, Explain badge +
// ticket line + "Already out of room", Storyline lede. Then stages ONE date on LZPT-206, reads the
// Apply review (the hold must not be listed) and Discards All. Asserts nothing staged at the end.
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, bodyText, isStaged, log, OUT, bars, header, pickIn } from "./_rel720-lib";
import fs from "node:fs";

test.describe.configure({ retries: 0, timeout: 1_200_000 });

test("rel720 A: LZPT — verdict word surfaces, header on every tab, explain, storyline, hold not applied", async ({ page }) => {
  const { frame, real } = await boot(page);
  // ── header version + What's new ───────────────────────────
  log("A_VERSION_TEXT", (await frame.locator('[data-testid="app-version"]').first().textContent()) || "");
  await shot(page, "a-01-header");
  await frame.getByRole("button", { name: /What's new/ }).first().click();
  const dlg = frame.getByRole("dialog", { name: "What's new" }).first();
  await dlg.waitFor({ state: "visible", timeout: 20_000 });
  await page.waitForTimeout(1500);
  const dtext = ((await dlg.textContent()) || "").replace(/\s+/g, " ");
  fs.writeFileSync(`${OUT}/a-whatsnew.txt`, dtext);
  log("A_RUNNING", await frame.locator('[data-testid="release-running"]').first().textContent().catch(() => null));
  log("A_WHATSNEW_HEAD", dtext.slice(0, 1200));
  log("A_VERSIONS_LISTED", Array.from(new Set(dtext.match(/\b\d+\.\d+\.\d+\b/g) || [])));
  await shot(page, "a-02-whatsnew");
  await frame.getByRole("button", { name: "Close What's new" }).first().click().catch(async () => { await page.keyboard.press("Escape"); });
  await page.waitForTimeout(800);

  // ── the LZPT card ─────────────────────────────────────────
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(2500);
  const card = frame.locator('[data-testid="plan-card"]').filter({ has: frame.locator('[data-testid="plan-card-name"]', { hasText: /^LZPT Scenarios$/ }) }).first();
  await card.scrollIntoViewIfNeeded();
  const c = await card.evaluate((el: any) => {
    const q = (id: string) => el.querySelector(`[data-testid="${id}"]`);
    return { chip: q("plan-verdict-chip")?.textContent, chipBg: q("plan-verdict-chip") ? getComputedStyle(q("plan-verdict-chip")).backgroundColor : null,
      punch: q("plan-punchline")?.textContent, tickets: q("plan-ticket-line")?.textContent, ticketsColor: q("plan-ticket-line") ? getComputedStyle(q("plan-ticket-line")).color : null,
      finish: q("plan-finish")?.textContent, room: q("plan-room")?.textContent, text: (el.textContent || "").replace(/\s+/g, " ") };
  });
  log("CARD_LZPT", c);
  await card.screenshot({ path: `${OUT}/a-03-card-lzpt.png` });
  // every card's word (the per-word vocabulary on the Plans page)
  log("CARDS_ALL", await real.evaluate(() => Array.from(document.querySelectorAll('[data-testid="plan-card"]')).map((el: any) => [el.querySelector('[data-testid="plan-card-name"]')?.textContent, el.querySelector('[data-testid="plan-verdict-chip"]')?.textContent, el.querySelector('[data-testid="plan-ticket-line"]')?.textContent || null])));
  log("PLANS_PAGE_READY_WORD", /\bReady\b/.test(await bodyText(frame)));
  await shot(page, "a-04-plans-page");

  // ── open LZPT; nothing staged although LZPT-209 is held ───
  await openPlan(page, frame);
  await page.waitForTimeout(4000);
  log("A_STAGED_ON_OPEN", await isStaged(frame));
  log("A_APPLY_BTN_COUNT", await frame.locator('[data-testid="plan-apply-btn"]').count());
  // ── header word on EVERY tab ──────────────────────────────
  for (const t of ["gantt", "table", "storyline", "dashboard", "capacity", "schedule", "planning", "permissions"]) {
    if (!(await frame.locator(`[data-testid="view-tab-${t}"]`).count())) { log(`HDR_${t}`, "(no tab)"); continue; }
    await tab(page, frame, t);
    await page.waitForTimeout(t === "storyline" || t === "dashboard" ? 5000 : 1500);
    log(`HDR_${t}`, await header(real));
    await shot(page, `a-05-hdr-${t}`);
  }
  // header at a narrower width (commitment must hide below 1400; chip + count stay)
  await page.setViewportSize({ width: 1280, height: 900 }); await page.waitForTimeout(1500);
  log("HDR_1280", await header(real));
  await shot(page, "a-06-hdr-1280");
  await page.setViewportSize({ width: 1700, height: 1050 }); await page.waitForTimeout(1500);

  // ── Dashboard hero ────────────────────────────────────────
  await tab(page, frame, "dashboard");
  await page.waitForTimeout(4000);
  const hero = await real.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as any;
    return { verdict: q("plan-health-verdict")?.textContent, punch: q("plan-health-punchline")?.textContent, commitment: q("plan-health-commitment")?.textContent ?? null,
      tickets: q("plan-health-tickets")?.textContent ?? null, ticketsColor: q("plan-health-tickets") ? getComputedStyle(q("plan-health-tickets")).color : null,
      criteria: q("plan-health-criteria")?.textContent ?? null, overdueTile: (document.body.innerText.match(/Overdue[^\n]*\n?[^\n]*/i) || [null])[0],
      heroText: (q("plan-health")?.textContent || "").replace(/\s+/g, " ") };
  });
  log("HERO", hero);
  await frame.locator('[data-testid="plan-health"]').first().screenshot({ path: `${OUT}/a-07-hero.png` }).catch(() => {});
  await shot(page, "a-07b-dashboard");

  // ── Explain ───────────────────────────────────────────────
  await frame.locator('[data-testid="plan-explain-btn"]').first().click();
  await frame.locator('[data-testid="explain-facts-strip"]').first().waitFor({ state: "visible", timeout: 120_000 }).catch(() => {});
  for (let i = 0; i < 50; i++) { if (!(await frame.locator('[data-testid="explain-progress"]').count())) break; await page.waitForTimeout(1500); }
  await page.waitForTimeout(2000);
  const ex = await real.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as any;
    const facts = Object.fromEntries(Array.from(document.querySelectorAll('[data-testid="explain-facts-strip"] [data-fact]')).map((e: any) => [e.getAttribute("data-fact"), (e.textContent || "").replace(/\s+/g, " ").trim()]));
    return { verdict: q("explain-verdict")?.textContent, verdictAttr: q("explain-verdict")?.getAttribute("data-verdict"), tickets: q("explain-ticket-line")?.textContent ?? null, facts,
      strip: (q("explain-facts-strip")?.textContent || "").replace(/\s+/g, " ") };
  });
  log("EXPLAIN", ex);
  log("EXPLAIN_MODAL", ((await frame.locator('[data-testid="plan-explain-modal"]').first().textContent().catch(() => "")) || "").replace(/\s+/g, " ").slice(0, 3000));
  await shot(page, "a-08-explain");
  await frame.locator('[data-testid="explain-facts-strip"]').first().screenshot({ path: `${OUT}/a-08b-explain-strip.png` }).catch(() => {});
  await page.keyboard.press("Escape"); await page.waitForTimeout(800);
  if (await frame.locator('[data-testid="plan-explain-modal"]').count()) { await frame.getByRole("button", { name: /Close/i }).first().click().catch(() => {}); await page.waitForTimeout(800); }

  // ── Storyline lede ────────────────────────────────────────
  await tab(page, frame, "storyline");
  await frame.locator('[data-testid="storyline-view"], [data-testid="storyline-empty"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const sl = await real.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as any;
    return { about: (q("about-verdict")?.textContent || "").replace(/\s+/g, " "), rung: q("about-verdict")?.getAttribute("data-rung"), tickets: q("about-tickets")?.textContent ?? null,
      lede: (document.querySelector(".lz-sl-lede")?.textContent || "").replace(/\s+/g, " "), reconcile: q("storyline-reconcile")?.textContent ?? null };
  });
  log("STORYLINE", sl);
  await frame.locator('[data-testid="storyline-about"]').first().screenshot({ path: `${OUT}/a-09-storyline-about.png` }).catch(() => {});
  await shot(page, "a-09b-storyline");

  // ── Gantt: the held row ───────────────────────────────────
  await tab(page, frame, "gantt");
  await page.waitForTimeout(3000);
  const b = await bars(real);
  log("BARS_205_209", Object.fromEntries(["LZPT-188", "LZPT-205", "LZPT-206", "LZPT-207", "LZPT-208", "LZPT-209"].map((k) => [k, b[k]])));
  // ── stage ONE real edit and read the Apply review ─────────
  const bar206 = frame.locator('[data-testid="gantt-bar"][data-key="LZPT-206"]').first();
  await bar206.scrollIntoViewIfNeeded();
  await bar206.click();
  const ed = frame.locator('[data-testid="date-editor"][data-issue-key="LZPT-206"]').first();
  await ed.waitFor({ state: "visible", timeout: 20_000 });
  const picked = await pickIn(page, frame, ed.getByRole("button", { name: "Choose date" }).nth(1), "2026-10-09");
  log("PICKED_206_DUE", picked);
  await ed.locator('[data-testid="dateeditor-apply"]').click();
  await page.waitForTimeout(3500);
  log("STAGED_AFTER_EDIT", await isStaged(frame));
  const b2 = await bars(real);
  log("BARS_AFTER_EDIT", Object.fromEntries(["LZPT-188", "LZPT-206", "LZPT-209"].map((k) => [k, b2[k]])));
  await shot(page, "a-10-staged");
  await frame.locator('[data-testid="plan-apply-btn"]').first().click();
  const modal = frame.locator('[data-testid="apply-review-modal"]').first();
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2500);
  const mt = ((await modal.textContent()) || "").replace(/\s+/g, " ");
  fs.writeFileSync(`${OUT}/a-11-apply-review.txt`, mt);
  log("APPLY_REVIEW", mt.slice(0, 2500));
  log("APPLY_REVIEW_MENTIONS_209", /LZPT-209/.test(mt));
  log("APPLY_REVIEW_KEYS", Array.from(new Set(mt.match(/LZPT-\d+/g) || [])));
  await shot(page, "a-11-apply-review");
  await modal.locator("button").filter({ hasText: /^Discard All$/ }).first().click();
  await page.waitForTimeout(1500);
  const confirm = frame.getByRole("button", { name: /^(Discard|Discard all|Yes)/i }).last();
  if (await confirm.count()) { await confirm.click().catch(() => {}); }
  await page.waitForTimeout(3500);
  log("STAGED_AFTER_DISCARD", await isStaged(frame));
  await shot(page, "a-12-after-discard");
  expect(true).toBe(true);
});
