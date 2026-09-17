// TESTER (6.62.0 re-check, items 1 + 2): the Epic row inside a converged chain, the
// member index, the cut ACROSS a shared parent, and the CYCLIC chain's member order.
// Read-only against Jira; the only persisted state is the AI view + overlay, deleted after.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "plan-msq9dg8l-gz6mz1";
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 1_500_000 });

const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const realFrame = async (f: any) => (await (await f.locator(":root").elementHandle())!.ownerFrame())!;

const dumpHeaders = (f: any) => f.locator('[data-testid="gantt-group-header"]').evaluateAll((els: any[]) => els.map((e) => ({
  gv: e.getAttribute("data-group-gv"),
  label: e.getAttribute("data-group-label"),
  work: e.getAttribute("data-group-work-count"),
  parents: e.getAttribute("data-group-parent-count"),
  span: e.getAttribute("data-group-span"),
  chip: (e.querySelector('[data-testid="gantt-segment-parents"]') as any)?.textContent || "",
})));

const rowSeq = (f: any) => f.locator('[data-testid="gantt-group-header"], [data-gantt-row-key]')
  .evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-gantt-row-key") || `__grp__:${e.getAttribute("data-group-gv")}`));

const bars = (f: any) => f.locator('[data-testid="gantt-bar"]').evaluateAll((els: any[]) => els.map((e) => ({
  key: e.getAttribute("data-key"), start: e.getAttribute("data-bar-start"), due: e.getAttribute("data-bar-due"),
  parent: e.getAttribute("data-parent"),
})));

function membersOf(seq: string[], gv: string) {
  const i = seq.indexOf(`__grp__:${gv}`);
  const out: string[] = [];
  for (let j = i + 1; j < seq.length && !seq[j].startsWith("__grp__:"); j++) out.push(seq[j]);
  return out;
}

test("6.62.0 chain cut across a shared parent + cyclic chain order", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const s = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (s as any).frame;
    await page.waitForTimeout(2500);
    await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(3500);
    if (!/Gantt|Table|Dashboard/i.test(await text(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(5000);

    // --- AI structure / chains -------------------------------------------------
    const groupSel = frame.locator('[data-testid="gantt-group-select"] [role="combobox"]').first();
    await groupSel.click({ timeout: 20_000 });
    await page.waitForTimeout(700);
    await frame.getByRole("option", { name: /AI structure/i }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(4000);
    const buildBtn = frame.locator("button").filter({ hasText: /Build AI structure/i }).first();
    if (await buildBtn.count()) { console.log("BUILD -> click"); await buildBtn.click({ timeout: 20_000 }); await page.waitForTimeout(50_000); }
    const trig = frame.locator('[data-testid="ai-strategy-trigger"]').first();
    await trig.waitFor({ state: "visible", timeout: 90_000 });
    if ((await trig.getAttribute("data-strategy")) !== "chains") {
      await trig.click(); await page.waitForTimeout(700);
      await frame.locator('[data-testid="ai-strategy-option"][data-value="chains"]').first().click({ timeout: 20_000 });
      await page.waitForTimeout(30_000);
    }
    console.log("STRATEGY =", await trig.getAttribute("data-strategy"));
    await frame.locator('[data-testid="gantt-depth-issues"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/01-structure.png` });

    const view0: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    const segs0 = view0?.view?.segments || [];
    const asg0 = view0?.view?.assignmentByKey || {};
    console.log("SEGMENTS =", JSON.stringify(segs0.map((x: any) => ({ id: x.id, detId: x.detId, kind: x.kind, name: x.name, n: x.stats?.n }))));
    const detOf = (sid: string) => (segs0.find((x: any) => x.id === sid) || {}).detId;

    // ===================== ITEM 2 — the CYCLIC chain's order =====================
    const cycSid = asg0["LZPT-203"];
    const cycDet = detOf(cycSid);
    const cycSeg = segs0.find((x: any) => x.id === cycSid);
    const cycMembersView = Object.keys(asg0).filter((k) => asg0[k] === cycSid).sort();
    console.log(`CYCLE SEGMENT det=${cycDet} name="${cycSeg?.name}" viewMembers=${cycMembersView.join(",")}`);
    const seq0 = await rowSeq(frame);
    const cycRows = membersOf(seq0, cycDet);
    console.log("CYCLE CHAIN ROW ORDER =", cycRows.join(" > "));
    const hdrs0 = await dumpHeaders(frame);
    console.log("HEADERS0 =", JSON.stringify(hdrs0, null, 1));

    // ===================== ITEM 1 — Cross to Wide ================================
    const TARGET_KEYS = ["LZPT-201", "LZPT-192", "LZPT-193", "LZPT-194", "LZPT-195", "LZPT-196", "LZPT-217"];
    const sid = asg0["LZPT-192"];
    const det = detOf(sid);
    const viewMembers = Object.keys(asg0).filter((k) => asg0[k] === sid);
    console.log("CROSS SEGMENT =", sid, det, "viewMembers:", viewMembers.sort().join(","));
    expect(new Set(viewMembers)).toEqual(new Set(TARGET_KEYS));
    const rows0 = membersOf(seq0, det);
    console.log("CROSS ROWS (before cut) =", rows0.join(" > "));
    const nonMembers = rows0.filter((k) => !viewMembers.includes(k));
    console.log("NON-MEMBER ROWS IN THE BUCKET =", nonMembers.join(","));

    const cutKeys = await frame.locator('[data-testid="gantt-chain-cut-button"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-key")));
    console.log("CUT CONTROLS in bucket =", rows0.filter((k) => cutKeys.includes(k)).join(" > "));
    for (const pk of nonMembers) console.log(`NON-MEMBER ${pk}: cut control present = ${cutKeys.includes(pk)}`);

    // right-click the Epic summary row: nothing must open, and the browser menu is left alone
    const EPIC = nonMembers[0];
    const rf = await realFrame(frame);
    const rc = await rf.evaluate((k: string) => {
      const row = document.querySelector(`[data-gantt-row-key="${k}"]`) as any;
      if (!row) return { found: false } as any;
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 90, clientY: 200 });
      row.dispatchEvent(ev);
      return { found: true, defaultPrevented: ev.defaultPrevented };
    }, EPIC);
    await page.waitForTimeout(900);
    console.log(`EPIC ${EPIC} right-click ->`, JSON.stringify(rc), "menuCount =", await frame.locator('[data-testid="ai-chain-split-menu"]').count());
    await page.screenshot({ path: `${OUT}/02-epic-rightclick.png` });
    expect(await frame.locator('[data-testid="ai-chain-split-menu"]').count()).toBe(0);
    await page.keyboard.press("Escape");

    // the Epic's bracket BEFORE the cut
    const bars0 = await bars(frame);
    const epicBar0 = bars0.find((b: any) => b.key === EPIC);
    console.log("EPIC BAR BEFORE CUT =", JSON.stringify(epicBar0));
    console.log("MEMBER BARS BEFORE =", JSON.stringify(bars0.filter((b: any) => TARGET_KEYS.includes(b.key))));

    // #N on the 4th member
    const FOURTH = rows0.filter((k) => viewMembers.includes(k))[3];
    console.log("4th MEMBER =", FOURTH);
    const cutBtn = frame.locator(`[data-testid="gantt-chain-cut-button"][data-key="${FOURTH}"]`).first();
    const cb = await cutBtn.boundingBox();
    if (cb) await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await page.waitForTimeout(300);
    await cutBtn.click({ timeout: 15_000 });
    await page.waitForTimeout(800);
    const menu = frame.locator('[data-testid="ai-chain-split-menu"]').first();
    const menuTxt = (await menu.innerText()).replace(/\s+/g, " ");
    console.log(`MENU(${FOURTH}) canSplit=${await menu.getAttribute("data-can-split")} text="${menuTxt}"`);
    await page.screenshot({ path: `${OUT}/03-member-menu.png` });

    // also the FIRST member's refusal, and its index
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);
    const FIRST = rows0.filter((k) => viewMembers.includes(k))[0];
    const fb = frame.locator(`[data-testid="gantt-chain-cut-button"][data-key="${FIRST}"]`).first();
    const fbb = await fb.boundingBox(); if (fbb) await page.mouse.move(fbb.x + fbb.width / 2, fbb.y + fbb.height / 2);
    await fb.click({ timeout: 15_000 }); await page.waitForTimeout(700);
    console.log(`MENU(${FIRST}) canSplit=${await frame.locator('[data-testid="ai-chain-split-menu"]').first().getAttribute("data-can-split")} text="${(await frame.locator('[data-testid="ai-chain-split-menu"]').first().innerText()).replace(/\s+/g, " ")}"`);
    await page.keyboard.press("Escape"); await page.waitForTimeout(500);

    // --- the cut ---------------------------------------------------------------
    const cb2 = await cutBtn.boundingBox(); if (cb2) await page.mouse.move(cb2.x + cb2.width / 2, cb2.y + cb2.height / 2);
    await cutBtn.click({ timeout: 15_000 }); await page.waitForTimeout(800);
    await frame.locator('[data-testid="ai-chain-action-split"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(4500);
    await page.screenshot({ path: `${OUT}/04-after-cut.png` });

    const DERIVED = `${det}~${FOURTH}`;
    const hdrs1 = await dumpHeaders(frame);
    console.log("HEADERS AFTER CUT =", JSON.stringify(hdrs1, null, 1));
    const seq1 = await rowSeq(frame);
    console.log("PIECE A ROWS =", membersOf(seq1, det).join(" > "));
    console.log("PIECE B ROWS =", membersOf(seq1, DERIVED).join(" > "));
    const bars1 = await bars(frame);
    console.log("EPIC BARS AFTER CUT =", JSON.stringify(bars1.filter((b: any) => b.key === EPIC)));
    console.log("MEMBER BARS AFTER =", JSON.stringify(bars1.filter((b: any) => TARGET_KEYS.includes(b.key))));
    const ov1: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    console.log("OVERLAY AFTER CUT =", JSON.stringify(ov1?.overlay ?? null));

    // --- undo ------------------------------------------------------------------
    const rhdr = frame.locator(`[data-testid="gantt-group-header"][data-group-gv="${DERIVED}"]`).first();
    await rhdr.locator('[data-testid="gantt-segment-menu-button"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await frame.locator('[data-testid="ai-segment-action-unsplit"]').first().click({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const hdrs2 = await dumpHeaders(frame);
    console.log("HEADERS AFTER UNDO =", JSON.stringify(hdrs2, null, 1));
    const seq2 = await rowSeq(frame);
    console.log("ROWS AFTER UNDO =", membersOf(seq2, det).join(" > "));
    const bars2 = await bars(frame);
    console.log("EPIC BAR AFTER UNDO =", JSON.stringify(bars2.filter((b: any) => b.key === EPIC)));
    const ov2: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    console.log("OVERLAY AFTER UNDO =", JSON.stringify(ov2?.overlay ?? null));
    await page.screenshot({ path: `${OUT}/05-after-undo.png` });

    // --- TABLE parity ----------------------------------------------------------
    await frame.getByRole("button", { name: /^Table/i }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(5000);
    const tgrp = frame.locator('[role="combobox"]').filter({ hasText: /grouping|AI structure|Status/i }).first();
    const tgt = await tgrp.innerText().catch(() => "");
    console.log("TABLE GROUPING =", tgt);
    if (!/AI structure/i.test(tgt)) { await tgrp.click(); await page.waitForTimeout(700); await frame.getByRole("option", { name: /AI structure/i }).first().click(); await page.waitForTimeout(10_000); }
    await page.waitForTimeout(3000);
    const tcut = await frame.locator('[data-testid="table-chain-cut-button"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-key")));
    console.log(`TABLE: cut control on ${EPIC} = ${tcut.includes(EPIC)}; on ${FOURTH} = ${tcut.includes(FOURTH)}; total=${tcut.length}`);
    const trc = await rf.evaluate((k: string) => {
      const row = document.querySelector(`[data-row-key="${k}"]`) as any;
      if (!row) return { found: false } as any;
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 90, clientY: 200 });
      row.dispatchEvent(ev);
      return { found: true, defaultPrevented: ev.defaultPrevented };
    }, EPIC);
    await page.waitForTimeout(800);
    console.log(`TABLE EPIC right-click ->`, JSON.stringify(trc), "menuCount =", await frame.locator('[data-testid="ai-chain-split-menu"]').count());
    await page.screenshot({ path: `${OUT}/06-table.png` });
    await page.keyboard.press("Escape");

    // the Table's own #N, and its cut + undo
    const tb = frame.locator(`[data-testid="table-chain-cut-button"][data-key="${FOURTH}"]`).first();
    const tbb = await tb.boundingBox(); if (tbb) await page.mouse.move(tbb.x + tbb.width / 2, tbb.y + tbb.height / 2);
    await tb.click({ timeout: 15_000 }); await page.waitForTimeout(800);
    console.log(`TABLE MENU(${FOURTH}) text="${(await frame.locator('[data-testid="ai-chain-split-menu"]').first().innerText()).replace(/\s+/g, " ")}"`);
    await page.screenshot({ path: `${OUT}/07-table-menu.png` });
    await frame.locator('[data-testid="ai-chain-action-split"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(4000);
    const th = await frame.locator('[data-testid="table-group-header"], [data-testid="gantt-group-header"]').evaluateAll((els: any[]) => els.map((e) => ({
      gv: e.getAttribute("data-group-gv"), label: e.getAttribute("data-group-label"),
      work: e.getAttribute("data-group-work-count"), parents: e.getAttribute("data-group-parent-count"),
      txt: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 110),
    })));
    console.log("TABLE HEADERS AFTER CUT =", JSON.stringify(th, null, 1));
    const trows = await frame.locator('[data-testid="table-group-header"], [data-testid="table-row"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-row-key") || `__grp__:${e.getAttribute("data-group-gv")}`));
    console.log("TABLE PIECE A =", membersOf(trows, det).join(" > "));
    console.log("TABLE PIECE B =", membersOf(trows, DERIVED).join(" > "));
    await page.screenshot({ path: `${OUT}/08-table-after-cut.png` });
    // undo in the Table
    const trh = frame.locator(`[data-testid="table-group-header"][data-group-gv="${DERIVED}"], [data-testid="gantt-group-header"][data-group-gv="${DERIVED}"]`).first();
    await trh.locator('[data-testid="gantt-segment-menu-button"], [data-testid="table-segment-menu-button"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(800);
    await frame.locator('[data-testid="ai-segment-action-unsplit"]').first().click({ timeout: 10_000 });
    await page.waitForTimeout(4000);
    const ov3: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    console.log("OVERLAY AFTER TABLE UNDO =", JSON.stringify(ov3?.overlay ?? null));
    await page.screenshot({ path: `${OUT}/09-table-after-undo.png` });
  } finally {
    await page.screenshot({ path: `${OUT}/99-final.png` }).catch(() => {});
    await ctx.close().catch(() => {});
  }
});
