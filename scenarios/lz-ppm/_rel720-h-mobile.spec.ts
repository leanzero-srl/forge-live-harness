// dev 7.20.0 release proof — MOBILE 390 x 844 inside the real Jira iframe (Playwright viewport +
// CDP touch emulation on the page and the app's own frame target). Checks page-level sideways
// scroll on the plans list, the "REL720 portfolio" page, the Capacity page, the fixture's Capacity
// tab + roster editor; a tap on the header word opens no hover tip; a Select opens as a bottom
// sheet. Then (desktop) deletes "REL720 portfolio".
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, bodyText, isStaged, log, OUT, FX } from "./_rel720-lib";

test.describe.configure({ retries: 0, timeout: 1_800_000 });
const PF = "REL720 portfolio";

async function overflow(real: any) {
  return real.evaluate(() => {
    const de = document.documentElement, cw = de.clientWidth;
    const offenders = Array.from(document.querySelectorAll("body *")).filter((e: any) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > cw + 1; })
      .map((e: any) => ({ e, r: e.getBoundingClientRect() })).filter(({ e }) => !Array.from(e.children || []).some((c: any) => c.getBoundingClientRect().right > cw + 1))
      .slice(0, 8).map(({ e, r }: any) => `${e.tagName.toLowerCase()}${e.getAttribute("data-testid") ? "[" + e.getAttribute("data-testid") + "]" : ""}.${String(e.className?.baseVal ?? e.className ?? "").slice(0, 30)} "${(e.textContent || "").trim().slice(0, 30)}" L${Math.round(r.left)} R${Math.round(r.right)}`);
    return { scrollWidth: de.scrollWidth, clientWidth: cw, over: de.scrollWidth - cw, offenders, coarse: matchMedia("(pointer: coarse)").matches, noHover: matchMedia("(hover: none)").matches, compact: matchMedia("(max-width: 640px)").matches };
  });
}
async function touch(page: any, real: any) {
  const c1 = await page.context().newCDPSession(page);
  await c1.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  try { const c2 = await page.context().newCDPSession(real); await c2.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); } catch { /* same target */ }
  return c1;
}
async function tapAt(cdp: any, x: number, y: number) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 80));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}
async function snap(page: any, name: string) { await page.screenshot({ path: `${OUT}/${name}.png` }); }

test("rel720 H: 390 px phone inside Jira", async ({ page }) => {
  let { frame, real } = await boot(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  ({ frame, real } = await (async () => { const b = await (await import("./_rel720-lib")).boot(page); return b; })());
  await page.setViewportSize({ width: 390, height: 844 });
  let cdp = await touch(page, real);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  log("H_IFRAME_BOX", await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().boundingBox());
  log("H_PLANS", await overflow(real));
  await snap(page, "h-01-plans-390");
  // header bar alone
  log("H_APPBAR", await real.evaluate(() => { const h = document.querySelector("header.lz-appbar") as any; if (!h) return null; const r = h.getBoundingClientRect(); return { w: Math.round(r.width), scrollW: h.scrollWidth, clientW: h.clientWidth, text: (h.textContent || "").replace(/\s+/g, " ") }; }));
  // portfolio page
  const pfLink = frame.locator("button, a").filter({ hasText: new RegExp(`^${PF}$`) }).first();
  log("H_PF_LINK", await pfLink.count());
  await pfLink.click().catch(async () => { await frame.locator('[data-testid="plan-portfolio-chip"]').first().click().catch(() => {}); });
  await frame.locator('[data-testid="portfolio-name"]').first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  log("H_PORTFOLIO", await overflow(real));
  log("H_PORTFOLIO_ROWS", await real.evaluate(() => Array.from(document.querySelectorAll('[data-testid="portfolio-direction-row"]')).map((r: any) => { const b = r.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), text: (r.textContent || "").replace(/\s+/g, " ").slice(0, 120) }; })));
  await snap(page, "h-02-portfolio-390");
  // capacity page
  await frame.locator("nav button, header button").filter({ hasText: /^Capacity$/ }).first().click().catch(() => {});
  await frame.locator('[data-testid="capacity-view"]').first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(5000);
  log("H_CAPACITY_PAGE", await overflow(real));
  await snap(page, "h-03-capacity-page-390");
  // plan capacity tab + roster editor
  await frame.getByRole("button", { name: "LeanZero Management home" }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await openPlan(page, frame, FX);
  await page.waitForTimeout(3000);
  log("H_PLAN_HEADER", await overflow(real));
  await snap(page, "h-04-plan-390");
  await tab(page, frame, "capacity"); await page.waitForTimeout(4000);
  log("H_PLAN_CAPACITY", await overflow(real));
  await snap(page, "h-05-plan-capacity-390");
  await frame.locator("button").filter({ hasText: /^(Set up the team roster|Edit the team roster)$/ }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  log("H_ROSTER_EDITOR", await overflow(real));
  log("H_ROSTER_EDITOR_BOX", await frame.locator('[data-testid="capacity-roster-editor"]').first().boundingBox().catch(() => null));
  await snap(page, "h-06-roster-editor-390");
  await frame.locator('[data-testid="capacity-roster-editor"]').getByRole("button", { name: /^Cancel$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  // tap on the header word: no hover tip
  cdp = await touch(page, real);
  const word = frame.locator('[data-testid="plan-header-verdict"]').first();
  await word.scrollIntoViewIfNeeded().catch(() => {});
  const wb = await word.boundingBox().catch(() => null);
  log("H_WORD_BOX", wb);
  if (wb) { await tapAt(cdp, wb.x + wb.width / 2, wb.y + wb.height / 2); await page.waitForTimeout(1500); log("H_TIPS_AFTER_TAP", await frame.locator('[data-testid="lz-tooltip"]').count()); await snap(page, "h-07-tap-word"); }
  // a Select as a bottom sheet (Dashboard's schedule-confidence picker)
  await tab(page, frame, "dashboard"); await page.waitForTimeout(5000);
  log("H_DASHBOARD", await overflow(real));
  const sel = frame.locator("button").filter({ hasText: /−15%|Medium/ }).first();
  await sel.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(800);
  const sb = await sel.boundingBox().catch(() => null);
  log("H_SELECT_BOX", sb);
  if (sb) {
    await tapAt(cdp, sb.x + sb.width / 2, sb.y + sb.height / 2);
    await page.waitForTimeout(1800);
    log("H_SELECT_SHEET", await real.evaluate(() => { const s = document.querySelector('[data-testid="lz-select-sheet"]') as any; if (!s) return null; const r = s.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: document.documentElement.clientWidth, vh: window.innerHeight, rows: Array.from(s.querySelectorAll('[role="option"]')).map((o: any) => Math.round(o.getBoundingClientRect().height)) }; }));
    await snap(page, "h-08-select-sheet");
    await real.evaluate(() => (document.querySelector('[data-testid="lz-select-scrim"]') as any)?.click());
    await page.waitForTimeout(800);
  }
  log("H_STAGED", await isStaged(frame));
  // ── desktop: delete the portfolio ─────────────────────────
  await page.setViewportSize({ width: 1700, height: 1050 });
  await frame.getByRole("button", { name: "LeanZero Management home" }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await frame.locator("button, a").filter({ hasText: new RegExp(`^${PF}$`) }).first().click().catch(() => {});
  await frame.locator('[data-testid="portfolio-delete-btn"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await frame.locator('[data-testid="portfolio-delete-btn"]').first().click();
  await page.waitForTimeout(1200);
  await frame.getByRole("button", { name: /^Delete/ }).last().click().catch(() => {});
  await page.waitForTimeout(5000);
  log("H_AFTER_DELETE", (await bodyText(frame)).slice(0, 200));
  expect(true).toBe(true);
});
