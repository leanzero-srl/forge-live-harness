// THROWAWAY UX-critique walk (2026-09-19): space admin → author → approver → reader → demoted
// editor → rejection → signature, on a disposable WFH page. Screenshots every step into
// evidence/sv-critique-wf and dumps the copy strings it saw into steps.json. Restores WFH's
// workflow settings to what they were (null → deleted) and deletes the page. Not a regression test.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface, ensureInViewport } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, getComments, readPage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const SPACE = "WFH";
const DEV = "17516615";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const EDITOR = "sv-critique-editor"; // synthetic non-privileged editor for the demote path
const OUT = `${process.cwd()}/evidence/sv-critique-wf`;
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const TR = getTarget("sentinel-vault-realm");
const TM = getTarget("sentinel-my-work");

test.describe.configure({ timeout: 900_000, retries: 0 });

const steps: any[] = [];
const note = (id: string, data: any) => { steps.push({ id, ...data }); console.log(`### ${id}`, JSON.stringify(data).slice(0, 600)); };
const strip = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

async function ribbonFrame(page: any, want = ".ribbon-bar, [data-testid=ribbon-bar]", tries = 30) {
  const ifr = page.locator(`iframe[src*="${DEV}"]`);
  for (let t = 0; t < tries; t++) {
    const n = await ifr.count();
    for (let i = 0; i < n; i++) {
      const cf = ifr.nth(i).contentFrame();
      if ((await cf.locator(want).count().catch(() => 0)) > 0) return { frame: cf, el: ifr.nth(i) };
    }
    await page.waitForTimeout(1500);
  }
  return null;
}
async function shotRibbon(page: any, el: any, name: string, extra = 0) {
  const box = await el.boundingBox().catch(() => null);
  if (!box) { await page.screenshot({ path: `${OUT}/${name}` }); return; }
  await page.screenshot({ path: `${OUT}/${name}`, clip: { x: Math.max(0, box.x - 4), y: Math.max(0, box.y - 4), width: Math.min(box.width + 8, 1440), height: box.height + 8 + extra } });
}
async function loadPage(page: any, pageId: string) {
  await page.goto(`https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=${pageId}`, { waitUntil: "domcontentloaded" });
  const r = await ribbonFrame(page);
  if (r) await page.waitForTimeout(2500); // let the workflow chip settle after first paint
  return r;
}
async function ribbonText(frame: any) { return strip(await frame.locator("body").innerHTML().catch(() => "")); }

test("critique walk: space admin → author → approver → reader → demoted editor", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const before = { settings: await getKvs(`workflow-settings-${SPACE}`), def: await getKvs(`workflow-def-space-${SPACE}`) };
  note("00-before", before);
  const spaceId = await spaceIdByKey(SPACE);
  const title = `HARNESS critique-wf ${Date.now()}`;
  const p = await createPage({ spaceId, title, adf: doc(heading("Policy", 2), paragraph("This is the policy text every employee must read.")) });
  const keysToClean: string[] = [];
  try {
    // ───────────── A. SPACE ADMIN, DAY ONE ─────────────
    await page.goto(TR.deepLink(TR.envId)!, { waitUntil: "domcontentloaded" });
    const surface = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 60000 });
    if (surface.kind !== "custom") throw new Error("custom expected");
    const app = surface.frame;
    await expect(app.locator(".space-admin-title")).toBeVisible({ timeout: 20000 });
    const tabs = app.locator(".tab-navigation .tab-button");
    const tabNames: string[] = [];
    for (let i = 0; i < await tabs.count(); i++) tabNames.push((await tabs.nth(i).innerText()).trim());
    note("A0-console-tabs", { tabNames });
    await page.screenshot({ path: `${OUT}/A0-console-landing.png`, fullPage: false });
    await app.locator(".tab-navigation .tab-button", { hasText: "Workflow" }).click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/A1-workflow-tab-off.png`, fullPage: true });
    const offText = strip(await app.locator(".tab-content, .settings-panel").first().innerHTML().catch(() => ""));
    note("A1-workflow-off-copy", { text: offText.slice(0, 1500) });
    // toggle on
    const enable = app.locator('input[aria-label="Enable document workflow"]');
    await enable.check();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/A2-workflow-on-full.png`, fullPage: true });
    const onText = strip(await app.locator(".settings-panel").first().innerHTML().catch(() => ""));
    note("A2-workflow-on-copy", { text: onText.slice(0, 6000) });
    // the definition editor
    const defToggle = app.locator('[data-testid="wf-defs-toggle"]');
    if (await defToggle.count()) {
      await defToggle.click();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/A3-definitions-open.png`, fullPage: true });
      const defText = strip(await app.locator('[data-testid="wf-defs"]').innerHTML().catch(() => ""));
      note("A3-definitions-copy", { text: defText.slice(0, 3000) });
      // WF-11: the states are their own view now — "Back to workflow settings" closes it, not a second toggle click.
      const back = app.locator('[data-testid="wf-defs-back"]');
      if (await back.count()) await back.click(); else await defToggle.click();
    }
    // Require approval → add Mihai through the picker (as a naive admin would). WF-11 (2): the
    // approval settings live on the states view now, behind "Edit the states, approvers and protection…".
    if (await defToggle.count()) { await defToggle.click(); await page.waitForTimeout(800); }
    const requireApproval = app.locator('input[aria-label="Require approval to reach Approved"]').first();
    await app.locator('[data-testid="wf-def-settings"]').waitFor({ state: "visible", timeout: 30000 }).catch(() => note("A4: the states view's settings block did not render in 30 s", {}));
    await ensureInViewport(page, requireApproval).catch(() => {});
    await requireApproval.check({ force: true }).catch((e: any) => note("A4: could not switch Require approval on from the UI", { error: String(e?.message || e).slice(0, 160) }));
    await page.waitForTimeout(500);
    const picker = app.locator('input[aria-label="Search people to add as approvers"]').first();
    await picker.fill("Mihai");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/A4-approver-picker.png`, fullPage: true });
    const opt = app.locator(".wf-userpicker-opt", { hasText: "Mihai" }).first();
    let pickedViaUi = false;
    if (await opt.count()) { await opt.click(); pickedViaUi = true; }
    note("A4-picker", { pickedViaUi });
    await page.screenshot({ path: `${OUT}/A5-approval-configured.png`, fullPage: true });
    // Save
    await app.locator('[data-testid="wf-def-default"] [data-testid="wf-def-save"]').click(); // WF-11: one Save for states + settings
    await page.waitForTimeout(3000);
    const saveMsg = strip(await app.locator('[role="status"]').last().innerHTML().catch(() => ""));
    note("A6-save", { saveMsg });
    await page.screenshot({ path: `${OUT}/A6-saved.png`, fullPage: true });
    let saved = await getKvs(`workflow-settings-${SPACE}`);
    note("A6-saved-kvs", saved);
    if (!saved?.approval?.approvers?.some((a: any) => a.id === MIHAI)) {
      // fall back so the walk can continue
      await inv("setSpaceWorkflowSettings", { spaceKey: SPACE, enabled: "1", autoAssignNew: "0", workflowId: "default", enforceMode: "demote", approval: JSON.stringify({ approvers: [{ type: "user", id: MIHAI, name: "Mihai Perdum" }], mode: "any", min: 1 }) });
      saved = await getKvs(`workflow-settings-${SPACE}`);
      note("A6-fallback-settings", saved);
    }

    // ───────────── B. AUTHOR ─────────────
    // "Apply to existing pages" is what a naive admin clicks; use the engine directly for one page.
    const asg = await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: MIHAI, actorName: "Mihai Perdum" });
    note("B0-assign", { ok: !!asg.result?.success });
    keysToClean.push(`workflow-state-${p.id}`, `workflow-pending-${p.id}`, `workflow-autoassigned-${p.id}`, `workflow-label-${p.id}`, `workflow-review-notified-${p.id}`, `workflow-integrity-notified-${p.id}`, `workflow-completing-${p.id}`);
    let r = await loadPage(page, p.id);
    expect(r, "ribbon renders on the workflow page").toBeTruthy();
    await shotRibbon(page, r!.el, "B1-author-draft.png");
    note("B1-author-draft-ribbon", { text: await ribbonText(r!.frame) });
    // open the state menu
    await r!.frame.locator("button.wf-chip").first().click();
    await page.waitForTimeout(600);
    await shotRibbon(page, r!.el, "B2-author-menu.png", 160);
    const menuItems: string[] = [];
    const items = r!.frame.locator(".wf-menu-item");
    for (let i = 0; i < await items.count(); i++) menuItems.push((await items.nth(i).innerText()).trim());
    note("B2-menu-items", { menuItems, menuBoxes: await items.first().boundingBox().catch(() => null), frameBox: await r!.el.boundingBox() });
    await items.first().click(); // → In Review
    await page.waitForTimeout(3000);
    await shotRibbon(page, r!.el, "B3-author-inreview.png");
    note("B3-author-inreview-ribbon", { text: await ribbonText(r!.frame) });
    await r!.frame.locator("button.wf-chip").first().click();
    await page.waitForTimeout(600);
    await shotRibbon(page, r!.el, "B4-author-menu-inreview.png", 160);
    const items2 = r!.frame.locator(".wf-menu-item");
    const menu2: string[] = [];
    for (let i = 0; i < await items2.count(); i++) menu2.push((await items2.nth(i).innerText()).trim());
    note("B4-menu-items", { menu2 });
    // author (Mihai, also the approver) requests approval — the self-approval trap
    const reqItem = items2.filter({ hasText: /Request approval/ }).first();
    if (await reqItem.count()) {
      await reqItem.click();
      await page.waitForTimeout(3500);
      await shotRibbon(page, r!.el, "B5-self-requested.png");
      note("B5-self-requested-ribbon", { text: await ribbonText(r!.frame) });
      const awaiting = r!.frame.locator("button.wf-chip-awaiting");
      if (await awaiting.count()) {
        await awaiting.click();
        await page.waitForTimeout(800);
        await shotRibbon(page, r!.el, "B6-self-panel.png", 260);
        note("B6-self-panel", { text: await ribbonText(r!.frame) });
        const approveBtn = r!.frame.locator(".wf-appr-approve");
        if (await approveBtn.count()) {
          await approveBtn.click();
          await page.waitForTimeout(2500);
          await shotRibbon(page, r!.el, "B7-self-approve-refused.png", 260);
          note("B7-self-approve-result", { text: await ribbonText(r!.frame), err: await r!.frame.locator(".wf-error").innerText().catch(() => null) });
        }
      }
      // void the self-request: the approvals inbox row for Mihai + pending
      await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "draft", actor: MIHAI });
      await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: MIHAI });
    } else {
      await page.keyboard.press("Escape");
    }
    // the page-details modal — is the workflow anywhere in it?
    const { openDetailsModal } = await import("./_door");
    try {
      const pd = await openDetailsModal(page);
      await page.screenshot({ path: `${OUT}/B8-page-details.png` });
      note("B8-page-details", { text: strip(await pd.locator("body").innerHTML().catch(() => "")).slice(0, 2000) });
      await pd.locator('[data-testid="pd-close"]').click().catch(() => {});
    } catch (e) { note("B8-page-details", { error: String(e).slice(0, 200) }); }

    // ───────────── C. APPROVER (Gabriela requests, Mihai decides) ─────────────
    const rq = await inv("reqTransition", { pageId: p.id, spaceKey: SPACE, to: "approved", actor: GABI });
    note("C0-gabi-request", rq.result);
    keysToClean.push(`workflow-inbox-${MIHAI}-${p.id}`, `workflow-approval-${p.id}-approved-approval-${MIHAI}`);
    let comments = await getComments(p.id);
    note("C0-comments-after-request", { n: comments.length, bodies: comments.map((c: any) => strip(c.body?.storage?.value || "")) });
    // My work
    await page.goto(TM.deepLink(TM.envId)!, { waitUntil: "domcontentloaded" });
    const mw = await enterForgeSurface(page, { surface: "custom", readySelector: '[data-testid="mw-page"]', timeout: 60000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/C1-mywork-pending.png`, fullPage: true });
    if (mw.kind === "custom") note("C1-mywork", { text: strip(await mw.frame.locator('[data-testid="wf-inbox"], [data-testid="wf-inbox-empty"]').first().innerHTML().catch(() => "")) });
    // page as approver
    r = await loadPage(page, p.id);
    await shotRibbon(page, r!.el, "C2-approver-ribbon.png");
    note("C2-approver-ribbon", { text: await ribbonText(r!.frame) });
    await r!.frame.locator("button.wf-chip-awaiting").click();
    await page.waitForTimeout(800);
    await shotRibbon(page, r!.el, "C3-approver-panel.png", 320);
    note("C3-approver-panel", { text: await ribbonText(r!.frame) });
    // edit the page BEFORE deciding (stale trap): does the UI tell the approver?
    const cur = await readPage(p.id);
    const { writeAdf } = await import("../../data/confluence.mjs");
    await writeAdf(p.id, doc(heading("Policy", 2), paragraph("This is the policy text every employee must read."), paragraph("Edited after the approval was requested.")), { message: "critique edit" });
    await page.waitForTimeout(1500);
    r = await loadPage(page, p.id);
    await r!.frame.locator("button.wf-chip-awaiting").click();
    await page.waitForTimeout(800);
    await shotRibbon(page, r!.el, "C4-approver-panel-after-edit.png", 320);
    note("C4-approver-panel-after-edit", { text: await ribbonText(r!.frame), versionBefore: cur.version, pinned: (await getKvs(`workflow-pending-${p.id}`))?.pinnedVersion });
    await r!.frame.locator(".wf-appr-reason-input").fill("Looks good to me");
    await r!.frame.locator(".wf-appr-approve").click();
    await page.waitForTimeout(3500);
    await shotRibbon(page, r!.el, "C5-after-approve-click.png", 320);
    note("C5-after-approve", { text: await ribbonText(r!.frame), state: (await getKvs(`workflow-state-${p.id}`))?.stateId });
    comments = await getComments(p.id);
    note("C5-comments", { n: comments.length, bodies: comments.map((c: any) => strip(c.body?.storage?.value || "")) });
    // if stale, re-request and approve for real
    let st = await getKvs(`workflow-state-${p.id}`);
    if (st?.stateId !== "approved") {
      await inv("reqTransition", { pageId: p.id, spaceKey: SPACE, to: "approved", actor: GABI });
      r = await loadPage(page, p.id);
      await r!.frame.locator("button.wf-chip-awaiting").click();
      await page.waitForTimeout(800);
      await r!.frame.locator(".wf-appr-reason-input").fill("Looks good to me");
      await r!.frame.locator(".wf-appr-approve").click();
      await page.waitForTimeout(3500);
      st = await getKvs(`workflow-state-${p.id}`);
    }
    note("C6-state", { stateId: st?.stateId, approvedVersion: st?.approvedVersion });
    r = await loadPage(page, p.id);
    await shotRibbon(page, r!.el, "C6-approved-ribbon.png");
    note("C6-approved-ribbon", { text: await ribbonText(r!.frame) });
    const det = r!.frame.locator('[data-testid="wf-details-chip"]');
    if (await det.count()) {
      await det.click();
      await page.waitForTimeout(800);
      await shotRibbon(page, r!.el, "C7-approved-details.png", 380);
      note("C7-approved-details", { text: await ribbonText(r!.frame) });
    }
    comments = await getComments(p.id);
    note("C7-comments", { n: comments.length, bodies: comments.map((c: any) => strip(c.body?.storage?.value || "")) });

    // ───────────── D. READER: read confirmation ─────────────
    await inv("setSpaceWorkflowSettings", { spaceKey: SPACE, enabled: "1", autoAssignNew: "0", workflowId: "default", enforceMode: "demote", approval: JSON.stringify({ approvers: [{ type: "user", id: MIHAI, name: "Mihai Perdum" }], mode: "any", min: 1 }), settings: JSON.stringify({ readConfirmation: { enabled: true, audience: [{ type: "user", id: MIHAI, name: "Mihai Perdum" }, { type: "user", id: GABI, name: "Gabriela Perdum" }] } }) });
    keysToClean.push(`read-ack-${p.id}-${MIHAI}`);
    r = await loadPage(page, p.id);
    await shotRibbon(page, r!.el, "D1-reader-confirm.png");
    note("D1-reader-ribbon", { text: await ribbonText(r!.frame) });
    const confirmBtn = r!.frame.locator('[data-testid="wf-read-confirm"]');
    if (await confirmBtn.count()) {
      await confirmBtn.click();
      await page.waitForTimeout(2500);
      await shotRibbon(page, r!.el, "D2-reader-confirmed.png");
      note("D2-reader-confirmed", { text: await ribbonText(r!.frame) });
      const det2 = r!.frame.locator('[data-testid="wf-details-chip"]');
      await det2.click();
      await page.waitForTimeout(1200);
      await shotRibbon(page, r!.el, "D3-readers-report.png", 420);
      note("D3-readers-report", { text: await ribbonText(r!.frame) });
    }

    // ───────────── E. DEMOTED EDITOR ─────────────
    const live = await readPage(p.id);
    const enf = await inv("enforceDecision", { pageId: p.id, actor: EDITOR, eventVersion: String(live.version + 1) });
    note("E0-enforce", enf.result);
    await page.waitForTimeout(1500);
    r = await loadPage(page, p.id);
    await shotRibbon(page, r!.el, "E1-after-demote.png");
    note("E1-after-demote-ribbon", { text: await ribbonText(r!.frame), state: (await getKvs(`workflow-state-${p.id}`))?.stateId });
    comments = await getComments(p.id);
    note("E1-comments", { n: comments.length, bodies: comments.map((c: any) => strip(c.body?.storage?.value || "")) });
    const disp = await inv("recentDispatches", { pageId: p.id, actor: EDITOR });
    note("E1-dispatches-for-editor", disp.result);

    // ───────────── F. REJECTION ─────────────
    let st2 = await getKvs(`workflow-state-${p.id}`);
    if (st2?.stateId !== "in_review") await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: GABI });
    await inv("reqTransition", { pageId: p.id, spaceKey: SPACE, to: "approved", actor: GABI });
    r = await loadPage(page, p.id);
    await r!.frame.locator("button.wf-chip-awaiting").click();
    await page.waitForTimeout(800);
    await r!.frame.locator(".wf-appr-reason-input").fill("Needs a summary section at the top");
    await r!.frame.locator(".wf-appr-deny").click();
    await page.waitForTimeout(3500);
    await shotRibbon(page, r!.el, "F1-after-deny.png", 200);
    note("F1-after-deny", { text: await ribbonText(r!.frame), state: (await getKvs(`workflow-state-${p.id}`))?.stateId });
    r = await loadPage(page, p.id);
    await shotRibbon(page, r!.el, "F2-requester-view-after-deny.png");
    note("F2-requester-view", { text: await ribbonText(r!.frame) });
    comments = await getComments(p.id);
    note("F2-comments", { n: comments.length, bodies: comments.map((c: any) => strip(c.body?.storage?.value || "")) });
    const det3 = r!.frame.locator('[data-testid="wf-details-chip"]');
    if (await det3.count()) { await det3.click(); await page.waitForTimeout(800); await shotRibbon(page, r!.el, "F3-details-after-deny.png", 300); note("F3-details-after-deny", { text: await ribbonText(r!.frame) }); }

    // ───────────── G. SIGNATURE ─────────────
    await inv("setSpaceWorkflowSettings", { spaceKey: SPACE, enabled: "1", autoAssignNew: "0", workflowId: "default", enforceMode: "demote", approval: JSON.stringify({ approvers: [{ type: "user", id: MIHAI, name: "Mihai Perdum" }], mode: "any", min: 1 }), settings: JSON.stringify({ requireSignature: true }) });
    await inv("reqTransition", { pageId: p.id, spaceKey: SPACE, to: "approved", actor: GABI });
    r = await loadPage(page, p.id);
    await r!.frame.locator("button.wf-chip-awaiting").click();
    await page.waitForTimeout(800);
    await shotRibbon(page, r!.el, "G1-signature-required.png", 320);
    note("G1-signature-panel", { text: await ribbonText(r!.frame) });
    await page.goto(TM.deepLink(TM.envId)!, { waitUntil: "domcontentloaded" });
    await enterForgeSurface(page, { surface: "custom", readySelector: '[data-testid="mw-signature"]', timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/G2-mywork-signature.png`, fullPage: true });

    // ───────────── H. DASHBOARD / REPORTING ─────────────
    await page.goto(TR.deepLink(TR.envId)!, { waitUntil: "domcontentloaded" });
    const s2 = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 60000 });
    if (s2.kind === "custom") {
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}/H0-console-landing-with-inbox.png` });
      await s2.frame.locator(".tab-navigation .tab-button", { hasText: "Workflow" }).click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/H1-dashboard.png`, fullPage: true });
      note("H1-dashboard", { text: strip(await s2.frame.locator(".wf-dash").innerHTML().catch(() => "")).slice(0, 1500) });
      await s2.frame.locator(".tab-navigation .tab-button", { hasText: "Activity" }).click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/H2-activity.png`, fullPage: true });
      note("H2-activity", { text: strip(await s2.frame.locator(".tab-content").innerHTML().catch(() => "")).slice(0, 2500) });
    }
    const log = await inv("getWorkflowLog", { pageId: p.id });
    note("H3-workflow-log", log.result);
  } finally {
    writeFileSync(`${OUT}/steps.json`, JSON.stringify(steps, null, 2));
    // restore WFH: settings/def were null before → delete; else put back
    if (before.settings == null) await delKvs(`workflow-settings-${SPACE}`).catch(() => {}); else await getTestState("sentinel-vault", { what: "set", key: `workflow-settings-${SPACE}`, value: JSON.stringify(before.settings) });
    if (before.def == null) await delKvs(`workflow-def-space-${SPACE}`).catch(() => {}); else await getTestState("sentinel-vault", { what: "set", key: `workflow-def-space-${SPACE}`, value: JSON.stringify(before.def) });
    for (const k of keysToClean) await delKvs(k).catch(() => {});
    for (const st of ["draft", "in_review", "approved", "expired"]) await delKvs(`workflow-idx-${SPACE}-${st}-${p.id}`).catch(() => {});
    for (const prefix of [`workflow-log-${p.id}-`, `workflow-approval-${p.id}-`, `read-ack-${p.id}-`]) { for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {}); }
    await deletePage(p.id).catch(() => {});
    note("Z-restored", { settings: await getKvs(`workflow-settings-${SPACE}`), def: await getKvs(`workflow-def-space-${SPACE}`) });
    writeFileSync(`${OUT}/steps.json`, JSON.stringify(steps, null, 2));
  }
});
