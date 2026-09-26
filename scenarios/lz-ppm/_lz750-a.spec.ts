// LZ750 — dev 7.5.0 derived-row targeted check (items 1,2,3,4,5,7).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const BED = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz750";
const bed = JSON.parse(fs.readFileSync(`${BED}/bed.json`, "utf8"));
const OUT = `${BED}/shots`;
fs.mkdirSync(OUT, { recursive: true });
const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 0, timeout: 3_000_000, mode: "serial" });

test("LZ750 derived-row items", async ({ page }) => {
  const R: any = {};
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  const rf = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(4000);
  R.rev = await frame.locator("text=/rev v[0-9.]+/").first().innerText().catch(() => "(none)");
  console.log("APP REV", R.rev);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: bed.tag }).first().click();
  await page.waitForTimeout(18000);

  const body = async () => (await frame.locator("body").textContent().catch(() => "")) || "";
  const stagedN = async () => { const m = (await body()).match(/Apply (\d+) change/); return m ? Number(m[1]) : 0; };
  const applyBtn = () => frame.locator("button").filter({ hasText: /^Apply \d+ change/ }).first();
  const bars = async () => frame.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), start: e.getAttribute("data-bar-start"), due: e.getAttribute("data-bar-due"), derived: e.getAttribute("data-derived"), w: Math.round(e.getBoundingClientRect().width) })));
  const rows = async () => frame.locator('[data-testid="table-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-row-key"), start: e.getAttribute("data-row-start"), due: e.getAttribute("data-row-due"), dur: e.getAttribute("data-row-duration"), derived: e.getAttribute("data-row-derived") })));
  const toGantt = async () => { await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {}); await page.waitForTimeout(6000); };
  const toTable = async () => { await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {}); await page.waitForTimeout(6000); };
  const readReview = async () => frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.textContent || "").replace(/\s+/g, " ").trim() })));
  const openReview = async () => { await applyBtn().click({ force: true }); await page.waitForTimeout(3500); };
  const discardAll = async () => {
    const d = frame.getByRole("button", { name: /Discard All/i }).first();
    if (await d.count()) { await d.click({ force: true }); await page.waitForTimeout(4000); }
    const still = frame.locator('[data-testid="apply-review-modal"]');
    if (await still.count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(1500); }
    await page.waitForTimeout(3000);
  };

  await toGantt();
  R.derivedChip = await frame.locator('[data-testid="derived-count-chip"]').innerText().catch(() => "(none)");
  R.barsBefore = await bars();
  R.stagedStart = await stagedN();
  console.log("CHIP", R.derivedChip, "| STAGED", R.stagedStart);
  console.log("BARS", JSON.stringify(R.barsBefore));
  await page.screenshot({ path: `${OUT}/00-gantt-baseline.png` });

  // ---------------- ITEM 4: DateEditor on a derived row, nothing staged ----------------
  const bar = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  await bar(bed.c).scrollIntoViewIfNeeded().catch(() => {});
  await bar(bed.c).click({ force: true });
  await page.waitForTimeout(2500);
  const ed = frame.locator('[data-testid="date-editor"]');
  R.i4 = { opened: await ed.count() };
  R.i4.headerBefore = (await ed.locator("> div").first().innerText().catch(() => "")).replace(/\n/g, " | ");
  R.i4.draftBefore = /Draft/.test(R.i4.headerBefore);
  R.i4.dotsBefore = await ed.locator("label").allInnerTexts().catch(() => []);
  await page.screenshot({ path: `${OUT}/04a-editor-no-draft.png` });
  // type a change: open the Due picker, pick a later day
  await ed.getByRole("button", { name: /^Choose date$/ }).nth(1).click({ force: true });
  await page.waitForTimeout(1200);
  await frame.locator('.lz-datepicker button[aria-label="2026-10-23"]').first().click({ force: true });
  await page.waitForTimeout(1800);
  R.i4.headerAfter = (await ed.locator("> div").first().innerText().catch(() => "")).replace(/\n/g, " | ");
  R.i4.draftAfter = /Draft/.test(R.i4.headerAfter);
  await page.screenshot({ path: `${OUT}/04b-editor-draft-after-typing.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(2000);
  R.i4.editorAfterEsc = await frame.locator('[data-testid="date-editor"]').count();
  R.i4.stagedAfterEsc = await stagedN();
  // reopen to prove the badge is gone
  await bar(bed.c).click({ force: true });
  await page.waitForTimeout(2500);
  R.i4.headerReopen = (await frame.locator('[data-testid="date-editor"] > div').first().innerText().catch(() => "")).replace(/\n/g, " | ");
  R.i4.draftReopen = /Draft/.test(R.i4.headerReopen);
  await page.screenshot({ path: `${OUT}/04c-editor-reopened.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
  console.log("ITEM4", JSON.stringify(R.i4));

  // ---------------- ITEM 5: re-pick the SAME day in the Table's date cell ----------------
  await toTable();
  R.i5 = { rowsBefore: await rows(), stagedBefore: await stagedN() };
  const cRow = frame.locator(`[data-testid="table-row"][data-row-key="${bed.c}"]`).first();
  const renderedStart = R.i5.rowsBefore.find((r: any) => r.key === bed.c)?.start;
  console.log("ITEM5 rendered start of", bed.c, renderedStart);
  // click the Start cell -> DatePicker autoOpens
  await cRow.locator('[data-testid="table-derived-date"][data-field="startDate"]').first().click({ force: true });
  await page.waitForTimeout(1500);
  R.i5.pickerOpen = await frame.locator(".lz-datepicker").count();
  await frame.locator(`.lz-datepicker button[aria-label="${renderedStart}"]`).first().click({ force: true });
  await page.waitForTimeout(3500);
  R.i5.toasts = await frame.locator(".toast-enter, .toast-exit").allInnerTexts().catch(() => []);
  R.i5.stagedAfter = await stagedN();
  R.i5.rowsAfter = await rows();
  await page.screenshot({ path: `${OUT}/05-repick-same-day.png` });
  console.log("ITEM5", JSON.stringify(R.i5));

  // ---------------- ITEM 1: buffer toggle on a DERIVED row, single edit ----------------
  await toGantt();
  const widthOf = async (k: string) => (await bar(k).boundingBox())?.width ?? -1;
  R.i1 = { barsBefore: await bars(), cWidthBefore: await widthOf(bed.c) };
  await bar(bed.c).click({ force: true });
  await page.waitForTimeout(2500);
  await frame.locator('[data-testid="buffer-yes"]').first().click({ force: true });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/01a-buffer-yes-in-editor.png` });
  await frame.locator('[data-testid="dateeditor-apply"]').first().click({ force: true });
  await page.waitForTimeout(5000);
  R.i1.staged = await stagedN();
  R.i1.barsAfter = await bars();
  R.i1.cWidthAfter = await widthOf(bed.c);
  R.i1.chip = await frame.locator('[data-testid="derived-count-chip"]').innerText().catch(() => "(none)");
  R.i1.cDerivedChip = await frame.locator(`[data-testid="gantt-derived-chip"][data-key="${bed.c}"]`).count();
  await page.screenshot({ path: `${OUT}/01b-gantt-after-buffer.png` });
  await openReview();
  R.i1.review = await readReview();
  R.i1.subtitle = await frame.locator('[data-testid="apply-review-subtitle"]').innerText().catch(() => "");
  await page.screenshot({ path: `${OUT}/01c-apply-review.png` });
  console.log("ITEM1", JSON.stringify(R.i1, null, 1));
  await discardAll();
  R.i1.stagedAfterDiscard = await stagedN();
  R.i1.barsAfterDiscard = await bars();
  console.log("ITEM1 after discard", R.i1.stagedAfterDiscard, JSON.stringify(R.i1.barsAfterDiscard));

  // ---------------- ITEM 2: the SAME gesture through bulk multi-select ----------------
  await toTable();
  R.i2 = { rowsBefore: await rows(), stagedBefore: await stagedN() };
  await frame.locator(`[title="Select ${bed.c}"]`).first().click({ force: true });
  await page.waitForTimeout(700);
  await frame.locator(`[title="Select ${bed.d}"]`).first().click({ force: true });
  await page.waitForTimeout(1200);
  R.i2.bulkBar = (await frame.locator("text=/\\d+ selected/").first().innerText().catch(() => "")).trim();
  await page.screenshot({ path: `${OUT}/02a-bulk-selected.png` });
  const bulkYes = frame.locator("button").filter({ hasText: /^Yes$/ }).last();
  await bulkYes.click({ force: true });
  await page.waitForTimeout(5000);
  R.i2.staged = await stagedN();
  R.i2.rowsAfter = await rows();
  await page.screenshot({ path: `${OUT}/02b-after-bulk-buffer.png` });
  await openReview();
  R.i2.review = await readReview();
  await page.screenshot({ path: `${OUT}/02c-apply-review-bulk.png` });
  console.log("ITEM2", JSON.stringify(R.i2, null, 1));
  await discardAll();
  R.i2.stagedAfterDiscard = await stagedN();

  // ---------------- ITEM 3: adopt a NULL-duration imported derived row ----------------
  await toTable();
  R.i3 = { rowsBefore: await rows(), stagedBefore: await stagedN() };
  await frame.locator(`[data-testid="table-derived-chip"][data-key="${bed.e}"]`).first().click({ force: true });
  await page.waitForTimeout(1800);
  R.i3.menu = await frame.locator('[data-testid="derived-row-menu"]').count();
  await page.screenshot({ path: `${OUT}/03a-derived-row-menu.png` });
  await frame.locator('[data-testid="derived-menu-adopt"]').first().click({ force: true });
  await page.waitForTimeout(2500);
  R.i3.dialogRows = await frame.locator('[data-testid="derived-review-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-key"), text: (e.textContent || "").replace(/\s+/g, " ").trim() })));
  await page.screenshot({ path: `${OUT}/03b-derived-review-dialog.png` });
  await frame.locator('[data-testid="derived-review-adopt"]').first().click({ force: true });
  await page.waitForTimeout(5000);
  R.i3.staged = await stagedN();
  await openReview();
  R.i3.review = await readReview();
  await page.screenshot({ path: `${OUT}/03c-adopt-apply-review.png` });
  console.log("ITEM3", JSON.stringify(R.i3, null, 1));
  await discardAll();
  R.i3.stagedAfterDiscard = await stagedN();

  // ---------------- ITEM 7 (control): a DUE edit on the derived row ----------------
  await toGantt();
  R.i7 = { barsBefore: await bars(), stagedBefore: await stagedN() };
  await bar(bed.c).click({ force: true });
  await page.waitForTimeout(2500);
  await frame.locator('[data-testid="date-editor"]').getByRole("button", { name: /^Choose date$/ }).nth(1).click({ force: true });
  await page.waitForTimeout(1200);
  await frame.locator('.lz-datepicker button[aria-label="2026-10-23"]').first().click({ force: true });
  await page.waitForTimeout(1500);
  await frame.locator('[data-testid="dateeditor-apply"]').first().click({ force: true });
  await page.waitForTimeout(6000);
  R.i7.staged = await stagedN();
  R.i7.barsAfter = await bars();
  await page.screenshot({ path: `${OUT}/07a-after-due-edit.png` });
  await openReview();
  R.i7.review = await readReview();
  await page.screenshot({ path: `${OUT}/07b-apply-review-due.png` });
  console.log("ITEM7", JSON.stringify(R.i7, null, 1));
  await discardAll();
  R.i7.stagedAfterDiscard = await stagedN();
  R.i7.barsAfterDiscard = await bars();

  await page.screenshot({ path: `${OUT}/99-final.png` });
  fs.writeFileSync(`${BED}/results.json`, JSON.stringify(R, null, 2));
  expect(1).toBe(1);
});
