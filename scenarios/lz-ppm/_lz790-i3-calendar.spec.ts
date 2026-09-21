// LZ790 item 3 — calendar echo. Client B adds a holiday through the Schedule tab;
// client A (second profile, SAME Atlassian account — see the caveat logged below)
// must re-derive. Then the REST holiday route.
import { test } from "../../fixtures/forge";
import { chromium } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz790shots";
const PLAN = "LZ790 retest bed";
const PLAN_ID = "plan-test-muas0boj-ttkdmu";
const PROFILE_B = "/Users/mihaiperdum/Projects/forge-live-harness/.auth/profile-critic4";
test.describe.configure({ retries: 0, timeout: 1_800_000 });

async function openPlanTable(page: any) {
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  for (let i = 0; i < 8; i++) {
    await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
    if (await frame.getByRole("button", { name: /^Table/i }).count()) break;
  }
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  return frame;
}
const eDue = async (f: any) => f.locator('[data-testid="table-row"][data-row-key="WFH-3733"]').first().getAttribute("data-row-due").catch(() => null);

test("I3: calendar echo across two clients, then the REST holiday route", async ({ page }) => {
  await getTestState("lz-ppm", { what: "refreshPlan", planId: PLAN_ID });
  await getTestState("lz-ppm", { what: "clearDrafts", planId: PLAN_ID });
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  const fa = await openPlanTable(page);
  const aCalls: string[] = [];
  page.on("request", (r) => { if (r.method() === "POST") { const d = r.postData() || ""; const m = d.match(/"(getPlanCalendar|getPlanSchedule|getPlan|getNotifications)"/); if (m) aCalls.push(m[1]); } });
  await fa.locator("body").evaluate(() => { (window as any).__ta = []; const seen = new Set<string>(); new MutationObserver(() => { document.querySelectorAll('[data-testid="toast"]').forEach((n: any) => { const t = (n.textContent || "").replace(/\s+/g, " ").trim(); if (!seen.has(t)) { seen.add(t); (window as any).__ta.push(t); } }); }).observe(document.body, { childList: true, subtree: true }); });
  // A holds an UNSAVED edit
  const rowX = fa.locator('[data-testid="table-row"][data-row-key="WFH-3734"]').first();
  await rowX.scrollIntoViewIfNeeded().catch(() => {});
  await rowX.getByText(/^\d+d$/).first().click({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(600);
  await rowX.locator('input[inputmode="numeric"]').first().fill("7");
  await rowX.locator('input[inputmode="numeric"]').first().press("Enter");
  await page.waitForTimeout(2500);
  const saveA = fa.locator('[data-testid="plan-save-btn"]').first();
  const eBefore = await eDue(fa);
  console.log("A: unsaved =", await saveA.getAttribute("data-has-changes"), (await saveA.textContent())?.trim(), "| E due =", eBefore, "| X dur =", await rowX.getAttribute("data-row-duration"));
  await page.screenshot({ path: `${OUT}/i3-00-A-before.png` });

  // ---- client B on the second profile ----
  const ctxB = await chromium.launchPersistentContext(PROFILE_B, { headless: true, viewport: { width: 1440, height: 900 }, channel: "chrome", args: ["--no-first-run", "--no-default-browser-check"] });
  const pageB = ctxB.pages()[0] || (await ctxB.newPage());
  const bCalls: string[] = [];
  pageB.on("request", (r) => { if (r.method() === "POST") { const d = r.postData() || ""; const m = d.match(/"(getPlanCalendar|savePlanSchedule|addPlanHoliday)"/); if (m) bCalls.push(`${m[1]}@${Date.now()}`); } });
  try {
    const fb = await openPlanTable(pageB);
    await fb.locator("body").evaluate(() => { (window as any).__tb = []; const seen = new Set<string>(); new MutationObserver(() => { document.querySelectorAll('[data-testid="toast"]').forEach((n: any) => { const t = (n.textContent || "").replace(/\s+/g, " ").trim(); if (!seen.has(t)) { seen.add(t); (window as any).__tb.push(t); } }); }).observe(document.body, { childList: true, subtree: true }); });
    await fb.getByRole("button", { name: /^Schedule/i }).first().click().catch(() => {});
    await pageB.waitForTimeout(4000);
    await fb.locator("button").filter({ hasText: /Holiday|Bank Holidays/i }).first().click().catch(() => {});
    await pageB.waitForTimeout(1500);
    await pageB.screenshot({ path: `${OUT}/i3-01-B-schedule.png` });
    await fb.locator('button[aria-label="Choose date"]').first().click();
    await pageB.waitForTimeout(800);
    for (let i = 0; i < 6; i++) {
      if (await fb.locator('button[aria-label="2026-11-11"]').count()) break;
      await fb.locator('button[aria-label="Next month"]').first().click();
      await pageB.waitForTimeout(400);
    }
    await fb.locator('button[aria-label="2026-11-11"]').first().click();
    await pageB.waitForTimeout(700);
    await fb.locator('input[placeholder^="Holiday name"]').first().fill("LZ790 probe holiday");
    const bCallsBefore = bCalls.length;
    const tB = Date.now();
    await fb.locator("button").filter({ hasText: /^Add$/ }).first().click();
    await pageB.waitForTimeout(8000);
    console.log("B: calls after Add =", JSON.stringify(bCalls.slice(bCallsBefore).map((c) => c.split("@")[0])));
    console.log("B: toasts =", JSON.stringify(await fb.locator("body").evaluate(() => (window as any).__tb)));
    await pageB.screenshot({ path: `${OUT}/i3-02-B-added.png` });

    // ---- what does A do? ----
    let aMs = -1, aDue = eBefore;
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(1000);
      const now = await eDue(fa);
      if (now !== eBefore) { aDue = now; aMs = Date.now() - tB; break; }
    }
    console.log("A: E due", eBefore, "->", aDue, "| re-derive latency ms", aMs);
    console.log("A: toasts =", JSON.stringify(await fa.locator("body").evaluate(() => (window as any).__ta)));
    console.log("A: refresh-status =", await fa.locator('[data-testid="plan-refresh-status"]').count() ? ((await fa.locator('[data-testid="plan-refresh-status"]').first().textContent()) || "").replace(/\s+/g, " ").trim() : "(none)");
    console.log("A: unsaved still =", await saveA.getAttribute("data-has-changes"), (await saveA.textContent())?.trim(), "| X dur =", await rowX.getAttribute("data-row-duration"));
    console.log("A: getPlanCalendar calls =", aCalls.filter((c) => c === "getPlanCalendar").length, "| all:", JSON.stringify(aCalls.slice(-12)));
    await page.screenshot({ path: `${OUT}/i3-03-A-after.png` });
  } finally { await ctxB.close().catch(() => {}); }
});
