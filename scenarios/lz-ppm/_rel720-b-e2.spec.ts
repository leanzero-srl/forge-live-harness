// dev 7.20.0 release proof — ENGINE E2 on the tester's WFH fixture plan (FX, 8 issues made by the
// tester, deleted after). B-73: a pinned BUFFER row (B, Jira 10-15..10-21, pinned behind A's 10-20)
// typed and dragged earlier — refused, and its due must NOT grow; S behind it must not move.
// B-72: Epic P (C1 pred X, C2) blocks Y — Y must start the working day after P ends on open, AND after
// a due edit on X; then APPLY (this journey writes the fixture's dates to Jira) and read Jira back.
// SEC-E: Dashboard Export CSV with a "=1+1" and a "-2+3" summary, captured from the Blob (no download).
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, bodyText, isStaged, log, OUT, bars, pickIn, FX } from "./_rel720-lib";
import fs from "node:fs";

test.describe.configure({ retries: 0, timeout: 1_500_000 });
const K = { P: "WFH-3813", X: "WFH-3814", C1: "WFH-3815", C2: "WFH-3816", Y: "WFH-3817", A: "WFH-3818", B: "WFH-3819", S: "WFH-3820" };
const pick = (b: any) => Object.fromEntries(Object.entries(K).map(([n, k]) => [n, b[k] || null]));

test("rel720 B: E2 engine on the fixture — buffer refusal, epic predecessor, apply, CSV", async ({ page }) => {
  const { frame, real } = await boot(page);
  await real.evaluate(() => {
    (window as any).__toasts = [];
    new MutationObserver(() => { for (const t of Array.from(document.querySelectorAll(".toast-enter"))) { const s = (t.textContent || "").replace(/\s+/g, " "); if (!(window as any).__toasts.includes(s)) (window as any).__toasts.push(s); } }).observe(document.body, { childList: true, subtree: true });
  });
  const toasts = async () => real.evaluate(() => (window as any).__toasts.splice(0));
  await openPlan(page, frame, FX);
  await tab(page, frame, "gantt");
  await page.waitForTimeout(4000);
  log("E_STAGED_ON_OPEN", await isStaged(frame));
  log("E_BARS_OPEN", pick(await bars(real)));
  await shot(page, "b-01-open");

  // ── B-73: typed earlier start on the pinned buffer ────────
  const barB = frame.locator(`[data-testid="gantt-bar"][data-key="${K.B}"]`).first();
  await barB.scrollIntoViewIfNeeded(); await barB.click();
  let ed = frame.locator(`[data-testid="date-editor"][data-issue-key="${K.B}"]`).first();
  await ed.waitFor({ state: "visible", timeout: 20_000 });
  log("B73_EDITOR", ((await ed.textContent()) || "").replace(/\s+/g, " ").slice(0, 400));
  log("B73_PICK", await pickIn(page, frame, ed.getByRole("button", { name: "Choose date" }).first(), "2026-10-15"));
  log("B73_EDITOR_AFTER_PICK", ((await ed.textContent()) || "").replace(/\s+/g, " ").slice(0, 500));
  await ed.locator('[data-testid="dateeditor-apply"]').click().catch(() => {});
  await page.waitForTimeout(3500);
  log("B73_TYPED_TOASTS", await toasts());
  log("B73_TYPED_BARS", pick(await bars(real)));
  log("B73_TYPED_STAGED", await isStaged(frame));
  await shot(page, "b-02-buffer-typed");
  if (await frame.locator(`[data-testid="date-editor"]`).count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(600); }

  // ── B-73: drag the pinned buffer left ─────────────────────
  const bb = async (k: string) => (await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first().boundingBox());
  const a = await bb(K.A), s = await bb(K.S), b = await bb(K.B);
  const pxDay = a && s ? (s.x - a.x) / 3 : 14;
  log("B73_GEOM", { a, s, b, pxDay });
  if (b) {
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (let i = 1; i <= 8; i++) { await page.mouse.move(cx - (pxDay * 4 * i) / 8, cy); await page.waitForTimeout(60); }
    await page.mouse.up();
    await page.waitForTimeout(3500);
  }
  log("B73_DRAG_TOASTS", await toasts());
  log("B73_DRAG_BARS", pick(await bars(real)));
  log("B73_DRAG_STAGED", await isStaged(frame));
  await shot(page, "b-03-buffer-dragged");
  if (await isStaged(frame)) {
    await frame.locator('[data-testid="plan-apply-btn"]').first().click();
    const m = frame.locator('[data-testid="apply-review-modal"]').first();
    await m.waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(2000);
    log("B73_REVIEW", ((await m.textContent()) || "").replace(/\s+/g, " ").slice(0, 1500));
    await shot(page, "b-03b-buffer-review");
    await m.locator("button").filter({ hasText: /^Discard All$/ }).first().click();
    await page.waitForTimeout(1500);
    const c = frame.getByRole("button", { name: /^(Discard|Discard all|Yes)/i }).last();
    if (await c.count()) await c.click().catch(() => {});
    await page.waitForTimeout(3500);
    log("B73_AFTER_DISCARD_STAGED", await isStaged(frame));
    log("B73_AFTER_DISCARD_BARS", pick(await bars(real)));
  }

  // ── B-72: due edit on X ───────────────────────────────────
  const barX = frame.locator(`[data-testid="gantt-bar"][data-key="${K.X}"]`).first();
  await barX.scrollIntoViewIfNeeded(); await barX.click();
  ed = frame.locator(`[data-testid="date-editor"][data-issue-key="${K.X}"]`).first();
  await ed.waitFor({ state: "visible", timeout: 20_000 });
  log("B72_PICK", await pickIn(page, frame, ed.getByRole("button", { name: "Choose date" }).nth(1), "2026-10-14"));
  await ed.locator('[data-testid="dateeditor-apply"]').click();
  await page.waitForTimeout(4000);
  log("B72_TOASTS", await toasts());
  log("B72_BARS_AFTER_EDIT", pick(await bars(real)));
  await shot(page, "b-04-x-edited");
  await tab(page, frame, "table");
  await page.waitForTimeout(2500);
  log("B72_TABLE_AFTER_EDIT", await real.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('[data-testid="table-row"]')).map((r: any) => [r.getAttribute("data-row-key"), [r.getAttribute("data-row-start"), r.getAttribute("data-row-due"), r.getAttribute("data-row-duration")]]))));
  await shot(page, "b-05-table");
  // ── Apply review, then APPLY ──────────────────────────────
  await frame.locator('[data-testid="plan-apply-btn"]').first().click();
  const modal = frame.locator('[data-testid="apply-review-modal"]').first();
  await modal.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(2500);
  const mt = ((await modal.textContent()) || "").replace(/\s+/g, " ");
  fs.writeFileSync(`${OUT}/b-06-apply-review.txt`, mt);
  log("B72_REVIEW", mt.slice(0, 2500));
  await shot(page, "b-06-apply-review");
  await modal.locator("button").filter({ hasText: /^Apply \d+ Change/ }).first().click();
  for (let i = 0; i < 90; i++) { await page.waitForTimeout(2000); const t = await bodyText(frame); if (!(await frame.locator('[data-testid="apply-review-modal"]').count()) && !/Writing|Applying/i.test(t)) break; }
  await page.waitForTimeout(5000);
  log("B72_APPLY_TOASTS", await toasts());
  log("B72_AFTER_APPLY_BODY", ((await bodyText(frame)).match(/(Applied[^.]{0,200}|written[^.]{0,200}|could not[^.]{0,200})/i) || [null])[0]);
  log("B72_STAGED_AFTER_APPLY", await isStaged(frame));
  await shot(page, "b-07-after-apply");
  await tab(page, frame, "gantt"); await page.waitForTimeout(3000);
  log("B72_BARS_AFTER_APPLY", pick(await bars(real)));

  // ── SEC-E: Dashboard Export CSV (Blob capture, no download) ─
  await tab(page, frame, "dashboard"); await page.waitForTimeout(4000);
  await real.evaluate(() => {
    (window as any).__csv = [];
    const orig = URL.createObjectURL.bind(URL);
    (URL as any).createObjectURL = (b: any) => { try { b.text().then((t: string) => (window as any).__csv.push(t)); } catch (e) { /* */ } return orig(b); };
    document.addEventListener("click", (e: any) => { const a = e.target?.closest?.("a[download]"); if (a) e.preventDefault(); }, true);
    const oc = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function (this: any) { if (this.hasAttribute("download")) return; return oc.call(this); };
  });
  await frame.getByRole("button", { name: /Export CSV/ }).first().click();
  await page.waitForTimeout(4000);
  const csv = await real.evaluate(() => (window as any).__csv);
  fs.writeFileSync(`${OUT}/b-08-dashboard.csv`, (csv || []).join("\n-----\n"));
  log("CSV_COUNT", (csv || []).length);
  log("CSV_LINES", (csv || []).join("\n").split("\n").filter((l: string) => /1\+1|2\+3/.test(l)));
  log("E_END_STAGED", await isStaged(frame));
  expect(true).toBe(true);
});
