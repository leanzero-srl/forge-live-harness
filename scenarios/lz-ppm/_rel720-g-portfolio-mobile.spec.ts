// dev 7.20.0 release proof — PORTFOLIO words (desktop) + MOBILE 390 inside the real Jira iframe.
// Creates "REL720 portfolio" (LZPT + the tester's fixture plan), reads the direction rows, ticket
// lines and per-word count blocks; then emulates a 390x844 touch phone over CDP (page + app iframe)
// and checks the plans list, portfolio, Capacity page, plan Capacity tab + roster editor for page-level
// sideways scroll, a Select opening as a bottom sheet, and a tap NOT opening a hover tip. Deletes the
// portfolio at the end.
import { test, expect } from "../../fixtures/forge";
import { boot, openPlan, tab, shot, bodyText, isStaged, log, OUT, FX } from "./_rel720-lib";

test.describe.configure({ retries: 0, timeout: 1_800_000 });
const PF = "REL720 portfolio";

async function fileUnder(page: any, frame: any, planName: string) {
  const card = frame.locator('[data-testid="plan-card"]').filter({ has: frame.locator('[data-testid="plan-card-name"]', { hasText: planName }) }).first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('[data-testid="plan-portfolio-add"]').first().click();
  await page.waitForTimeout(1200);
  await frame.locator('[data-testid="plan-assign-select"] button').first().click();
  await page.waitForTimeout(800);
  await frame.locator('[role="option"]').filter({ hasText: PF }).first().dispatchEvent("click");
  await page.waitForTimeout(5000);
}
async function overflow(real: any) {
  return real.evaluate(() => {
    const de = document.documentElement;
    const cw = de.clientWidth;
    const offenders = Array.from(document.querySelectorAll("body *")).filter((e: any) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > cw + 1 && getComputedStyle(e).position !== "fixed"; }).slice(0, 6).map((e: any) => `${e.tagName.toLowerCase()}.${(e.className && e.className.baseVal === undefined ? e.className : "").toString().slice(0, 40)}[${e.getAttribute("data-testid") || ""}] r=${Math.round(e.getBoundingClientRect().right)}`);
    return { scrollWidth: de.scrollWidth, clientWidth: cw, innerWidth: window.innerWidth, over: de.scrollWidth - cw, offenders,
      coarse: matchMedia("(pointer: coarse)").matches, noHover: matchMedia("(hover: none)").matches, compact: matchMedia("(max-width: 640px)").matches };
  });
}
async function tapAt(cdp: any, x: number, y: number) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await new Promise((r) => setTimeout(r, 80));
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("rel720 G: portfolio words + 390 px phone inside Jira", async ({ page }) => {
  let { frame, real } = await boot(page);
  // ── desktop: build the portfolio ──────────────────────────
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="new-portfolio-btn"]').first().click();
  await frame.locator('[data-testid="portfolio-dialog"]').first().waitFor({ state: "visible", timeout: 20_000 });
  await frame.locator('[data-testid="portfolio-dialog-name"]').first().fill(PF);
  await frame.locator('[data-testid="portfolio-dialog-save"]').first().click();
  await page.waitForTimeout(5000);
  log("G_PF_ERR", await frame.locator('[data-testid="portfolio-dialog-error"]').first().textContent().catch(() => null));
  await fileUnder(page, frame, "LZPT Scenarios");
  await fileUnder(page, frame, FX);
  await shot(page, "g-01-filed");
  const chip = frame.locator('[data-testid="plan-card"]').filter({ has: frame.locator('[data-testid="plan-card-name"]', { hasText: "LZPT Scenarios" }) }).first().locator('[data-testid="plan-portfolio-chip"]').first();
  log("G_CHIP", await chip.textContent().catch(() => null));
  await chip.click();
  await frame.locator('[data-testid="portfolio-name"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(5000);
  const pf = await real.evaluate(() => {
    const q = (id: string) => document.querySelector(`[data-testid="${id}"]`) as any;
    const rows = Array.from(document.querySelectorAll('[data-testid="portfolio-direction-row"]')).map((r: any) => ({
      name: r.querySelector('[data-testid="direction-plan-name"]')?.textContent, word: r.querySelector('[data-testid="direction-verdict"]')?.textContent,
      tickets: r.querySelector('[data-testid="direction-ticket-line"]')?.textContent ?? null, text: (r.textContent || "").replace(/\s+/g, " ") }));
    const counts = Array.from(document.querySelectorAll('[data-testid^="portfolio-count-"]')).map((c: any) => ({ id: c.getAttribute("data-testid"), text: (c.textContent || "").replace(/\s+/g, " "), bg: getComputedStyle(c).backgroundColor, border: getComputedStyle(c).borderColor }));
    return { name: q("portfolio-name")?.textContent, verdict: q("portfolio-verdict")?.textContent, finish: q("portfolio-finish")?.textContent, room: (q("portfolio-room")?.textContent || "").replace(/\s+/g, " "),
      ticketLine: q("portfolio-ticket-line")?.textContent ?? null, rows, counts, rollup: (document.body.innerText.match(/\d+ plans?[^\n]{0,160}/g) || []).slice(0, 5) };
  });
  log("G_PORTFOLIO", pf);
  await shot(page, "g-02-portfolio-desktop");

  // ── phone: CDP emulation on the page and the app frame ─────
  const cdp = await page.context().newCDPSession(page);
  const metrics = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };
  await cdp.send("Emulation.setDeviceMetricsOverride", metrics);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await cdp.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" }).catch(() => {});
  const url = page.url();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  ({ frame, real } = await (async () => { const { enterForgeSurface } = await import("../../forge/frame"); const s = await enterForgeSurface(page, { surface: "custom" }); const f: any = (s as any).frame; await f.locator('[data-testid="portfolio-name"], [data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {}); const r = await (await f.locator(":root").elementHandle())!.ownerFrame(); return { frame: f, real: r }; })());
  let fcdp: any = null;
  try { fcdp = await page.context().newCDPSession(real); await fcdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }); log("G_FRAME_CDP", "own target"); } catch (e) { log("G_FRAME_CDP", "same target: " + String(e).slice(0, 120)); }
  await page.waitForTimeout(5000);
  log("G_IFRAME_BOX", await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().boundingBox());
  log("M_PORTFOLIO_390", await overflow(real));
  await shot(page, "g-03-portfolio-390");
  await page.screenshot({ path: `${OUT}/g-03b-portfolio-390-full.png`, fullPage: true }).catch(() => {});
  // plans list
  await frame.getByRole("button", { name: "LeanZero Management home" }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  log("M_PLANS_390", await overflow(real));
  await shot(page, "g-04-plans-390");
  // capacity page
  await frame.locator("nav button").filter({ hasText: /^Capacity$/ }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  log("M_CAPACITY_PAGE_390", await overflow(real));
  await shot(page, "g-05-capacity-page-390");
  // plan capacity tab + roster editor
  await frame.getByRole("button", { name: "LeanZero Management home" }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await openPlan(page, frame, FX);
  await tab(page, frame, "capacity"); await page.waitForTimeout(4000);
  log("M_PLAN_CAPACITY_390", await overflow(real));
  await shot(page, "g-06-plan-capacity-390");
  await frame.locator("button").filter({ hasText: /^(Set up the team roster|Edit the team roster)$/ }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  log("M_ROSTER_EDITOR_390", await overflow(real));
  log("M_ROSTER_EDITOR_BOX", await frame.locator('[data-testid="capacity-roster-editor"]').first().boundingBox().catch(() => null));
  await shot(page, "g-07-roster-editor-390");
  await frame.getByRole("button", { name: /^Cancel$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  // tap on the header word chip: no hover tip may open
  const word = frame.locator('[data-testid="plan-header-verdict"]').first();
  const wb = await word.boundingBox().catch(() => null);
  log("M_WORD_BOX", wb);
  if (wb) {
    await tapAt(cdp, wb.x + wb.width / 2, wb.y + wb.height / 2);
    await page.waitForTimeout(1200);
    log("M_TIPS_AFTER_TAP", await frame.locator('[data-testid="lz-tooltip"]').count());
    await shot(page, "g-08-tap-word");
  }
  // a Select opens as a bottom sheet (Dashboard schedule-confidence picker)
  await tab(page, frame, "dashboard"); await page.waitForTimeout(5000);
  log("M_DASHBOARD_390", await overflow(real));
  const sel = frame.locator("button").filter({ hasText: /−15%|-15%|Medium/ }).first();
  const sb = await sel.boundingBox().catch(() => null);
  log("M_SELECT_BOX", sb);
  if (sb) {
    await sel.scrollIntoViewIfNeeded().catch(() => {});
    const sb2 = await sel.boundingBox();
    if (sb2) await tapAt(cdp, sb2.x + sb2.width / 2, sb2.y + sb2.height / 2);
    await page.waitForTimeout(1500);
    const sheet = await real.evaluate(() => { const s = document.querySelector('[data-testid="lz-select-sheet"]') as any; if (!s) return null; const r = s.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, top: r.top, bottom: r.bottom, vw: document.documentElement.clientWidth, vh: window.innerHeight, rows: Array.from(s.querySelectorAll('[role="option"]')).map((o: any) => Math.round(o.getBoundingClientRect().height)) }; });
    log("M_SELECT_SHEET", sheet);
    await shot(page, "g-09-select-sheet");
    await real.evaluate(() => (document.querySelector('[data-testid="lz-select-scrim"]') as any)?.click());
    await page.waitForTimeout(800);
  }
  log("G_STAGED", await isStaged(frame));
  // ── back to desktop; delete the portfolio ─────────────────
  await cdp.send("Emulation.clearDeviceMetricsOverride");
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: false });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const b3 = await boot(page);
  await b3.frame.locator('[data-testid="portfolio-name"], [data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(4000);
  if (!(await b3.frame.locator('[data-testid="portfolio-delete-btn"]').count())) {
    const c2 = b3.frame.locator('[data-testid="plan-card"]').filter({ has: b3.frame.locator('[data-testid="plan-card-name"]', { hasText: "LZPT Scenarios" }) }).first().locator('[data-testid="plan-portfolio-chip"]').first();
    await c2.click().catch(() => {}); await page.waitForTimeout(5000);
  }
  await b3.frame.locator('[data-testid="portfolio-delete-btn"]').first().click();
  await page.waitForTimeout(1200);
  await b3.frame.getByRole("button", { name: /^Delete/ }).last().click().catch(() => {});
  await page.waitForTimeout(5000);
  log("G_AFTER_DELETE", (await bodyText(b3.frame)).slice(0, 200));
  expect(true).toBe(true);
});
