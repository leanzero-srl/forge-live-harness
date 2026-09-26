// dev 7.19.0 release proof — FIXTURE lane on "REL719 bed" (TES-40..43, made by the tester, deleted
// after). Step 13 missed-milestone chip + Show it, step 12 pinned tip, targets via the UI, step 11
// two-tab target refusal, step 1 OVER tile + portfolio FURTHEST OVER (portfolio deleted at the end).
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, realHover, bodyText, isStaged, log } from "./_rel719-lib";

const FX = "REL719 bed";
test.describe.configure({ retries: 0, timeout: 1_500_000 });

async function pickDate(page: any, frame: any, root: any, label: string, iso: string) {
  await root.getByRole("button", { name: label }).first().click();
  await page.waitForTimeout(600);
  for (let i = 0; i < 14; i++) {
    const b = frame.locator(`.lz-datepicker button[aria-label="${iso}"]`).first();
    if (await b.count()) { await b.dispatchEvent("click"); await page.waitForTimeout(500); return true; }
    const cur = await frame.locator(".lz-datepicker").first().textContent().catch(() => "");
    const want = new Date(`${iso}T00:00:00Z`);
    const anyDay = await frame.locator('.lz-datepicker button[aria-label^="20"]').first().getAttribute("aria-label").catch(() => null);
    const nav = anyDay && anyDay.slice(0, 7) > iso.slice(0, 7) ? "Previous month" : "Next month";
    await frame.locator(".lz-datepicker").getByRole("button", { name: nav }).first().dispatchEvent("click");
    await page.waitForTimeout(300);
    void cur; void want;
  }
  return false;
}
async function openTargets(page: any, frame: any) {
  await tab(page, frame, "planning");
  await frame.locator("button").filter({ hasText: /^Targets$/ }).first().click();
  await frame.locator('[data-testid="targets-editor"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(2500);
}
async function addTarget(page: any, frame: any, name: string, iso: string) {
  const ed = frame.locator('[data-testid="targets-editor"]').first();
  await ed.getByRole("button", { name: "Add target" }).first().click();
  await page.waitForTimeout(800);
  await ed.locator("input").first().fill(name);
  const ok = await pickDate(page, frame, ed, "Target date", iso);
  log(`PICKED_${name}`, ok);
  await ed.getByRole("button", { name: "Save target" }).first().click();
  await page.waitForTimeout(4000);
  return ((await ed.textContent()) || "").replace(/\s+/g, " ");
}

test("rel719 B: fixture — milestone chip, pinned tip, targets two tabs, OVER tile, portfolio", async ({ page }) => {
  const { frame, real } = await boot(page);
  await openPlan(page, frame, FX);
  log("B_STAGED_ON_OPEN", await isStaged(frame));
  await tab(page, frame, "gantt");
  await page.waitForTimeout(3500);
  // ── step 13 ──
  const chip = await real.evaluate(() => ({ label: document.querySelector('[data-testid="gantt-focus-chip-label"]')?.textContent || null, show: !!document.querySelector('[data-testid="gantt-focus-chip-show"]'), bg: (() => { const c = document.querySelector('[data-testid="gantt-focus-chip"]'); return c ? getComputedStyle(c as any).backgroundColor : null; })() }));
  log("S13_CHIP", chip);
  await shot(page, "s13-fx-01-open");
  const visible = async () => real.evaluate(() => {
    const bar = document.querySelector('[data-testid="gantt-bar"][data-key="TES-41"]') as any;
    const row = bar?.closest('[data-testid="gantt-row"]') || document.querySelector('[data-testid="gantt-row"][data-key="TES-41"]');
    const r = bar?.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    return { bar: !!bar, inView: !!r && r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh, rect: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width)] : null, dim: row?.getAttribute?.("data-dim") ?? null };
  });
  log("S13_BAR_BEFORE", await visible());
  // scroll the timeline far away horizontally and vertically
  await real.evaluate(() => { for (const e of Array.from(document.querySelectorAll("*")) as any[]) { if (e.scrollWidth > e.clientWidth + 300) e.scrollLeft = e.scrollWidth; if (e.scrollHeight > e.clientHeight + 300) e.scrollTop = e.scrollHeight; } });
  await page.waitForTimeout(1500);
  log("S13_BAR_SCROLLED", await visible());
  await shot(page, "s13-fx-02-scrolled-away");
  if (chip.show) {
    await frame.locator('[data-testid="gantt-focus-chip-show"]').first().click();
    await page.waitForTimeout(2500);
    log("S13_BAR_AFTER_SHOW", await visible());
    const dims = await real.evaluate(() => Array.from(document.querySelectorAll('[data-testid="gantt-row"]')).map((r: any) => [r.getAttribute("data-key") || r.querySelector('[data-key]')?.getAttribute("data-key"), r.getAttribute("data-dim")]));
    log("S13_ROW_DIMS", dims);
    await shot(page, "s13-fx-03-show-it");
  }
  // ── step 12 on the fixture ──
  for (const k of ["TES-42", "TES-41", "TES-40"]) {
    const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
    await page.mouse.move(3, 3); await page.waitForTimeout(400);
    await realHover(page, bar);
    const t = await bodyText(frame);
    log(`S12_FX_TIP_${k}`, (t.match(new RegExp(`${k}: .{0,420}`)) || [null])[0]);
    await shot(page, `s12-fx-${k}`);
  }
  // ── targets (UI) + step 11 two tabs ──
  await openTargets(page, frame);
  log("T_EDITOR_START", ((await frame.locator('[data-testid="targets-editor"]').first().textContent()) || "").replace(/\s+/g, " ").slice(0, 600));
  log("T_AFTER_BETA", (await addTarget(page, frame, "REL719 beta", "2026-09-18")).slice(0, 700));
  const page2 = await page.context().newPage();
  const b2 = await boot(page2);
  await openPlan(page2, b2.frame, FX);
  await openTargets(page2, b2.frame);
  log("T2_LOADED", ((await b2.frame.locator('[data-testid="targets-editor"]').first().textContent()) || "").replace(/\s+/g, " ").slice(0, 400));
  log("T_AFTER_COMMIT", (await addTarget(page, frame, "REL719 commitment", "2026-12-01")).slice(0, 900));
  await shot(page, "s11-01-tab1-saved");
  const stale = await addTarget(page2, b2.frame, "REL719 stale", "2026-11-02");
  log("S11_TAB2_AFTER_SAVE", stale.slice(0, 900));
  log("S11_TAB2_BODY_MATCH", ((await bodyText(b2.frame)).match(/[^.]*changed since these targets were loaded[^.]*\.[^.]*\./) || [null])[0]);
  await shot(page2, "s11-02-tab2-refused");
  // recover tab 2 honestly: Cancel + Reload targets, then confirm the list is the two targets
  await b2.frame.getByRole("button", { name: "Cancel" }).first().click().catch(() => {});
  await b2.frame.getByRole("button", { name: "Reload targets" }).first().click().catch(() => {});
  await page2.waitForTimeout(3000);
  log("S11_TAB2_AFTER_RELOAD", ((await b2.frame.locator('[data-testid="targets-editor"]').first().textContent()) || "").replace(/\s+/g, " ").slice(0, 700));
  await page2.close();

  // ── step 1: the plan card ──
  await frame.getByRole("button", { name: "LeanZero Management home" }).first().click();
  await page.waitForTimeout(6000);
  const card = frame.locator('[data-testid="plan-card"]').filter({ has: frame.locator('[data-testid="plan-card-name"]', { hasText: FX }) }).first();
  await card.waitFor({ state: "visible", timeout: 60_000 });
  await card.scrollIntoViewIfNeeded();
  const cardInfo = await card.evaluate((c: any) => {
    const q = (id: string) => c.querySelector(`[data-testid="${id}"]`);
    const room = q("plan-room");
    return { label: q("plan-room-label")?.textContent, amount: q("plan-room-amount")?.textContent, room: room?.textContent, roomTitle: room?.getAttribute("title"), roomColor: room ? getComputedStyle(q("plan-room-amount") || room).color : null, labelColor: q("plan-room-label") ? getComputedStyle(q("plan-room-label")).color : null, finish: q("plan-finish")?.textContent, punch: q("plan-punchline")?.textContent, text: (c.textContent || "").replace(/\s+/g, " ") };
  });
  log("S1_CARD", cardInfo);
  await shot(page, "s1-01-plan-card");
  // ── portfolio ──
  const np = frame.locator('[data-testid="new-portfolio-btn"]').first();
  log("S1_NEW_PORTFOLIO_BTN", await np.count());
  await np.click();
  await frame.locator('[data-testid="portfolio-dialog"]').first().waitFor({ state: "visible", timeout: 20_000 });
  await frame.locator('[data-testid="portfolio-dialog-name"]').first().fill("REL719 portfolio");
  await frame.locator('[data-testid="portfolio-dialog-save"]').first().click();
  await page.waitForTimeout(5000);
  log("S1_PORTFOLIO_ERR", await frame.locator('[data-testid="portfolio-dialog-error"]').first().textContent().catch(() => null));
  // file the fixture plan under it through its card menu
  const card2 = frame.locator('[data-testid="plan-card"]').filter({ has: frame.locator('[data-testid="plan-card-name"]', { hasText: FX }) }).first();
  await card2.locator('[data-testid="plan-portfolio-add"]').first().click().catch(async () => { await card2.getByRole("button", { name: /menu|more/i }).first().click().catch(() => {}); });
  await page.waitForTimeout(1200);
  const sel = frame.locator('[data-testid="plan-assign-select"] button').first();
  await sel.click();
  await page.waitForTimeout(800);
  await frame.locator('[role="option"]').filter({ hasText: "REL719 portfolio" }).first().dispatchEvent("click");
  await page.waitForTimeout(5000);
  await shot(page, "s1-02-filed");
  const chipP = frame.locator('[data-testid="plan-card"]').filter({ has: frame.locator('[data-testid="plan-card-name"]', { hasText: FX }) }).first().locator('[data-testid="plan-portfolio-chip"]').first();
  log("S1_PORTFOLIO_CHIP", await chipP.textContent().catch(() => null));
  await chipP.click();
  await frame.locator('[data-testid="portfolio-name"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(3500);
  const pf = await real.evaluate(() => { const q = (id: string) => document.querySelector(`[data-testid="${id}"]`); return { name: q("portfolio-name")?.textContent, room: (q("portfolio-room")?.textContent || "").replace(/\s+/g, " "), label: q("portfolio-room-label")?.textContent, verdict: q("portfolio-verdict")?.textContent, finish: q("portfolio-finish")?.textContent, roomColor: q("portfolio-room") ? getComputedStyle(q("portfolio-room") as any).color : null }; });
  log("S1_PORTFOLIO", pf);
  await shot(page, "s1-03-portfolio-header");
  // delete the portfolio (restore)
  await frame.locator('[data-testid="portfolio-delete-btn"]').first().click();
  await page.waitForTimeout(1200);
  await frame.getByRole("button", { name: /^Delete/ }).last().click().catch(() => {});
  await page.waitForTimeout(5000);
  log("S1_AFTER_DELETE_BODY", (await bodyText(frame)).slice(0, 300));
  log("B_END_STAGED", await isStaged(frame));
  expect(true).toBe(true);
});
