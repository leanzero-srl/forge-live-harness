// Items 2 (calendar edit re-stamps the card, driven through the UI panel) and 5
// (solid accents: toolbar save states, ApplyReviewModal, holiday list, DatePicker),
// light AND dark, on the scratch fixture plan.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lagbed";
const NAME = "LagStamp Probe";
test.describe.configure({ retries: 0, timeout: 2_400_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

async function realFrame(frame: any) {
  const h = await frame.locator(":root").elementHandle();
  return await h!.ownerFrame();
}
async function setTheme(frame: any, mode: "light" | "dark") {
  const f = await realFrame(frame);
  await f!.evaluate((m: string) => {
    document.documentElement.setAttribute("data-color-mode", m);
    document.documentElement.setAttribute("data-theme", m);
  }, mode);
}

async function surface(page: any) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  await page.waitForTimeout(4000);
  return s.frame;
}
async function cardFacts(frame: any) {
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first();
  await card.waitFor({ state: "visible", timeout: 120_000 });
  return {
    finish: (await txt(card.locator('[data-testid="plan-finish"]'))).replace(/\n/g, " "),
    room: (await txt(card.locator('[data-testid="plan-room"]'))).replace(/\n/g, " "),
    verdict: await txt(card.locator('[data-testid="plan-verdict-chip"]')),
    punchline: await txt(card.locator('[data-testid="plan-punchline"]')),
  };
}

for (const mode of ["light", "dark"] as const) {
test(`accents + calendar restamp (${mode})`, async ({ page }) => {
  const frame = await surface(page);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
  await setTheme(frame, mode);
  await page.waitForTimeout(1500);
  const before = await cardFacts(frame);
  console.log(`[${mode}] CARD BEFORE:`, JSON.stringify(before));
  await page.screenshot({ path: `${OUT}/${mode}-01-plans.png` });

  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(10000);
  await setTheme(frame, mode);
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);

  // --- toolbar: SAVED state
  const save = frame.locator('[data-testid="plan-save-btn"]');
  console.log(`[${mode}] save state idle:`, await save.getAttribute("data-save-state").catch(() => "(none)"), await txt(save));
  await frame.locator(".lz-plan-toolbar-actions").first().screenshot({ path: `${OUT}/${mode}-02-toolbar-saved.png` }).catch(async () => {
    await page.screenshot({ path: `${OUT}/${mode}-02-toolbar-saved.png` });
  });

  // --- DatePicker: click a due cell on the FIRST row
  const row = frame.locator('[data-testid="table-row"][data-row-key="WFH-3442"]').first();
  await row.scrollIntoViewIfNeeded();
  const box = await row.boundingBox();
  // due-date cell: click the cell showing the due value
  await row.locator("div").filter({ hasText: /^9 Oct$|Oct/ }).last().click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const cal = frame.locator(".lz-datepicker").first();
  const calOpen = await cal.count();
  console.log(`[${mode}] datepicker open:`, calOpen);
  await page.screenshot({ path: `${OUT}/${mode}-03-datepicker.png` });
  if (calOpen) {
    const day = cal.locator('button[aria-label="2026-10-13"]').first();
    if (await day.count()) await day.dispatchEvent("click");
    else await cal.locator('button[aria-label="Next month"]').first().dispatchEvent("click");
    await page.waitForTimeout(2500);
  }
  const staged = await save.getAttribute("data-save-state").catch(() => null);
  console.log(`[${mode}] save state after edit:`, staged, await txt(save));
  await page.screenshot({ path: `${OUT}/${mode}-04-toolbar-unsaved.png` });

  // --- SAVING state + apply modal
  if (staged === "unsaved" || /Save \(/.test(await txt(save))) {
    await save.click();
    await page.screenshot({ path: `${OUT}/${mode}-05-toolbar-saving.png` });
    await page.waitForTimeout(4000);
    const applyBtn = frame.locator("button").filter({ hasText: /^Apply \d+ change/i }).first();
    if (await applyBtn.count()) {
      await applyBtn.dispatchEvent("click");
      await frame.locator('[data-testid="apply-review-modal"]').waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/${mode}-06-apply-modal.png` });
      const rows = await frame.locator('[data-testid="apply-change-row"]').allInnerTexts().catch(() => []);
      console.log(`[${mode}] APPLY ROWS:`, JSON.stringify(rows));
      await frame.getByRole("button", { name: /^Cancel$/ }).first().dispatchEvent("click").catch(() => {});
      await page.waitForTimeout(1500);
    } else console.log(`[${mode}] no Apply button`);
  }

  // --- Schedule panel + holiday list
  await frame.getByRole("button", { name: /^Schedule$/i }).first().click();
  await page.waitForTimeout(4000);
  await frame.getByRole("button", { name: /^Bank Holidays$/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/${mode}-07-schedule-holidays.png` });

  if (mode === "light") {
    // add 2026-10-26 through the UI, then read the plan card
    await frame.getByRole("button", { name: /^2026$/ }).first().click().catch(() => {});
    await page.waitForTimeout(800);
    await frame.getByRole("button", { name: /Choose date/i }).first().click();
    await page.waitForTimeout(1200);
    const cal2 = frame.locator(".lz-datepicker").first();
    for (let i = 0; i < 18; i++) {
      if (await cal2.locator('button[aria-label="2026-10-26"]').count()) break;
      await cal2.locator('button[aria-label="Next month"]').first().dispatchEvent("click");
      await page.waitForTimeout(400);
    }
    await page.screenshot({ path: `${OUT}/${mode}-08-datepicker-holiday.png` });
    await cal2.locator('button[aria-label="2026-10-26"]').first().dispatchEvent("click");
    await page.waitForTimeout(1000);
    await frame.getByRole("button", { name: /^Add$/ }).first().dispatchEvent("click");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${OUT}/${mode}-09-holiday-added.png` });
    console.log("[light] holiday panel:", (await txt(frame.locator("body"))).slice(0, 400).replace(/\n/g, " | "));

    // back to the plans list WITHOUT a page reload
    await frame.getByRole("button", { name: /Plans/i }).first().click().catch(async () => {
      await frame.getByRole("link", { name: /Plans/i }).first().click();
    });
    await page.waitForTimeout(8000);
    const after = await cardFacts(frame);
    console.log("[light] CARD AFTER HOLIDAY:", JSON.stringify(after));
    fs.writeFileSync(`${OUT}/ui-card-after-holiday.json`, JSON.stringify({ before, after }, null, 2));
    await page.screenshot({ path: `${OUT}/light-10-card-after-holiday.png` });
  }
  expect(1).toBe(1);
});
}
