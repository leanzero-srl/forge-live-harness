// RETEST dev 6.82.0 — ITEM 1 (a REFUSED edit stages nothing) and ITEM 4 (net slip is
// the plan's finish moving, in working days).
//
// Bed "LC682 Lag Bed", lag 5 wd on WFH-3488 -> WFH-3489:
//   stored   WFH-3489 10-19..10-23     rendered 10-26..10-30 (derived, zero float)
// ITEM 1  dragging WFH-3489 LATER is refused (a lagged successor's start is PINNED at
//         pred.due + lag): toast, bar back on 10-26, toolbar "Saved", no Apply, no draft.
//   control drag the free head WFH-3487 +7 cal days -> A 10-12/10-16, B 10-19/10-23,
//         C 11-02/11-06 = 3 staged changes; Discard All -> Saved; clearDrafts -> 0.
// ITEM 4  baseline on the untouched plan (served SETTLED) then that same +7 day drag:
//         plan finish 10-30 -> 11-06 = 5 working days. Headline "+5 wd", not "+21d".
//         Rows keep calendar deltas: A +7, B +7, C +7.
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
const TOKEN = JSON.parse(fs.readFileSync("/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/token.json", "utf8"));
test.describe.configure({ retries: 1, timeout: 2_700_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

async function hook(what: string, params: Record<string, string> = {}) {
  const u = new URL(process.env.LZ_PPM_TESTHOOK_URL!);
  u.searchParams.set("what", what);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${process.env.HARNESS_SECRET}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function rest(method: string, qs: string, body?: any) {
  const r = await fetch(`${TOKEN.url}?${qs}`, {
    method, headers: { Authorization: `Bearer ${TOKEN.token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("items 1 + 4 — a refused drag stages nothing; net slip is the finish in wd", async ({ page }) => {
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
  await page.waitForTimeout(17000);
  const f: any = await realFrame();

  const R: any = {};
  const toGantt = async () => { await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {}); await page.waitForTimeout(9000); };
  const toDash = async () => { await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {}); await page.waitForTimeout(9000); };
  const barOf = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  const readBars = async () => {
    const o: any = {};
    for (const b of await frame.locator('[data-testid="gantt-bar"]').all()) {
      const bb = await b.boundingBox();
      o[(await b.getAttribute("data-key"))!] = { start: await b.getAttribute("data-bar-start"), due: await b.getAttribute("data-bar-due"), derived: await b.getAttribute("data-derived"), x: bb ? Math.round(bb.x) : null };
    }
    return o;
  };
  const toolbar = async () => {
    const bodyT = await txt(frame.locator("body"));
    const save = frame.locator('[data-testid="plan-save-btn"]');
    return {
      saveText: (await txt(save)).replace(/\n/g, " "),
      saveState: await save.getAttribute("data-save-state").catch(() => null),
      hasChanges: await save.getAttribute("data-has-changes").catch(() => null),
      applyLabel: (bodyT.match(/Apply\s+\d+\s+change\w*/) || ["(none)"])[0],
      saveCount: (bodyT.match(/Save\s*\(\d+\)/) || ["(none)"])[0],
      applySeen: /Apply\s+\d+\s+change/.test(bodyT),
    };
  };
  const toasts = async () => f.evaluate(() => [...document.querySelectorAll("*")]
    .filter((e: any) => e.children.length === 0 && /(cannot start|required|earliest|must start|before its|violat|snapped|lag)/i.test(e.textContent || ""))
    .map((e: any) => (e.textContent || "").trim()).slice(0, 12));
  const dragDays = async (key: string, days: number) => {
    const box = (await barOf(key).boundingBox())!;
    const span = (d1: string, d2: string) => (new Date(d2 + "T00:00:00Z").getTime() - new Date(d1 + "T00:00:00Z").getTime()) / 86400000 + 1;
    const st = (await barOf(key).getAttribute("data-bar-start"))!;
    const du = (await barOf(key).getAttribute("data-bar-due"))!;
    const pxPerDay = box.width / span(st, du);
    const dx = Math.round(pxPerDay * days);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (const fr of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * fr, cy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(6000);
    return { key, days, barW: Math.round(box.width), pxPerDay: Math.round(pxPerDay * 100) / 100, dx };
  };

  // ============== ITEM 1: the REFUSED drag ==============
  await toGantt();
  R.barsBefore = await readBars();
  R.toolbarBefore = await toolbar();
  console.log("BARS BEFORE", JSON.stringify(R.barsBefore));
  console.log("TOOLBAR BEFORE", JSON.stringify(R.toolbarBefore));
  await page.screenshot({ path: `${OUT}/p2-a-gantt-before.png` });

  R.refusedGeom = await dragDays(TAIL, 7);
  R.barsAfterRefused = await readBars();
  R.toastsRefused = await toasts();
  R.toolbarAfterRefused = await toolbar();
  console.log("REFUSED GEOM", JSON.stringify(R.refusedGeom));
  console.log("BARS AFTER REFUSED", JSON.stringify(R.barsAfterRefused));
  console.log("TOASTS", JSON.stringify(R.toastsRefused));
  console.log("TOOLBAR AFTER REFUSED", JSON.stringify(R.toolbarAfterRefused));
  await page.screenshot({ path: `${OUT}/p2-b-refused.png` });

  // the draft store, from the outside. REST sees only the harness account's draft;
  // the browser is the site admin, so clearDrafts' count is the honest witness.
  R.harnessDraft = await rest("GET", `resource=draft&planId=${PLAN}`);
  R.clearAfterRefused = await hook("clearDrafts", { planId: PLAN });
  console.log("DRAFT (harness acct)", JSON.stringify(R.harnessDraft).slice(0, 300));
  console.log("CLEAR AFTER REFUSED", JSON.stringify(R.clearAfterRefused));

  // ============== ITEM 4: baseline on the untouched plan ==============
  await toDash();
  R.baselineBefore = await txt(frame.locator('[data-testid="variance-panel"]'));
  await frame.locator('[data-testid="set-baseline"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(12000);
  const panel = frame.locator('[data-testid="variance-panel"]').first();
  const readPanel = async () => ({
    present: await panel.count(),
    net: await panel.getAttribute("data-net").catch(() => null),
    unit: await panel.getAttribute("data-net-unit").catch(() => null),
    basis: await panel.getAttribute("data-net-basis").catch(() => null),
    finishFrom: await panel.getAttribute("data-finish-from").catch(() => null),
    finishTo: await panel.getAttribute("data-finish-to").catch(() => null),
    slipped: await panel.getAttribute("data-slipped").catch(() => null),
    ahead: await panel.getAttribute("data-ahead").catch(() => null),
    tracked: await panel.getAttribute("data-tracked").catch(() => null),
    text: (await txt(panel)).replace(/\n/g, " | "),
    rows: await frame.locator('[data-testid="variance-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-key"), slip: e.getAttribute("data-slip"), text: (e.textContent || "").trim() }))),
  });
  R.panelAtBaseline = await readPanel();
  console.log("PANEL AT BASELINE", JSON.stringify(R.panelAtBaseline, null, 1));
  await page.screenshot({ path: `${OUT}/p2-c-baseline-set.png` });

  // ============== the CONTROL drag: the free head, +7 calendar days ==============
  await toGantt();
  R.controlGeom = await dragDays(HEAD, 7);
  R.barsAfterControl = await readBars();
  R.toolbarAfterControl = await toolbar();
  console.log("CONTROL GEOM", JSON.stringify(R.controlGeom));
  console.log("BARS AFTER CONTROL", JSON.stringify(R.barsAfterControl));
  console.log("TOOLBAR AFTER CONTROL", JSON.stringify(R.toolbarAfterControl));
  await page.screenshot({ path: `${OUT}/p2-d-control-drag.png` });

  await toDash();
  R.panelAfterDrag = await readPanel();
  console.log("PANEL AFTER DRAG", JSON.stringify(R.panelAfterDrag, null, 1));
  await page.screenshot({ path: `${OUT}/p2-e-variance.png` });

  // the InfoTip beside the headline must name BOTH units
  const tipBtn = frame.locator('[data-testid="variance-panel"] [data-testid="info-tip"], [data-testid="variance-panel"] button, [data-testid="variance-panel"] svg').first();
  R.tipHtml = await panel.evaluate((e: any) => e.innerHTML.slice(0, 2500)).catch(() => null);
  R.tipTitles = await panel.evaluate((e: any) => [...e.querySelectorAll("*")].map((n: any) => n.getAttribute && (n.getAttribute("title") || n.getAttribute("aria-label") || n.getAttribute("data-tip"))).filter(Boolean)).catch(() => []);
  const tipBox = await tipBtn.boundingBox().catch(() => null);
  if (tipBox) {
    await page.mouse.move(tipBox.x + tipBox.width / 2, tipBox.y + tipBox.height / 2);
    await page.waitForTimeout(1200);
    await page.mouse.move(tipBox.x + tipBox.width / 2 + 1, tipBox.y + tipBox.height / 2);
    await page.waitForTimeout(1800);
  }
  R.tipText = await f.evaluate(() => [...document.querySelectorAll("*")].map((e: any) => e.textContent || "").filter((t: string) => /finish moved from/.test(t)).sort((a: string, b: string) => a.length - b.length).slice(0, 1));
  console.log("TIP TITLES", JSON.stringify(R.tipTitles));
  console.log("TIP TEXT", JSON.stringify(R.tipText));
  await page.screenshot({ path: `${OUT}/p2-f-variance-tip.png` });

  // ============== restore: clear baseline, discard ==============
  await frame.locator('[data-testid="clear-baseline"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);
  const cb0 = frame.locator("button").filter({ hasText: /^(Clear|Yes|Confirm|Remove)/i });
  if (await cb0.count()) await cb0.last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  R.baselineCleared = await frame.locator('[data-testid="variance-panel"]').count();
  R.setBaselineVisibleAgain = await frame.locator('[data-testid="set-baseline"]').count();
  console.log("BASELINE CLEARED panel=", R.baselineCleared, "setBtn=", R.setBaselineVisibleAgain);

  await frame.getByRole("button", { name: /^Discard All$/i }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(3000);
  const cb = frame.locator("button").filter({ hasText: /^(Discard|Discard all|Yes|Confirm)/i });
  if (await cb.count()) await cb.last().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(9000);
  R.toolbarAfterDiscard = await toolbar();
  console.log("TOOLBAR AFTER DISCARD", JSON.stringify(R.toolbarAfterDiscard));
  await toGantt();
  R.barsAfterDiscard = await readBars();
  console.log("BARS AFTER DISCARD", JSON.stringify(R.barsAfterDiscard));
  await page.screenshot({ path: `${OUT}/p2-g-after-discard.png` });

  R.clearAtExit = await hook("clearDrafts", { planId: PLAN });
  R.baselineAtExit = await rest("GET", `resource=baseline&planId=${PLAN}`);
  console.log("CLEAR AT EXIT", JSON.stringify(R.clearAtExit));
  console.log("BASELINE AT EXIT", JSON.stringify(R.baselineAtExit).slice(0, 300));
  const bodyT = await txt(frame.locator("body"));
  R.stagedAtExit = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(bodyT);
  console.log("STAGED_AFTER_CLEANUP =", R.stagedAtExit);
  fs.writeFileSync(`${OUT}/p2-results.json`, JSON.stringify(R, null, 2));
  expect(R.barsBefore[TAIL].start).toBe("2026-10-26");
});
