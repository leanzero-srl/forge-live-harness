// Item 1c: a REAL edit on the first issue — hero follows, Table follows, Apply
// lights up; then Discard All restores. Item 6 rides along (Apply review modal
// in DARK, DatePicker today cell pixels).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lag2/shots";
const NAME = "LagStamp Probe B";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

async function readTable(frame: any) {
  const rows = await frame.locator('[data-testid="table-row"]').all();
  const out: any[] = [];
  for (const r of rows) out.push({ key: await r.getAttribute("data-row-key"), start: await r.getAttribute("data-row-start"), due: await r.getAttribute("data-row-due") });
  return out;
}
async function toolbar(frame: any) {
  const save = frame.locator('[data-testid="plan-save-btn"]');
  return {
    saveText: await txt(save),
    saveState: await save.getAttribute("data-save-state").catch(() => null),
    apply: await txt(frame.locator("button").filter({ hasText: /^Apply \d+ change/ }).first()),
    applyCount: await frame.locator("button").filter({ hasText: /^Apply \d+ change/ }).count(),
  };
}

test("edit the first issue, then discard", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  const rootHandle = await frame.locator(":root").elementHandle();
  const realFrame = await rootHandle!.ownerFrame();
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(14000);
  const R: any = {};

  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  R.before = { table: await readTable(frame), toolbar: await toolbar(frame) };
  console.log("BEFORE", JSON.stringify(R.before));

  // --- click the DUE cell of WFH-3445 (shows "Oct 9")
  const row = frame.locator('[data-testid="table-row"][data-row-key="WFH-3445"]').first();
  await row.scrollIntoViewIfNeeded();
  await row.locator("> div").filter({ hasText: /^Oct 9$/ }).first().click({ timeout: 15000 });
  await page.waitForTimeout(2500);
  const cal = frame.locator(".lz-datepicker").first();
  R.pickerOpen = await cal.count();
  console.log("PICKER", R.pickerOpen);
  await page.screenshot({ path: `${OUT}/d01-datepicker-light.png` });

  // --- ITEM 6: measure the TODAY cell pixel pair in DARK
  await realFrame!.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "dark"); document.documentElement.setAttribute("data-theme", "dark"); });
  await page.waitForTimeout(1200);
  R.todayCell = await realFrame!.evaluate(() => {
    const el = document.querySelector('.lz-datepicker [aria-current="date"], .lz-datepicker .lz-dp-today, .lz-datepicker [data-today="1"]') as HTMLElement | null;
    if (!el) {
      const cands = Array.from(document.querySelectorAll('.lz-datepicker button')) as HTMLElement[];
      return { found: false, sample: cands.slice(0, 3).map((c) => ({ t: c.textContent, cls: c.className, style: c.getAttribute('style') })) };
    }
    const cs = getComputedStyle(el);
    return { found: true, text: el.textContent, color: cs.color, background: cs.backgroundColor, border: cs.borderColor, cls: el.className, aria: el.getAttribute('aria-label') };
  });
  console.log("TODAY CELL(dark):", JSON.stringify(R.todayCell));
  await page.screenshot({ path: `${OUT}/d02-datepicker-dark.png` });
  await realFrame!.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "light"); document.documentElement.setAttribute("data-theme", "light"); });
  await page.waitForTimeout(800);

  // --- pick 2026-10-13
  for (let i = 0; i < 6; i++) {
    if (await cal.locator('button[aria-label="2026-10-13"]').count()) break;
    await cal.locator('button[aria-label="Next month"]').first().dispatchEvent("click");
    await page.waitForTimeout(600);
  }
  await cal.locator('button[aria-label="2026-10-13"]').first().dispatchEvent("click");
  await page.waitForTimeout(6000);

  R.afterEdit = { table: await readTable(frame), toolbar: await toolbar(frame) };
  console.log("AFTER EDIT", JSON.stringify(R.afterEdit));
  await page.screenshot({ path: `${OUT}/d03-table-after-edit.png` });

  // --- dashboard hero follows
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  const hero = frame.locator('[data-testid="plan-health"]').first();
  R.heroAfter = {
    verdict: await txt(frame.locator('[data-testid="plan-health-verdict"]')),
    punchline: await txt(frame.locator('[data-testid="plan-health-punchline"]')),
    dataRoom: await hero.getAttribute("data-room").catch(() => null),
    dataVerdict: await hero.getAttribute("data-verdict").catch(() => null),
    planned: (await txt(frame.locator('[data-testid="sc-planned"]'))).replace(/\n/g, " | "),
  };
  console.log("HERO AFTER", JSON.stringify(R.heroAfter));
  await page.screenshot({ path: `${OUT}/d04-dashboard-after-edit.png` });

  // --- Apply review modal (DARK) — read only, never apply
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await realFrame!.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "dark"); document.documentElement.setAttribute("data-theme", "dark"); });
  await page.waitForTimeout(1000);
  const applyBtn = frame.locator("button").filter({ hasText: /^Apply \d+ change/ }).first();
  R.applyBtnText = await txt(applyBtn);
  await applyBtn.dispatchEvent("click");
  await frame.locator('[data-testid="apply-review-modal"]').waitFor({ state: "visible", timeout: 40_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  R.reviewRows = await frame.locator('[data-testid="apply-change-row"]').allInnerTexts().catch(() => []);
  R.reviewSubtitle = await txt(frame.locator('[data-testid="apply-review-subtitle"]'));
  console.log("REVIEW", R.applyBtnText, JSON.stringify(R.reviewSubtitle), JSON.stringify(R.reviewRows));
  await page.screenshot({ path: `${OUT}/d05-apply-review-dark.png` });
  // WriteProgress is only reachable by applying — not done. Capture the modal light too.
  await realFrame!.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "light"); document.documentElement.setAttribute("data-theme", "light"); });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/d06-apply-review-light.png` });

  // --- DISCARD ALL
  await frame.getByRole("button", { name: /^Discard All$/i }).first().dispatchEvent("click");
  await page.waitForTimeout(12000);
  await page.screenshot({ path: `${OUT}/d07-after-discard.png` });
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  R.afterDiscard = { table: await readTable(frame), toolbar: await toolbar(frame) };
  console.log("AFTER DISCARD", JSON.stringify(R.afterDiscard));
  await page.screenshot({ path: `${OUT}/d08-table-after-discard.png` });

  fs.writeFileSync(`${OUT}/d-results.json`, JSON.stringify(R, null, 2));
  expect(R.afterEdit.table[0].due).not.toBe(R.before.table[0].due);
});
