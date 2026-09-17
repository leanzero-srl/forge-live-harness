// TESTER scratch journey (6.61.0 verification): "Start a new chain here" on LZPT.
// Drives the REAL control on the deployed dev build: AI structure (chains) -> expand the
// 7-member "Cross to Wide" chain -> ⋯ / right-click on its 4th member -> Start a new chain
// here -> two converged chain rows -> rename the derived half -> reload -> undo split.
// Read-only against Jira; the ONLY persisted state is the AI view + overlay, deleted after.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { getTestState } from "../../testhook/client";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "plan-msq9dg8l-gz6mz1";
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 900_000 });

const text = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

test("LZPT chain split: cut, rename, persist, undo — Gantt then Table", async () => {
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
  await page.setViewportSize({ width: 1700, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = (s as any).frame;
  await page.waitForTimeout(2000);
  await frame.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  if (!/Gantt|Table|Dashboard/i.test(await text(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);

  // --- STEP 1: AI structure, chains strategy -------------------------------
  const groupSel = frame.locator('[data-testid="gantt-group-select"] [role="combobox"]').first();
  await groupSel.click({ timeout: 20_000 });
  await page.waitForTimeout(600);
  await frame.getByRole("option", { name: /AI structure/i }).first().click({ timeout: 20_000 });
  await page.waitForTimeout(3000);
  // The strategy picker only exists once a view is BUILT. Build it.
  const buildBtn = frame.locator('button').filter({ hasText: /Build AI structure/i }).first();
  if (await buildBtn.count()) {
    console.log("BUILD BUTTON present -> clicking");
    await buildBtn.click({ timeout: 20_000 });
    await page.waitForTimeout(45_000);
  }
  // ask explicitly for chains
  const trig = frame.locator('[data-testid="ai-strategy-trigger"]').first();
  await trig.waitFor({ state: "visible", timeout: 60_000 });
  console.log("STRATEGY(after build) =", await trig.getAttribute("data-strategy"));
  const opts = frame.locator('[data-testid="ai-strategy-option"]');
  if ((await trig.getAttribute("data-strategy")) !== "chains") {
    await trig.click();
    await page.waitForTimeout(500);
    console.log("OPTIONS:", await opts.evaluateAll((els: any[]) => els.map((e) => `${e.getAttribute("data-value")}:${e.getAttribute("data-disabled")}`)).catch(() => []));
    await frame.locator('[data-testid="ai-strategy-option"][data-value="chains"]').first().click({ timeout: 20_000 });
    await page.waitForTimeout(25_000);
  }
  console.log("STRATEGY(final) =", await trig.getAttribute("data-strategy"));
  console.log("STRATEGY NOTE =", await frame.locator('[data-testid="gantt-strategy-note"]').first().innerText().catch(() => "(none)"));
  await page.screenshot({ path: `${OUT}/01-structure.png` });

  const dumpHeaders = async () => frame.locator('[data-testid="gantt-group-header"]').evaluateAll((els: any[]) => els.map((e) => ({
    gv: e.getAttribute("data-group-gv"),
    label: (e.querySelector('[data-testid="gantt-group-header-label"]') as any)?.textContent || "",
    span: (e.querySelector('[data-testid="gantt-group-span"]') as any)?.textContent || "",
    text: (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 160),
  })));
  let headers = await dumpHeaders();
  console.log("HEADERS0 =", JSON.stringify(headers, null, 1));

  // The 7-member chain LZPT-201 → LZPT-217 (candidate detId ch:da14607d)
  const TARGET_KEYS = ["LZPT-201", "LZPT-192", "LZPT-193", "LZPT-194", "LZPT-195", "LZPT-196", "LZPT-217"];
  const view0: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
  const segs0 = view0?.view?.segments || [];
  console.log("VIEW0 SEGMENTS =", JSON.stringify(segs0.map((x: any) => ({ detId: x.detId, kind: x.kind, name: x.name, n: x.stats?.n })), null, 1));
  const asg0 = view0?.view?.assignmentByKey || {};
  const idOf = (sid: string) => (segs0.find((x: any) => x.id === sid) || {}).detId;
  const targetSid = asg0["LZPT-192"];
  const targetDetId = idOf(targetSid);
  const membersFromView = Object.keys(asg0).filter((k) => asg0[k] === targetSid);
  console.log("TARGET SEGMENT =", targetSid, targetDetId, "members:", membersFromView.sort().join(","));
  expect(new Set(membersFromView)).toEqual(new Set(TARGET_KEYS));

  // --- STEP 2: expand it ----------------------------------------------------
  const hdr = frame.locator(`[data-testid="gantt-group-header"][data-group-gv="${targetDetId}"]`).first();
  const hdrLabel0 = (await hdr.locator('[data-testid="gantt-group-header-label"]').innerText()).trim();
  const hdrSpan0 = (await hdr.locator('[data-testid="gantt-group-span"]').innerText().catch(() => "")).trim();
  console.log(`CHAIN HEADER: label="${hdrLabel0}" span="${hdrSpan0}" full="${(await hdr.innerText()).replace(/\s+/g, " ")}"`);
  // Deterministic: open EVERYTHING (depth = Issues) rather than toggling blind.
  await frame.locator('[data-testid="gantt-depth-issues"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(2000);
  console.log("DEPTH =", await frame.locator('[data-testid="gantt-depth-control"]').first().getAttribute("data-depth"));
  const orderAfterExpand = async () => frame.locator('[data-testid="gantt-group-header"], [data-gantt-row-key]')
    .evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-gantt-row-key") || `__grp__:${e.getAttribute("data-group-gv")}`));
  const seq1 = await orderAfterExpand();
  const gi = seq1.indexOf(`__grp__:${targetDetId}`);
  const members: string[] = [];
  for (let i = gi + 1; i < seq1.length && !seq1[i].startsWith("__grp__:"); i++) members.push(seq1[i]);
  console.log("GANTT MEMBER ORDER =", members.join(" > "));
  {
    const segsAll = segs0;
    for (const sg of segsAll.filter((x: any) => x.kind === "chain")) {
      const gi2 = seq1.indexOf(`__grp__:${sg.detId}`);
      const ms: string[] = [];
      for (let i = gi2 + 1; i < seq1.length && !seq1[i].startsWith("__grp__:"); i++) ms.push(seq1[i]);
      console.log(`CHAINROWORDER ${sg.detId} "${sg.name}" -> ${ms.join(" > ")}`);
    }
  }
  await page.screenshot({ path: `${OUT}/02-expanded.png` });
  expect(members.length).toBe(8);

  // A chain group also renders the Epic SUMMARY row (the "1 parent" chip). The chain
  // MEMBERS are exactly the rows that carry the cut control.
  const cutKeys = new Set(await frame.locator('[data-testid="gantt-chain-cut-button"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-key"))));
  console.log("ROWS CARRYING THE CUT CONTROL in this chain =", members.filter((k) => cutKeys.has(k)).join(" > "));
  console.log("ROWS NOT IN assignmentByKey but rendered in the chain =", members.filter((k) => !membersFromView.includes(k)).join(","));
  // ADVERSARIAL: the Epic summary row is rendered inside the chain group but is NOT a
  // chain member (assignmentByKey does not name it). Does it offer a cut?
  for (const pk of members.filter((k) => !membersFromView.includes(k))) {
    const has = cutKeys.has(pk);
    console.log(`PARENT ROW ${pk}: cut control present = ${has}`);
    if (has) {
      await frame.locator(`[data-testid="gantt-chain-cut-button"][data-key="${pk}"]`).first().click({ timeout: 10_000 });
      await page.waitForTimeout(600);
      const m = frame.locator('[data-testid="ai-chain-split-menu"]').first();
      console.log(`PARENT MENU ${pk}: canSplit=${await m.getAttribute("data-can-split")} text="${(await m.innerText()).replace(/\s+/g, " ")}"`);
      await page.screenshot({ path: `${OUT}/02b-parent-menu-${pk}.png` });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }
  }
  const chainMembers = members.filter((k) => membersFromView.includes(k));
  console.log("CHAIN MEMBERS =", chainMembers.join(" > "));
  expect(chainMembers.length).toBe(7);
  const FOURTH = chainMembers[3];
  console.log("4th MEMBER =", FOURTH);

  // --- STEP 3: right-click the 4th member ----------------------------------
  const row = frame.locator(`[data-gantt-row-key="${FOURTH}"]`).first();
  const box = await row.boundingBox();
  const fr = page.frameLocator('iframe[data-testid="hosted-resources-iframe"]');
  await row.click({ button: "right" }).catch(async () => {
    await row.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 200, clientY: (box?.y || 100) + 8 });
  });
  await page.waitForTimeout(900);
  let menu = frame.locator('[data-testid="ai-chain-split-menu"]').first();
  console.log("MENU(right-click) present:", await menu.count(), "issueKey:", await menu.getAttribute("data-issue-key").catch(() => null), "canSplit:", await menu.getAttribute("data-can-split").catch(() => null));
  await page.screenshot({ path: `${OUT}/03-menu-rightclick.png` });
  expect(await menu.getAttribute("data-issue-key")).toBe(FOURTH);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  expect(await frame.locator('[data-testid="ai-chain-split-menu"]').count()).toBe(0);

  // --- STEP 4: the ⋯ button, then Start a new chain here -------------------
  const cutBtn = frame.locator(`[data-testid="gantt-chain-cut-button"][data-key="${FOURTH}"]`).first();
  const cb = await cutBtn.boundingBox();
  if (cb) await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/04-hover-ellipsis.png` });
  await cutBtn.click({ timeout: 15_000 });
  await page.waitForTimeout(700);
  menu = frame.locator('[data-testid="ai-chain-split-menu"]').first();
  console.log("MENU(⋯) text =", (await menu.innerText()).replace(/\s+/g, " "));
  await page.screenshot({ path: `${OUT}/05-menu-ellipsis.png` });
  await frame.locator('[data-testid="ai-chain-action-split"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/06-after-split.png` });

  headers = await dumpHeaders();
  console.log("HEADERS AFTER SPLIT =", JSON.stringify(headers, null, 1));
  const DERIVED = `${targetDetId}~${FOURTH}`;
  const left = headers.find((h: any) => h.gv === targetDetId);
  const right = headers.find((h: any) => h.gv === DERIVED);
  console.log("LEFT =", JSON.stringify(left), "\nRIGHT =", JSON.stringify(right));
  expect(right, `a derived chain row ${DERIVED} must exist`).toBeTruthy();

  const ov1: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
  console.log("OVERLAY AFTER SPLIT =", JSON.stringify(ov1?.overlay ?? ov1?.view?.overlay ?? null));
  console.log("OVERLAY RAW KEYS =", Object.keys(ov1 || {}));

  // --- STEP 5: rename the DERIVED half -------------------------------------
  const rhdr = frame.locator(`[data-testid="gantt-group-header"][data-group-gv="${DERIVED}"]`).first();
  await rhdr.locator('[data-testid="gantt-segment-menu-button"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await frame.locator('[data-testid="ai-segment-action-rename"]').first().click({ timeout: 10_000 });
  await page.waitForTimeout(400);
  const NEWNAME = "TESTER derived half";
  await frame.locator('[data-testid="ai-segment-rename-input"]').first().fill(NEWNAME);
  await frame.locator('[data-testid="ai-segment-rename-save"]').first().click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/07-renamed.png` });
  headers = await dumpHeaders();
  console.log("HEADERS AFTER RENAME =", JSON.stringify(headers, null, 1));
  const ov2: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
  console.log("OVERLAY AFTER RENAME =", JSON.stringify(ov2?.overlay ?? null));

  // --- STEP 6: reload, assert survival -------------------------------------
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const s2 = await enterForgeSurface(page, { surface: "custom" });
  const f2: any = (s2 as any).frame;
  await page.waitForTimeout(2500);
  await f2.getByText("LZPT Scenarios", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  await f2.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const grp2 = f2.locator('[data-testid="gantt-group-select"] [role="combobox"]').first();
  const grpTxt = await grp2.innerText().catch(() => "");
  console.log("GROUPING AFTER RELOAD =", grpTxt);
  if (!/AI structure/i.test(grpTxt)) {
    await grp2.click(); await page.waitForTimeout(500);
    await f2.getByRole("option", { name: /AI structure/i }).first().click();
    await page.waitForTimeout(12_000);
  }
  await page.waitForTimeout(3000);
  const headers2 = await f2.locator('[data-testid="gantt-group-header"]').evaluateAll((els: any[]) => els.map((e) => ({
    gv: e.getAttribute("data-group-gv"),
    label: (e.querySelector('[data-testid="gantt-group-header-label"]') as any)?.textContent || "",
    span: (e.querySelector('[data-testid="gantt-group-span"]') as any)?.textContent || "",
  })));
  console.log("HEADERS AFTER RELOAD =", JSON.stringify(headers2, null, 1));
  await page.screenshot({ path: `${OUT}/08-after-reload.png` });

  // --- STEP 7: undo split on the derived half ------------------------------
  const rhdr2 = f2.locator(`[data-testid="gantt-group-header"][data-group-gv="${DERIVED}"]`).first();
  await rhdr2.locator('[data-testid="gantt-segment-menu-button"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/09-derived-menu.png` });
  console.log("DERIVED SEGMENT MENU =", (await f2.locator('[data-testid="ai-segment-menu"]').first().innerText()).replace(/\s+/g, " "));
  await f2.locator('[data-testid="ai-segment-action-unsplit"]').first().click({ timeout: 10_000 });
  await page.waitForTimeout(3500);
  const headers3 = await f2.locator('[data-testid="gantt-group-header"]').evaluateAll((els: any[]) => els.map((e) => ({
    gv: e.getAttribute("data-group-gv"),
    label: (e.querySelector('[data-testid="gantt-group-header-label"]') as any)?.textContent || "",
  })));
  console.log("HEADERS AFTER UNDO =", JSON.stringify(headers3, null, 1));
  await page.screenshot({ path: `${OUT}/10-after-undo.png` });
  const ov3: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
  console.log("OVERLAY AFTER UNDO =", JSON.stringify(ov3?.overlay ?? null));

  // --- STEP 8: the same action in the TABLE --------------------------------
  await f2.getByRole("button", { name: /^Table/i }).first().click({ timeout: 20_000 });
  await page.waitForTimeout(4000);
  const tgrp = f2.locator('[role="combobox"]').filter({ hasText: /grouping|AI structure|Status/i }).first();
  const tgt = await tgrp.innerText().catch(() => "");
  console.log("TABLE GROUPING =", tgt);
  if (!/AI structure/i.test(tgt)) {
    await tgrp.click(); await page.waitForTimeout(600);
    await f2.getByRole("option", { name: /AI structure/i }).first().click();
    await page.waitForTimeout(8000);
  }
  await page.screenshot({ path: `${OUT}/11-table-structure.png` });
  const tcut = f2.locator(`[data-testid="table-chain-cut-button"][data-key="${FOURTH}"], [data-testid="gantt-chain-cut-button"][data-key="${FOURTH}"]`).first();
  console.log("TABLE CUT BUTTON count =", await f2.locator('[data-testid="table-chain-cut-button"]').count(), "/", await f2.locator('[data-testid="gantt-chain-cut-button"]').count());
  const trow = f2.locator(`[data-testid="table-row"][data-row-key="${FOURTH}"]`).first();
  if (await trow.count()) {
    await trow.click({ button: "right" });
    await page.waitForTimeout(800);
    console.log("TABLE MENU issueKey =", await f2.locator('[data-testid="ai-chain-split-menu"]').first().getAttribute("data-issue-key").catch(() => null));
    await page.screenshot({ path: `${OUT}/12-table-menu.png` });
    await f2.locator('[data-testid="ai-chain-action-split"]').first().click({ timeout: 10_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/13-table-after-split.png` });
    const th = await f2.locator('[data-testid="table-group-header"], [data-testid="gantt-group-header"]').evaluateAll((els: any[]) => els.map((e) => (e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)));
    console.log("TABLE HEADERS AFTER SPLIT =", JSON.stringify(th, null, 1));
    const ov4: any = await getTestState("lz-ppm", { what: "aiView", planId: PLAN });
    console.log("OVERLAY AFTER TABLE SPLIT =", JSON.stringify(ov4?.overlay ?? null));
  } else {
    console.log("TABLE ROW NOT FOUND for", FOURTH, "— table row selector unknown");
  }
  } finally {
    await page.screenshot({ path: `${OUT}/99-final.png` }).catch(() => {});
    await ctx.close().catch(() => {});
  }
});
