// RETEST dev 6.82.0 — the three things p2 left unproven:
//   (a) the VIOLATION TOAST on the refused drag (p2's scrape caught the harness CSS,
//       not the toast; toasts carry no testid, they are `.toast-enter` / `.toast-exit`)
//   (b) the variance headline's InfoTip TEXT (the Tooltip portals to
//       [data-testid="lz-tooltip"] and opens on FOCUS as well as hover)
//   (c) Discard All actually reverting — in p2 it was clicked with no Apply review
//       modal open, and "Discard All" only exists INSIDE that modal, so the click was
//       a no-op and the 60 s autosave draft it left was MINE, not the app's.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
// @ts-ignore
import { loadEnv } from "../../data/env.mjs";
import * as fs from "fs";

loadEnv();
const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/shots";
const NAME = "LC682 Lag Bed";
const PLAN = "plan-test-mu9h1p8f-pxi5vy";
const HEAD = "WFH-3487";
const TAIL = "WFH-3489";
test.describe.configure({ retries: 1, timeout: 2_700_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

async function hook(what: string, params: Record<string, string> = {}) {
  const u = new URL(process.env.LZ_PPM_TESTHOOK_URL!);
  u.searchParams.set("what", what);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${process.env.HARNESS_SECRET}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("p4 — the toast, the tip, and a real Discard All", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(17000);
  const f: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  const R: any = {};
  const toGantt = async () => { await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {}); await page.waitForTimeout(9000); };
  const toDash = async () => { await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {}); await page.waitForTimeout(9000); };
  const barOf = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  const readBars = async () => {
    const o: any = {};
    for (const b of await frame.locator('[data-testid="gantt-bar"]').all())
      o[(await b.getAttribute("data-key"))!] = { start: await b.getAttribute("data-bar-start"), due: await b.getAttribute("data-bar-due"), derived: await b.getAttribute("data-derived") };
    return o;
  };
  const toolbar = async () => {
    const bodyT = await txt(frame.locator("body"));
    const save = frame.locator('[data-testid="plan-save-btn"]');
    return {
      saveText: (await txt(save)).replace(/\n/g, " "), saveState: await save.getAttribute("data-save-state").catch(() => null),
      hasChanges: await save.getAttribute("data-has-changes").catch(() => null),
      applyLabel: (bodyT.match(/Apply\s+\d+\s+change\w*/) || ["(none)"])[0],
      saveCount: (bodyT.match(/Save\s*\(\d+\)/) || ["(none)"])[0], applySeen: /Apply\s+\d+\s+change/.test(bodyT),
    };
  };
  const readToasts = async () => f.evaluate(() => [...document.querySelectorAll(".toast-enter, .toast-exit")].map((e: any) => (e.innerText || e.textContent || "").trim()));
  const drag = async (key: string, days: number) => {
    const box = (await barOf(key).boundingBox())!;
    const st = (await barOf(key).getAttribute("data-bar-start"))!, du = (await barOf(key).getAttribute("data-bar-due"))!;
    const spanD = (new Date(du + "T00:00:00Z").getTime() - new Date(st + "T00:00:00Z").getTime()) / 86400000 + 1;
    const dx = Math.round((box.width / spanD) * days);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (const fr of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * fr, cy, { steps: 6 });
    await page.mouse.up();
    const seen: string[][] = [];
    for (let i = 0; i < 5; i++) { await page.waitForTimeout(900); seen.push(await readToasts()); }
    return { key, days, dx, toastSamples: seen };
  };

  // ---------- (a) the refused drag and its toast ----------
  await toGantt();
  R.barsBefore = await readBars();
  R.toolbarBefore = await toolbar();
  R.refused = await drag(TAIL, 7);
  R.barsAfterRefused = await readBars();
  R.toolbarAfterRefused = await toolbar();
  await page.screenshot({ path: `${OUT}/p4-a-refused-toast.png` });
  console.log("BARS BEFORE", JSON.stringify(R.barsBefore));
  console.log("REFUSED", JSON.stringify(R.refused));
  console.log("BARS AFTER REFUSED", JSON.stringify(R.barsAfterRefused));
  console.log("TOOLBAR AFTER REFUSED", JSON.stringify(R.toolbarAfterRefused));
  R.clearAfterRefused = await hook("clearDrafts", { planId: PLAN });
  console.log("CLEAR AFTER REFUSED", JSON.stringify(R.clearAfterRefused));

  // a second refusal, dragged EARLIER, to be sure the toast is not a one-direction thing
  R.refusedBack = await drag(TAIL, -14);
  R.barsAfterRefusedBack = await readBars();
  R.toolbarAfterRefusedBack = await toolbar();
  console.log("REFUSED BACK", JSON.stringify(R.refusedBack));
  console.log("BARS AFTER REFUSED BACK", JSON.stringify(R.barsAfterRefusedBack));
  console.log("TOOLBAR AFTER REFUSED BACK", JSON.stringify(R.toolbarAfterRefusedBack));
  await page.screenshot({ path: `${OUT}/p4-b-refused-back.png` });
  R.clearAfterRefusedBack = await hook("clearDrafts", { planId: PLAN });
  console.log("CLEAR AFTER REFUSED BACK", JSON.stringify(R.clearAfterRefusedBack));

  // ---------- (b) baseline at zero slip, then the drag and the InfoTip ----------
  await toDash();
  await frame.locator('[data-testid="set-baseline"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(14000);
  R.zeroSlip = {
    variancePanel: await frame.locator('[data-testid="variance-panel"]').count(),
    hint: await f.evaluate(() => { const e: any = document.querySelector(".lz-dash-card-hint"); return e ? e.textContent : null; }),
    hints: await f.evaluate(() => [...document.querySelectorAll(".lz-dash-card-hint")].map((e: any) => e.textContent)),
    setBtnLabel: await txt(frame.locator('[data-testid="set-baseline"]')),
  };
  console.log("ZERO SLIP", JSON.stringify(R.zeroSlip));
  await page.screenshot({ path: `${OUT}/p4-c-baseline-zero.png` });

  await toGantt();
  R.control = await drag(HEAD, 7);
  R.barsAfterControl = await readBars();
  R.toolbarAfterControl = await toolbar();
  console.log("BARS AFTER CONTROL", JSON.stringify(R.barsAfterControl));
  console.log("TOOLBAR AFTER CONTROL", JSON.stringify(R.toolbarAfterControl));

  await toDash();
  const panel = frame.locator('[data-testid="variance-panel"]').first();
  R.panel = {
    net: await panel.getAttribute("data-net"), unit: await panel.getAttribute("data-net-unit"),
    basis: await panel.getAttribute("data-net-basis"), from: await panel.getAttribute("data-finish-from"),
    to: await panel.getAttribute("data-finish-to"), tracked: await panel.getAttribute("data-tracked"),
    text: (await txt(panel)).replace(/\n/g, " | "),
  };
  // FOCUS the InfoTip trigger (tabIndex 0) — a FrameLocator hover fires no mouseenter
  R.tip = await f.evaluate(() => {
    const p: any = document.querySelector('[data-testid="variance-panel"]');
    const q: any = [...p.querySelectorAll("span")].find((e: any) => (e.textContent || "").trim() === "?");
    if (!q) return { found: false };
    const trigger = q.parentElement;
    trigger.focus();
    return { found: true, tabIndex: trigger.tabIndex, tag: trigger.tagName };
  });
  await page.waitForTimeout(1500);
  R.tipText = await f.evaluate(() => [...document.querySelectorAll('[data-testid="lz-tooltip"]')].map((e: any) => (e.textContent || "").trim()));
  console.log("PANEL", JSON.stringify(R.panel));
  console.log("TIP", JSON.stringify(R.tip), "TEXT", JSON.stringify(R.tipText));
  await page.screenshot({ path: `${OUT}/p4-d-variance-tip.png` });

  // ---------- (c) clear baseline, then a REAL Discard All (inside the Apply review) ----------
  await frame.locator('[data-testid="clear-baseline"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(9000);
  R.afterClearBaseline = { panel: await frame.locator('[data-testid="variance-panel"]').count(), clearBtn: await frame.locator('[data-testid="clear-baseline"]').count(), setBtn: await txt(frame.locator('[data-testid="set-baseline"]')) };
  console.log("AFTER CLEAR BASELINE", JSON.stringify(R.afterClearBaseline));

  await frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(7000);
  R.reviewOpen = await frame.locator('[data-testid="apply-review-modal"]').count();
  R.reviewRows = await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.innerText || "").replace(/\n/g, " | ") })));
  R.discardBtn = await frame.locator("button").filter({ hasText: /^Discard All$/ }).count();
  console.log("REVIEW", R.reviewOpen, JSON.stringify(R.reviewRows));
  await page.screenshot({ path: `${OUT}/p4-e-review.png` });
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click");
  await page.waitForTimeout(12000);
  R.toolbarAfterDiscard = await toolbar();
  await toGantt();
  R.barsAfterDiscard = await readBars();
  console.log("TOOLBAR AFTER DISCARD", JSON.stringify(R.toolbarAfterDiscard));
  console.log("BARS AFTER DISCARD", JSON.stringify(R.barsAfterDiscard));
  await page.screenshot({ path: `${OUT}/p4-f-after-discard.png` });
  R.clearAtExit = await hook("clearDrafts", { planId: PLAN });
  console.log("CLEAR AT EXIT", JSON.stringify(R.clearAtExit));
  const bodyT = await txt(frame.locator("body"));
  R.stagedAtExit = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(bodyT);
  console.log("STAGED_AFTER_CLEANUP =", R.stagedAtExit);
  fs.writeFileSync(`${OUT}/p4-results.json`, JSON.stringify(R, null, 2));
  expect(R.barsBefore[TAIL].start).toBe("2026-10-26");
});
