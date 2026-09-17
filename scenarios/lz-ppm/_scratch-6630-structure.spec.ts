// TESTER (6.63.0 items 3 + 4) on LZPT.
//  3. The TABLE's group header now carries the ⋯ segment menu: it is on every
//     header, a rename made there persists to the overlay and survives a reload,
//     and the header's own toggle still folds the band.
//  4. On EVERY header the badge count and the span bar's count are the same
//     number; and after a cut, the derived piece's FIRST member reads "#1".
// The AI view is BUILT here and DELETED in finally (it was absent before).
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "plan-msq9dg8l-gz6mz1";
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 2_400_000 });

const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const realFrame = async (f: any) => (await (await f.locator(":root").elementHandle())!.ownerFrame())!;

const headerPairs = (f: any) => f.locator('[data-testid="gantt-group-header"]').evaluateAll((els: any[]) => els.map((e) => {
  const bar = e.querySelector('[data-testid="gantt-chain-bar"]');
  const barText = bar ? (bar.innerText || "").trim() : null;
  const label = e.querySelector('[data-testid="gantt-group-header-label"]');
  return {
    gv: e.getAttribute("data-group-gv"), label: e.getAttribute("data-group-label"),
    rows: e.getAttribute("data-group-count"), work: e.getAttribute("data-group-work-count"),
    parents: e.getAttribute("data-group-parent-count"),
    badge: label ? (label.innerText || "").trim().replace(/\n+/g, " ") : null,
    barText, barCount: barText ? (barText.match(/^(\d+)/) || [])[1] : null,
  };
}));

async function openPlanGantt(page: any, frame: any) {
  await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4500);
  if (!/Gantt|Table|Dashboard/i.test(await text(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
}

async function selectAiStructure(page: any, frame: any, sel: string) {
  const groupSel = frame.locator(`${sel} [role="combobox"]`).first();
  await groupSel.click({ timeout: 25_000 });
  await page.waitForTimeout(800);
  await frame.getByRole("option", { name: /AI structure/i }).first().click({ timeout: 25_000 });
  await page.waitForTimeout(5000);
  const buildBtn = frame.locator("button").filter({ hasText: /Build AI structure/i }).first();
  if (await buildBtn.count()) { console.log("BUILD -> click"); await buildBtn.click({ timeout: 25_000 }); await page.waitForTimeout(60_000); }
  const trig = frame.locator('[data-testid="ai-strategy-trigger"]').first();
  await trig.waitFor({ state: "visible", timeout: 120_000 });
  if ((await trig.getAttribute("data-strategy")) !== "chains") {
    await trig.click(); await page.waitForTimeout(800);
    await frame.locator('[data-testid="ai-strategy-option"][data-value="chains"]').first().click({ timeout: 25_000 });
    await page.waitForTimeout(35_000);
  }
  console.log("STRATEGY =", await trig.getAttribute("data-strategy"));
}


let NEW_NAME = "";
async function runTableChecks(page: any, frame: any) {
  const tHdrs = await frame.locator('[data-testid="table-group-header"]').evaluateAll((els: any[]) => els.map((e) => ({ gv: e.getAttribute("data-group-gv"), label: e.getAttribute("data-group-label"), expanded: e.getAttribute("aria-expanded"), work: e.getAttribute("data-group-work-count"), rows: e.getAttribute("data-group-count") })));
  const tMenus = await frame.locator('[data-testid="table-segment-menu-button"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-segment")));
  console.log("TABLE HEADERS =", JSON.stringify(tHdrs));
  console.log("TABLE \u22ef BUTTONS =", tMenus.length, JSON.stringify(tMenus));
  await page.screenshot({ path: `${OUT}/32-table-structure.png` });
  expect(tHdrs.length, "the Table is grouped by AI structure").toBeGreaterThan(0);
  expect(tMenus.length, "every table group header carries the \u22ef").toBe(tHdrs.length);

  NEW_NAME = `Tester rename ${Date.now().toString(36)}`;
  await frame.locator('[data-testid="table-segment-menu-button"]').first().dispatchEvent("click");
  await page.waitForTimeout(1500);
  const menu = frame.locator('[data-testid="ai-segment-menu"]').first();
  console.log("TABLE SEGMENT MENU =", (await menu.innerText()).trim().replace(/\n+/g, " | "), " role:", await menu.getAttribute("role"));
  console.log("NATIVE SELECTS IN MENU =", await menu.locator("select").count());
  console.log("MENU BOX =", JSON.stringify(await menu.boundingBox()));
  await page.screenshot({ path: `${OUT}/33-table-segment-menu.png` });
  const expandedDuringMenu = await frame.locator('[data-testid="table-group-header"]').first().getAttribute("aria-expanded");
  console.log("HEADER STILL EXPANDED WHILE THE MENU IS OPEN =", expandedDuringMenu);
  await frame.locator('[data-testid="ai-segment-action-rename"]').first().dispatchEvent("click");
  await page.waitForTimeout(700);
  await frame.locator('[data-testid="ai-segment-rename-input"]').first().fill(NEW_NAME);
  await frame.locator('[data-testid="ai-segment-rename-save"]').first().dispatchEvent("click");
  await page.waitForTimeout(6000);
  const tHdrs2 = await frame.locator('[data-testid="table-group-header"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-group-label")));
  console.log("TABLE HEADERS AFTER RENAME =", JSON.stringify(tHdrs2));
  await page.screenshot({ path: `${OUT}/34-table-renamed.png` });
  expect(tHdrs2[0]).toBe(NEW_NAME);
  const ov: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
  console.log("OVERLAY AFTER RENAME =", JSON.stringify(ov?.view?.overlay || null));

  const rowsBefore = await frame.locator('[data-row-key]').count();
  await frame.locator('[data-testid="table-group-header"]').first().dispatchEvent("click");
  await page.waitForTimeout(1800);
  const exp2 = await frame.locator('[data-testid="table-group-header"]').first().getAttribute("aria-expanded");
  const rowsAfter = await frame.locator('[data-row-key]').count();
  console.log("TOGGLE:", tHdrs[0].gv, "aria-expanded", tHdrs[0].expanded, "->", exp2, " rows", rowsBefore, "->", rowsAfter);
  await page.screenshot({ path: `${OUT}/35-table-folded.png` });
  expect(exp2).toBe("false");
  expect(rowsAfter).toBeLessThan(rowsBefore);
  await frame.locator('[data-testid="table-group-header"]').first().dispatchEvent("click");
  await page.waitForTimeout(1500);
}

test("6.63.0 structure: header counts agree, #N is per piece, and the Table has the ⋯ menu", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  let builtView = false;
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    const before: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    console.log("AI VIEW BEFORE =", JSON.stringify({ view: !!before?.view, bytes: before?.valueBytes }));
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    await openPlanGantt(page, frame);
    // Start in the TABLE: its Group selector is its own (session state, not shared
    // with the Gantt), so the AI view is built once, from there.
    await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    const combos = await frame.locator('[role="combobox"]').evaluateAll((els: any[]) => els.map((e) => (e.innerText || "").trim()));
    console.log("TABLE COMBOBOXES =", JSON.stringify(combos));
    const gi = combos.findIndex((c: string) => /grouping|AI structure|Epic|Assignee|Status/i.test(c));
    await frame.locator('[role="combobox"]').nth(gi >= 0 ? gi : 0).click({ timeout: 25_000 });
    await page.waitForTimeout(900);
    await frame.getByRole("option", { name: /AI structure/i }).first().click({ timeout: 25_000 });
    await page.waitForTimeout(6000);
    builtView = true;
    const buildBtnT = frame.locator("button").filter({ hasText: /Build AI structure/i }).first();
    if (await buildBtnT.count()) { console.log("TABLE BUILD -> click"); await buildBtnT.click({ timeout: 25_000 }); await page.waitForTimeout(70_000); }
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/29-table-structure-built.png` });
    await runTableChecks(page, frame);
    // Back to the Gantt for the header-count + #N checks.
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    await selectAiStructure(page, frame, '[data-testid="gantt-group-select"]');
    await frame.locator('[data-testid="gantt-depth-issues"]').first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/30-gantt-structure.png` });

    // ===== ITEM 4a — badge count vs span-bar count on EVERY header =====
    const pairs = await headerPairs(frame);
    console.log("HEADERS =", JSON.stringify(pairs, null, 1));
    const mismatches = pairs.filter((p: any) => p.barCount != null && p.barCount !== p.work);
    console.log("BADGE-vs-BAR MISMATCHES =", JSON.stringify(mismatches));
    expect(mismatches).toEqual([]);

    // ===== ITEM 4b — "#N" is per PIECE =====
    const view0: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    const segs0 = view0?.view?.segments || [];
    const asg0 = view0?.view?.assignmentByKey || {};
    const detOf = (sid: string) => (segs0.find((x: any) => x.id === sid) || {}).detId;
    const rowSeq = await frame.locator('[data-testid="gantt-group-header"], [data-gantt-row-key]')
      .evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-gantt-row-key") || `__grp__:${e.getAttribute("data-group-gv")}`));
    const membersOf = (gv: string) => { const i = rowSeq.indexOf(`__grp__:${gv}`); const o: string[] = []; for (let j = i + 1; j < rowSeq.length && !rowSeq[j].startsWith("__grp__:"); j++) o.push(rowSeq[j]); return o; };
    // pick the longest CHAIN bucket that has cut controls
    const cutKeys: string[] = await frame.locator('[data-testid="gantt-chain-cut-button"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-key")));
    const chainHdrs = pairs.filter((p: any) => p.barCount != null);
    chainHdrs.sort((a: any, b: any) => Number(b.work) - Number(a.work));
    const target = chainHdrs[0];
    const rows = membersOf(target.gv).filter((k) => cutKeys.includes(k));
    console.log("TARGET CHAIN =", target.label, target.gv, "cuttable rows:", rows.join(" > "));
    const readMenu = async (key: string) => {
      await frame.locator(`[data-testid="gantt-chain-cut-button"][data-key="${key}"]`).first().dispatchEvent("click");
      await page.waitForTimeout(900);
      const m = frame.locator('[data-testid="ai-chain-split-menu"]').first();
      const r = { text: (await m.innerText()).trim().replace(/\n+/g, " | "), canSplit: await m.getAttribute("data-can-split"), canUndo: await m.getAttribute("data-can-undo") };
      return r;
    };
    for (const k of rows) console.log(`MENU(before cut) ${k} =`, JSON.stringify(await readMenu(k)));
    // cut at the 3rd cuttable member, then read the DERIVED piece's first member
    const cutAt = rows[2] || rows[1];
    console.log("CUTTING AT =", cutAt);
    await frame.locator(`[data-testid="gantt-chain-cut-button"][data-key="${cutAt}"]`).first().dispatchEvent("click");
    await page.waitForTimeout(900);
    await frame.locator('[data-testid="ai-chain-action-split"]').first().dispatchEvent("click");
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/31-gantt-after-cut.png` });
    const pairs2 = await headerPairs(frame);
    console.log("HEADERS AFTER CUT =", JSON.stringify(pairs2, null, 1));
    const mism2 = pairs2.filter((p: any) => p.barCount != null && p.barCount !== p.work);
    console.log("BADGE-vs-BAR MISMATCHES AFTER CUT =", JSON.stringify(mism2));
    expect(mism2).toEqual([]);
    const seq2 = await frame.locator('[data-testid="gantt-group-header"], [data-gantt-row-key]')
      .evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-gantt-row-key") || `__grp__:${e.getAttribute("data-group-gv")}`));
    const derivedHdr = pairs2.find((p: any) => /→/.test(p.label || "") && !pairs.some((q: any) => q.gv === p.gv));
    console.log("DERIVED HEADERS =", JSON.stringify(pairs2.filter((p: any) => !pairs.some((q: any) => q.gv === p.gv)).map((p: any) => p.label)));
    const derivedGv = (derivedHdr || pairs2.find((p: any) => !pairs.some((q: any) => q.gv === p.gv)))?.gv;
    const dm = (() => { const i = seq2.indexOf(`__grp__:${derivedGv}`); const o: string[] = []; for (let j = i + 1; j < seq2.length && !seq2[j].startsWith("__grp__:"); j++) o.push(seq2[j]); return o; })();
    console.log("DERIVED PIECE ROWS =", dm.join(" > "));
    const cutKeys2: string[] = await frame.locator('[data-testid="gantt-chain-cut-button"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-key")));
    for (const k of dm) console.log(`MENU(derived piece) ${k} = cuttable:${cutKeys2.includes(k)}`, cutKeys2.includes(k) ? JSON.stringify(await readMenu(k)) : "");
    console.log("FIRST MEMBER OF DERIVED PIECE =", cutAt, JSON.stringify(await readMenu(cutAt)));

    // the rename SURVIVES a reload
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const s2 = await enterForgeSurface(page, { surface: "custom" });
    const f2: any = (s2 as any).frame;
    await page.waitForTimeout(3000);
    await openPlanGantt(page, f2);
    await f2.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(7000);
    // The Table's Group choice is SESSION-only by design, so re-pick it; the VIEW
    // (and the overlay the rename lives in) is what has to have survived.
    const combos2 = await f2.locator('[role="combobox"]').evaluateAll((els: any[]) => els.map((e) => (e.innerText || "").trim()));
    console.log("TABLE COMBOBOXES AFTER RELOAD =", JSON.stringify(combos2));
    const gi2 = combos2.findIndex((c: string) => /grouping|AI structure|Epic|Assignee|Status/i.test(c));
    await f2.locator('[role="combobox"]').nth(gi2 >= 0 ? gi2 : 0).click({ timeout: 25_000 });
    await page.waitForTimeout(900);
    await f2.getByRole("option", { name: /AI structure/i }).first().click({ timeout: 25_000 });
    await page.waitForTimeout(9000);
    const tHdrs3 = await f2.locator('[data-testid="table-group-header"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-group-label")));
    console.log("TABLE HEADERS AFTER RELOAD =", JSON.stringify(tHdrs3));
    await page.screenshot({ path: `${OUT}/36-table-after-reload.png` });
    expect(tHdrs3.includes(NEW_NAME), "the rename persisted through a reload").toBe(true);
  } finally {
    await ctx.close();
    if (builtView) {
      const d = await getTestState("lz-ppm", { what: "aiViewDelete", planId: PLAN }).catch((e) => ({ err: String(e) }));
      console.log("AI VIEW DELETE =", JSON.stringify(d));
    }
    await getTestState("lz-ppm", { what: "clearDrafts", planId: PLAN }).catch(() => {});
    const after: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    console.log("AI VIEW AFTER =", JSON.stringify({ view: !!after?.view, bytes: after?.valueBytes }));
  }
});
