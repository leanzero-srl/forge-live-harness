// RETEST dev 6.82.0 — p4 re-run, instrumented. p4's variance panel read
// data-finish-from 2026-11-06 where the untouched plan finishes 2026-10-30, so either
// the refused drag DID stage in that run or the baseline captured the client's edited
// schedule. This spec writes its evidence after EVERY phase and reads the baseline back
// over REST, so the answer does not depend on the run reaching the end.
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
test.describe.configure({ retries: 0, timeout: 2_700_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

async function hook(what: string, params: Record<string, string> = {}) {
  const u = new URL(process.env.LZ_PPM_TESTHOOK_URL!);
  u.searchParams.set("what", what);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${process.env.HARNESS_SECRET}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function rest(method: string, qs: string, body?: any) {
  const r = await fetch(`${TOKEN.url}?${qs}`, { method, headers: { Authorization: `Bearer ${TOKEN.token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test("p5 — refused drag, baseline provenance, InfoTip, real Discard All", async ({ page }) => {
  const R: any = {};
  const save = () => fs.writeFileSync(`${OUT}/p5-results.json`, JSON.stringify(R, null, 2));
  await page.setViewportSize({ width: 1700, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 150_000 });
  await page.waitForTimeout(3000);
  R.storedAtStart = (await hook("plan", { planId: PLAN })).body?.issues?.map((i: any) => [i.key, i.startDate, i.dueDate]);
  R.draftAtStart = await hook("clearDrafts", { planId: PLAN });
  R.baselineAtStart = await rest("GET", `resource=baseline&planId=${PLAN}`);
  save();
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(18000);
  const f: any = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  const toGantt = async () => { await frame.getByRole("button", { name: /^Gantt$/i }).first().click().catch(() => {}); await page.waitForTimeout(9000); };
  const toDash = async () => { await frame.getByRole("button", { name: /^Dashboard$/i }).first().click().catch(() => {}); await page.waitForTimeout(10000); };
  const barOf = (k: string) => frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first();
  const readBars = async () => {
    const o: any = {};
    for (const b of await frame.locator('[data-testid="gantt-bar"]').all())
      o[(await b.getAttribute("data-key"))!] = { start: await b.getAttribute("data-bar-start"), due: await b.getAttribute("data-bar-due"), derived: await b.getAttribute("data-derived") };
    return o;
  };
  const toolbar = async () => {
    const bodyT = await txt(frame.locator("body"));
    const sv = frame.locator('[data-testid="plan-save-btn"]');
    return { saveText: (await txt(sv)).replace(/\n/g, " "), saveState: await sv.getAttribute("data-save-state").catch(() => null), hasChanges: await sv.getAttribute("data-has-changes").catch(() => null), applyLabel: (bodyT.match(/Apply\s+\d+\s+change\w*/) || ["(none)"])[0], saveCount: (bodyT.match(/Save\s*\(\d+\)/) || ["(none)"])[0], applySeen: /Apply\s+\d+\s+change/.test(bodyT) };
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
    const seen: any[] = [];
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(900); const t = await readToasts(); if (t.length) seen.push(t); }
    return { key, days, dx, from: `${st}..${du}`, toasts: seen };
  };

  // ---------- phase 1: the refused drag ----------
  await toGantt();
  R.p1_barsBefore = await readBars();
  R.p1_toolbarBefore = await toolbar();
  save();
  R.p1_drag = await drag(TAIL, 7);
  R.p1_barsAfter = await readBars();
  R.p1_toolbarAfter = await toolbar();
  await page.screenshot({ path: `${OUT}/p5-1-refused.png` });
  R.p1_draft = await hook("clearDrafts", { planId: PLAN });
  save();
  console.log("P1 before", JSON.stringify(R.p1_barsBefore), JSON.stringify(R.p1_toolbarBefore));
  console.log("P1 drag", JSON.stringify(R.p1_drag));
  console.log("P1 after", JSON.stringify(R.p1_barsAfter), JSON.stringify(R.p1_toolbarAfter), "draft", JSON.stringify(R.p1_draft));

  // ---------- phase 2: the same row dragged EARLIER ----------
  R.p2_drag = await drag(TAIL, -14);
  R.p2_barsAfter = await readBars();
  R.p2_toolbarAfter = await toolbar();
  await page.screenshot({ path: `${OUT}/p5-2-refused-back.png` });
  R.p2_draft = await hook("clearDrafts", { planId: PLAN });
  save();
  console.log("P2 drag", JSON.stringify(R.p2_drag));
  console.log("P2 after", JSON.stringify(R.p2_barsAfter), JSON.stringify(R.p2_toolbarAfter), "draft", JSON.stringify(R.p2_draft));

  // ---------- phase 3: baseline on the untouched plan, read back over REST ----------
  await toDash();
  R.p3_toolbarBeforeBaseline = await toolbar();
  await frame.locator('[data-testid="set-baseline"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(15000);
  R.p3_ui = {
    variancePanel: await frame.locator('[data-testid="variance-panel"]').count(),
    hints: await f.evaluate(() => [...document.querySelectorAll(".lz-dash-card-hint")].map((e: any) => e.textContent)),
    setBtn: await txt(frame.locator('[data-testid="set-baseline"]')),
  };
  const bl = await rest("GET", `resource=baseline&planId=${PLAN}`);
  R.p3_baselineRows = bl.body?.baseline?.issues ? Object.entries(bl.body.baseline.issues).map(([k, v]: any) => [k, v.startDate, v.dueDate]) : bl.body;
  R.p3_baselineSettledFlag = bl.body?.baseline?.settled ?? bl.body?.settled ?? null;
  save();
  await page.screenshot({ path: `${OUT}/p5-3-baseline.png` });
  console.log("P3 ui", JSON.stringify(R.p3_ui));
  console.log("P3 baseline rows", JSON.stringify(R.p3_baselineRows), "settled", R.p3_baselineSettledFlag);

  // ---------- phase 4: the control drag ----------
  await toGantt();
  R.p4_drag = await drag(HEAD, 7);
  R.p4_barsAfter = await readBars();
  R.p4_toolbarAfter = await toolbar();
  save();
  console.log("P4 drag", JSON.stringify(R.p4_drag));
  console.log("P4 after", JSON.stringify(R.p4_barsAfter), JSON.stringify(R.p4_toolbarAfter));
  await page.screenshot({ path: `${OUT}/p5-4-control.png` });

  // ---------- phase 5: the variance panel and its InfoTip ----------
  await toDash();
  const panel = frame.locator('[data-testid="variance-panel"]').first();
  R.p5_panel = {
    net: await panel.getAttribute("data-net"), unit: await panel.getAttribute("data-net-unit"), basis: await panel.getAttribute("data-net-basis"),
    from: await panel.getAttribute("data-finish-from"), to: await panel.getAttribute("data-finish-to"),
    slipped: await panel.getAttribute("data-slipped"), ahead: await panel.getAttribute("data-ahead"), tracked: await panel.getAttribute("data-tracked"),
    text: (await txt(panel)).replace(/\n/g, " | "),
    rows: await frame.locator('[data-testid="variance-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-key"), slip: e.getAttribute("data-slip") }))),
  };
  R.p5_tipFocus = await f.evaluate(() => {
    const p: any = document.querySelector('[data-testid="variance-panel"]');
    const q: any = [...p.querySelectorAll("span")].find((e: any) => (e.textContent || "").trim() === "?");
    if (!q) return { found: false };
    const w: any = q.closest('span[tabindex="0"]') || q.parentElement;
    w.focus();
    return { found: true, tabIndex: w.tabIndex, viaClosest: !!q.closest('span[tabindex="0"]') };
  });
  await page.waitForTimeout(1800);
  R.p5_tipText = await f.evaluate(() => [...document.querySelectorAll('[data-testid="lz-tooltip"]')].map((e: any) => (e.textContent || "").trim()));
  save();
  console.log("P5 panel", JSON.stringify(R.p5_panel));
  console.log("P5 tip", JSON.stringify(R.p5_tipFocus), JSON.stringify(R.p5_tipText));
  await page.screenshot({ path: `${OUT}/p5-5-variance.png` });

  // ---------- phase 6: clear baseline, then Discard All from inside the Apply review ----------
  await frame.locator('[data-testid="clear-baseline"]').first().dispatchEvent("click").catch(() => {});
  await page.waitForTimeout(10000);
  R.p6_afterClear = { panel: await frame.locator('[data-testid="variance-panel"]').count(), clearBtn: await frame.locator('[data-testid="clear-baseline"]').count() };
  R.p6_baselineRest = await rest("GET", `resource=baseline&planId=${PLAN}`);
  save();
  await toGantt();
  for (let attempt = 0; attempt < 4; attempt++) {
    const btn = frame.locator("button").filter({ hasText: /Apply \d+ change/ }).first();
    if (await btn.count()) { await btn.dispatchEvent("click").catch(() => {}); }
    await page.waitForTimeout(6000);
    if (await frame.locator('[data-testid="apply-review-modal"]').count()) break;
    R[`p6_applyAttempt${attempt}`] = await toolbar();
  }
  R.p6_review = {
    modal: await frame.locator('[data-testid="apply-review-modal"]').count(),
    rows: await frame.locator('[data-testid="apply-change-row"]').evaluateAll((els: any[]) => els.map((e) => ({ key: e.getAttribute("data-issue-key"), text: (e.innerText || "").replace(/\n/g, " | ") }))),
    discardBtn: await frame.locator("button").filter({ hasText: /^Discard All$/ }).count(),
  };
  save();
  console.log("P6 review", JSON.stringify(R.p6_review));
  await page.screenshot({ path: `${OUT}/p5-6-review.png` });
  if (R.p6_review.discardBtn) {
    await frame.locator("button").filter({ hasText: /^Discard All$/ }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(14000);
  }
  R.p6_toolbarAfterDiscard = await toolbar();
  await toGantt();
  R.p6_barsAfterDiscard = await readBars();
  R.p6_draft = await hook("clearDrafts", { planId: PLAN });
  R.p6_stored = (await hook("plan", { planId: PLAN })).body?.issues?.map((i: any) => [i.key, i.startDate, i.dueDate]);
  const bodyT = await txt(frame.locator("body"));
  R.stagedAtExit = /Apply\s+\d+\s+change|Save\s*\(\d+\)/.test(bodyT);
  save();
  console.log("P6 after discard", JSON.stringify(R.p6_toolbarAfterDiscard), JSON.stringify(R.p6_barsAfterDiscard));
  console.log("P6 draft", JSON.stringify(R.p6_draft), "stored", JSON.stringify(R.p6_stored));
  console.log("STAGED_AFTER_CLEANUP =", R.stagedAtExit);
  await page.screenshot({ path: `${OUT}/p5-7-final.png` });
  expect(R.p1_barsBefore[TAIL].start).toBe("2026-10-26");
});
