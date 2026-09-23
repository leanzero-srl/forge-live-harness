// LIVE CHECK dev 6.81.0 — ITEM 2: EDIT a derived row.
// Bed: "Derived Lag Bed". WFH-3468 renders 10-26/10-30 (derived), stored 10-19/10-23.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
const NAME = "Derived Lag Bed";
test.describe.configure({ retries: 1, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("item 2 — editing the derived row", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  const realFrame = async () => (await (await frame.locator(":root").elementHandle())!.ownerFrame())!;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(16000);

  const R: any = {};
  const f = await realFrame();

  // ----- the Table key-cell finding: is the issue key rendered but squeezed to 0? -----
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  R.keyCells = await f.evaluate(() => [...document.querySelectorAll('[data-testid="table-row"]')].map((r: any) => {
    const cell = r.children[1];
    const keySpan = [...cell.querySelectorAll("span")].find((sp: any) => /^WFH-\d+$/.test((sp.textContent || "").trim()));
    const kb = keySpan ? keySpan.getBoundingClientRect() : null;
    return {
      key: r.getAttribute("data-row-key"), derived: r.getAttribute("data-row-derived"),
      cellText: (cell.textContent || "").trim(), cellW: Math.round(cell.getBoundingClientRect().width),
      keyPresent: !!keySpan, keyW: kb ? Math.round(kb.width) : null, keyText: keySpan ? keySpan.textContent : null,
      keyVisibleText: keySpan ? (keySpan as any).innerText : null,
    };
  }));
  console.log("KEY CELLS", JSON.stringify(R.keyCells, null, 1));

  // ----- GANTT: drag the derived bar RIGHT by exactly 7 calendar days -----
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  const barOf = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  const readBars = async () => {
    const o: any = {};
    for (const b of await frame.locator('[data-testid="gantt-bar"]').all()) {
      o[(await b.getAttribute("data-key"))!] = { start: await b.getAttribute("data-bar-start"), due: await b.getAttribute("data-bar-due"), derived: await b.getAttribute("data-derived"), x: Math.round((await b.boundingBox())!.x) };
    }
    return o;
  };
  R.barsBefore = await readBars();
  const box = (await barOf("WFH-3468").boundingBox())!;
  // 10-26..10-30 inclusive = 5 calendar days of bar width
  const pxPerDay = box.width / 5;
  const dx = Math.round(pxPerDay * 7);   // +7 calendar days -> 2026-11-02
  R.geom = { barW: Math.round(box.width), pxPerDay: Math.round(pxPerDay * 100) / 100, dx };
  console.log("GEOM", JSON.stringify(R.geom));
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (const fr of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * fr, cy, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(5000);
  R.barsAfter = await readBars();
  console.log("BARS BEFORE", JSON.stringify(R.barsBefore));
  console.log("BARS AFTER ", JSON.stringify(R.barsAfter));
  await page.screenshot({ path: `${OUT}/b01-after-drag.png` });

  // toasts / violation banner
  R.toastsAfterDrag = await f.evaluate(() => [...document.querySelectorAll("*")]
    .filter((e: any) => e.children.length === 0 && /required|cannot|violat|earliest|must start|snapped/i.test(e.textContent || ""))
    .map((e: any) => (e.textContent || "").trim()).slice(0, 12));
  console.log("TOASTS", JSON.stringify(R.toastsAfterDrag));

  const bodyT = await txt(frame.locator("body"));
  const save = frame.locator('[data-testid="plan-save-btn"]');
  R.toolbar = {
    saveText: (await txt(save)).replace(/\n/g, " "),
    saveState: await save.getAttribute("data-save-state").catch(() => null),
    applyLabel: (bodyT.match(/Apply\s+\d+\s+change\w*/) || ["(none)"])[0],
    saveCount: (bodyT.match(/Save\s*\(\d+\)/) || ["(none)"])[0],
  };
  console.log("TOOLBAR", JSON.stringify(R.toolbar));

  // table view of the staged state
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  R.tableAfter = [];
  for (const r of await frame.locator('[data-testid="table-row"]').all()) {
    R.tableAfter.push({ key: await r.getAttribute("data-row-key"), start: await r.getAttribute("data-row-start"), due: await r.getAttribute("data-row-due"), dur: await r.getAttribute("data-row-duration"), derived: await r.getAttribute("data-row-derived") });
  }
  console.log("TABLE AFTER", JSON.stringify(R.tableAfter));
  await page.screenshot({ path: `${OUT}/b02-table-after-drag.png` });

  // ----- APPLY REVIEW -----
  await frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(6000);
  const modal = frame.locator('[data-testid="apply-review-modal"]').first();
  R.review = {
    present: await modal.count(),
    subtitle: (await txt(frame.locator('[data-testid="apply-review-subtitle"]'))).replace(/\n/g, " "),
    rows: await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.innerText || "").replace(/\n/g, " | ") }))),
    text: (await txt(modal)).replace(/\n/g, " | ").slice(0, 1600),
  };
  console.log("REVIEW", JSON.stringify(R.review, null, 1));
  await page.screenshot({ path: `${OUT}/b03-apply-review.png` });

  // ----- DISCARD ALL -----
  await frame.getByRole("button", { name: /^Discard All$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);
  // confirm dialog, if any
  const confirmBtn = frame.locator("button").filter({ hasText: /^(Discard|Discard all|Yes|Confirm)/i });
  if (await confirmBtn.count()) await confirmBtn.last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  await page.screenshot({ path: `${OUT}/b04-after-discard.png` });
  const bodyT2 = await txt(frame.locator("body"));
  R.afterDiscard = {
    applySeen: /Apply\s+\d+\s+change/.test(bodyT2),
    saveText: (await txt(frame.locator('[data-testid="plan-save-btn"]'))).replace(/\n/g, " "),
    rows: [] as any[],
  };
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  for (const r of await frame.locator('[data-testid="table-row"]').all()) {
    R.afterDiscard.rows.push({ key: await r.getAttribute("data-row-key"), start: await r.getAttribute("data-row-start"), due: await r.getAttribute("data-row-due"), derived: await r.getAttribute("data-row-derived") });
  }
  console.log("AFTER DISCARD", JSON.stringify(R.afterDiscard));
  await page.screenshot({ path: `${OUT}/b05-table-restored.png` });

  // ----- now a VIOLATING drag (left, before the lag-required start) to harvest the toast -----
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  const box2 = (await barOf("WFH-3468").boundingBox())!;
  const dx2 = -Math.round((box2.width / 5) * 14);
  const c2x = box2.x + box2.width / 2, c2y = box2.y + box2.height / 2;
  await page.mouse.move(c2x, c2y); await page.mouse.down();
  for (const fr of [0.25, 0.5, 0.75, 1]) await page.mouse.move(c2x + dx2 * fr, c2y, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(5000);
  R.violation = await f.evaluate(() => [...document.querySelectorAll("*")]
    .filter((e: any) => e.children.length === 0 && /(cannot start|required|earliest|must start|before its|violat)/i.test(e.textContent || ""))
    .map((e: any) => (e.textContent || "").trim()).slice(0, 12));
  R.barsAfterViolation = await readBars();
  console.log("VIOLATION TOAST", JSON.stringify(R.violation, null, 1));
  console.log("BARS AFTER VIOLATION", JSON.stringify(R.barsAfterViolation));
  await page.screenshot({ path: `${OUT}/b06-violation.png` });

  // ----- final discard -----
  const bodyT3 = await txt(frame.locator("body"));
  if (/Apply\s+\d+\s+change/.test(bodyT3)) {
    await frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(6000);
    await frame.getByRole("button", { name: /^Discard All$/i }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2500);
    const cb = frame.locator("button").filter({ hasText: /^(Discard|Discard all|Yes|Confirm)/i });
    if (await cb.count()) await cb.last().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(8000);
  }
  const bodyT4 = await txt(frame.locator("body"));
  R.finalStaged = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(bodyT4);
  console.log("STAGED_AFTER_CLEANUP =", R.finalStaged);
  await page.screenshot({ path: `${OUT}/b07-final.png` });

  fs.writeFileSync(`${OUT}/b-results.json`, JSON.stringify(R, null, 2));
  expect(R.barsBefore["WFH-3468"].start).toBe("2026-10-26");
});
