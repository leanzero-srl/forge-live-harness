// RETEST dev 6.82.0 — INDEPENDENT re-drive of items 1 + 4, and the STANDING WITNESS
// (f59ee69f). p5 saw clearDrafts -> cleared:1 after a Discard All that looked clean.
// draft-store.mjs:128 writes a TOMBSTONE head (state:'deleted') on discard, and the
// hook counts keys by prefix — so cleared:1 may be a tombstone, not a live draft.
// The only oracle that matters: RELOAD and see whether the discarded edits come back.
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
const NAME = "LC682V Lag Bed";
const PLAN = "plan-test-mu9jexjb-f59lhy";
const HEAD = "WFH-3508";
const TAIL = "WFH-3510";
test.describe.configure({ retries: 1, timeout: 2_700_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";
async function hook(what: string, params: Record<string, string> = {}) {
  const u = new URL(process.env.LZ_PPM_TESTHOOK_URL!);
  u.searchParams.set("what", what);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${process.env.HARNESS_SECRET}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("p7 — refused drag stages nothing; discard leaves nothing that comes back", async ({ page }) => {
  const R: any = {};
  const wr = () => fs.writeFileSync(`${OUT}/p7-results.json`, JSON.stringify(R, null, 2));
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  R.clearBefore = await hook("clearDrafts", { planId: PLAN });

  let frame: any;
  const open = async () => {
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    frame = s.frame;
    await page.waitForTimeout(4000);
    await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(3000);
    await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
    await page.waitForTimeout(20000);
    await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
    await page.waitForTimeout(9000);
  };
  const readBars = async () => {
    const o: any = {};
    for (const b of await frame.locator('[data-testid="gantt-bar"]').all())
      o[(await b.getAttribute("data-key"))!] = {
        span: `${await b.getAttribute("data-bar-start")}..${await b.getAttribute("data-bar-due")}`,
        derived: await b.getAttribute("data-row-derived"),
      };
    return o;
  };
  const toolbar = async () => {
    const bodyT = await txt(frame.locator("body"));
    const sv = frame.locator('[data-testid="plan-save-btn"]');
    return {
      saveText: (await txt(sv)).replace(/\n/g, " "),
      saveState: await sv.getAttribute("data-save-state").catch(() => null),
      hasChanges: await sv.getAttribute("data-has-changes").catch(() => null),
      applySeen: /Apply\s+\d+\s+change/.test(bodyT),
      saveCountSeen: /Save\s*\(\d+\)/.test(bodyT),
      otherDraftBanner: /someone else|another user|has a draft|unsaved draft/i.test(bodyT),
    };
  };
  const drag = async (key: string, calDays: number) => {
    const bar = frame.locator(`[data-testid="gantt-bar"][data-key="${key}"]`).first();
    await bar.scrollIntoViewIfNeeded();
    const box = (await bar.boundingBox())!;
    const dx = Math.round((box.width / 5) * calDays);
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(6000);
    return { key, calDays, dx, barW: box.width };
  };

  await open();
  R.barsBefore = await readBars();
  R.toolbarBefore = await toolbar();
  wr(); console.log("BEFORE", JSON.stringify(R.barsBefore), JSON.stringify(R.toolbarBefore));

  // ---------- ITEM 1: the REFUSED drag ----------
  R.refusedGeom = await drag(TAIL, 7);
  R.refusedToast = await page.locator('#aui-flag-container, [data-testid="flag-group"]').allInnerTexts().catch(() => []);
  R.refusedToastInFrame = await frame.locator('[data-testid="lz-toast"], .lz-toast, [role="alert"]').allInnerTexts().catch(() => []);
  R.barsAfterRefused = await readBars();
  R.toolbarAfterRefused = await toolbar();
  await page.screenshot({ path: `${OUT}/p7-1-refused.png` });
  R.clearAfterRefused = await hook("clearDrafts", { planId: PLAN });
  wr(); console.log("REFUSED", JSON.stringify(R.barsAfterRefused), JSON.stringify(R.toolbarAfterRefused), JSON.stringify(R.clearAfterRefused));

  // ---------- ITEM 4: baseline, then the control drag, then the variance headline ----------
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(10000);
  const setBtn = frame.locator("button").filter({ hasText: /^(Set baseline|Update baseline)$/ }).first();
  R.baselineBtnBefore = await txt(setBtn);
  await setBtn.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(12000);
  const readVariance = async () => {
    const panel = frame.locator('[data-testid="variance-panel"]').first();
    if (!(await panel.count())) return { present: 0 };
    return {
      present: 1,
      net: await panel.getAttribute("data-net"),
      unit: await panel.getAttribute("data-unit"),
      basis: await panel.getAttribute("data-basis"),
      finishFrom: await panel.getAttribute("data-finish-from"),
      finishTo: await panel.getAttribute("data-finish-to"),
      text: (await txt(panel)).replace(/\n/g, " | "),
      rows: await Promise.all((await frame.locator('[data-testid="variance-row"]').all()).map(async (r: any) => ({ key: await r.getAttribute("data-key"), slip: await r.getAttribute("data-slip") }))),
    };
  };
  R.varianceAtBaseline = await readVariance();
  await page.screenshot({ path: `${OUT}/p7-2a-baseline.png` });
  wr(); console.log("BASELINE", JSON.stringify(R.varianceAtBaseline));
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000);

  // ---------- CONTROL: the free head, +1 week ----------
  R.controlGeom = await drag(HEAD, 7);
  R.barsAfterControl = await readBars();
  R.toolbarAfterControl = await toolbar();
  await page.screenshot({ path: `${OUT}/p7-2-control.png` });
  wr(); console.log("CONTROL", JSON.stringify(R.barsAfterControl), JSON.stringify(R.toolbarAfterControl));

  // variance after the control drag + the InfoTip that glosses the units
  await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {});
  await page.waitForTimeout(11000);
  R.varianceAfterDrag = await readVariance();
  await page.screenshot({ path: `${OUT}/p7-2b-variance.png` });
  const tipHost = frame.locator('[data-testid="variance-panel"] [tabindex="0"]').first();
  const tb = await tipHost.boundingBox().catch(() => null);
  if (tb) { await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await page.waitForTimeout(2500); }
  R.varianceTip = await frame.locator('[role="tooltip"], .lz-infotip-bubble, [data-testid="infotip-bubble"]').allInnerTexts().catch(() => []);
  if (!R.varianceTip.length) {
    R.varianceTip = await frame.locator('[data-testid="variance-panel"]').first()
      .evaluate((el: any) => Array.from(el.querySelectorAll("*")).map((n: any) => n.getAttribute && (n.getAttribute("title") || n.getAttribute("aria-label"))).filter(Boolean)).catch(() => []);
  }
  await page.screenshot({ path: `${OUT}/p7-2c-variance-tip.png` });
  wr(); console.log("VARIANCE", JSON.stringify(R.varianceAfterDrag), "TIP", JSON.stringify(R.varianceTip));
  // clear the baseline before discarding
  const clearBtn = frame.locator("button").filter({ hasText: /^Clear baseline$/ }).first();
  R.clearBaselineSeen = await clearBtn.count();
  await clearBtn.dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  R.varianceAfterClear = await readVariance();
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  wr();

  // let the autosave write a real draft before discarding
  await page.waitForTimeout(80000);
  R.toolbarAfterAutosave = await toolbar();

  // ---------- Discard All from the Apply review ----------
  await frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(8000);
  R.reviewModal = await frame.locator('[data-testid="apply-review-modal"]').count();
  await page.screenshot({ path: `${OUT}/p7-3-review.png` });
  await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(16000);
  R.toolbarAfterDiscard = await toolbar();
  await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  R.barsAfterDiscard = await readBars();
  await page.screenshot({ path: `${OUT}/p7-4-after-discard.png` });
  wr(); console.log("DISCARD", JSON.stringify(R.barsAfterDiscard), JSON.stringify(R.toolbarAfterDiscard));

  // ---------- THE HARM TEST: full reload, does the edit come back? ----------
  await open();
  R.barsAfterReload = await readBars();
  R.toolbarAfterReload = await toolbar();
  await page.screenshot({ path: `${OUT}/p7-5-after-reload.png` });
  wr(); console.log("RELOAD", JSON.stringify(R.barsAfterReload), JSON.stringify(R.toolbarAfterReload));

  R.clearAtExit = await hook("clearDrafts", { planId: PLAN });
  R.clearAgain = await hook("clearDrafts", { planId: PLAN });
  R.stagedAtExit = R.toolbarAfterReload.applySeen || R.toolbarAfterReload.saveCountSeen;
  console.log("CLEAR AT EXIT", JSON.stringify(R.clearAtExit), "AGAIN", JSON.stringify(R.clearAgain));
  console.log("STAGED_AFTER_CLEANUP =", R.stagedAtExit);
  wr();
  expect(Object.keys(R.barsBefore).length).toBe(3);
});
