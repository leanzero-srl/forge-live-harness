// THROWAWAY UX-critique walk (2026-09-19): sealed sections × workflow, as a naive user would meet them.
// Editor (Mihai, browser) → collaborator (Gabriela seals via the hook, Mihai tampers/requests) →
// the same page under the workflow (In Review, approval on Mihai) → approver. Screenshots every step,
// logs every copy string. Restores: seals, workflow keys, WFH settings (were null), admin settings, page.
import { test } from "../../fixtures/forge";
import type { Frame, Page } from "@playwright/test";
import { BASE_URL } from "../../config/env";
import { getTestState } from "../../testhook/client";
import { findDevPanel, findDevChip } from "./_door";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, writeAdf, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const SPACE = "WFH";
const DEV = "17516615";
const ENV = "17516615-12ef-4790-8ce2-29151b7ee9ac";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const OUT = process.env.OUT_DIR || "evidence/critique-sections";
const THEIRS = process.env.GABI_HEADING || "Decisions";
const SKIP_WF = process.env.SKIP_WF === "1";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const call = async (key: string, actor: string, payload: any = {}) => (await getTestState("sentinel-vault", { what: "invoke", fn: "invoke", key, actor, payload: JSON.stringify(payload) })).result;
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

test.describe.configure({ timeout: 1_500_000 });

const log: string[] = [];
const note = (s: string) => { console.log(`### ${s}`); log.push(s); };

async function step(name: string, fn: () => Promise<void>) {
  try { await fn(); note(`OK ${name}`); }
  catch (e: any) { note(`FAILED ${name}: ${(e?.message || e).toString().slice(0, 300)}`); }
}

async function devFrames(page: Page, sel: string): Promise<Frame[]> {
  const out: Frame[] = [];
  for (const fr of page.frames()) {
    if (!fr.url().includes(DEV)) continue;
    if ((await fr.locator(sel).count().catch(() => 0)) > 0) out.push(fr);
  }
  return out;
}
async function waitFrame(page: Page, sel: string, timeoutMs = 90_000): Promise<Frame | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const f = await devFrames(page, sel);
    if (f.length) return f[0];
    await page.waitForTimeout(700);
  }
  return null;
}
async function ribbonText(page: Page): Promise<string> {
  const fr = await waitFrame(page, '[data-testid="ribbon-bar"]', 40_000);
  if (!fr) return "(no ribbon frame)";
  return norm(await fr.locator('[data-testid="ribbon-bar"]').innerText().catch(() => "(ribbon unreadable)"));
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png` }).catch(() => {});
}
async function sectionFrames(page: Page): Promise<Frame[]> {
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    const f = await devFrames(page, ".sec-frame:not(.sec-loading), .sec-config");
    if (f.length) return f;
    await page.waitForTimeout(700);
  }
  return [];
}
async function panelFrame(page: Page): Promise<any> {
  let panel: any = null;
  const t0 = Date.now();
  while (Date.now() - t0 < 180_000) {
    panel = await findDevPanel(page);
    if (panel && (await panel.locator(".sv-section-seals").count().catch(() => 0)) > 0) return panel;
    await page.waitForTimeout(1000);
  }
  note(`panel not found; dev iframes: ${(await page.locator('iframe').evaluateAll((els) => els.map((e) => (e as HTMLIFrameElement).src.slice(0, 80)))).join(" | ")}`);
  return panel;
}
async function gotoView(page: Page, id: string) {
  await page.goto(`${BASE_URL}/wiki/spaces/${SPACE}/pages/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
}
async function gotoEdit(page: Page, id: string) {
  await page.goto(`${BASE_URL}/wiki/spaces/${SPACE}/pages/edit-v2/${id}`, { waitUntil: "domcontentloaded" });
  await page.locator(".ProseMirror").first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(6000);
}
async function leaveEditor(page: Page, id: string) {
  // The editor keeps a draft; close it without publishing.
  const close = page.getByRole("button", { name: /^Close$/ }).first();
  if (await close.isVisible().catch(() => false)) { await close.click().catch(() => {}); await page.waitForTimeout(2500); }
  const discard = page.getByRole("button", { name: /Discard|Close draft|Revert/i }).first();
  if (await discard.isVisible().catch(() => false)) await discard.click().catch(() => {});
  await page.waitForTimeout(1500);
  await gotoView(page, id);
}

test("critique walk: editor → collaborator → workflow → approver", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  page.on("dialog", (d) => d.accept().catch(() => {}));
  const originalGlobal = (await getKvs("admin-settings-global")) || null;
  await setKvs("admin-settings-global", { ...(originalGlobal || {}), enableContentProtection: true, enableDocRibbons: true, enableFlashMessages: true });
  const spaceId = await spaceIdByKey(SPACE);
  const created = await createPage({ spaceId, title: `CRITIQUE sections ${Date.now()}`, adf: doc(
    paragraph("This page describes the release plan. Read it before Friday."),
    heading("Scope", 2), paragraph("Scope body: the three services in the first wave."),
    heading("Risks", 2), paragraph("Risks body: the vendor API is rate limited."), paragraph("Second risk paragraph."),
    heading("Decisions", 2), paragraph("Decisions body: we go with option B."),
  ) });
  const P = String(created.id);
  note(`page ${P}`);
  let SEC_MINE: string | null = null; // Risks, sealed by Mihai
  let SEC_GABI: string | null = null; // Decisions, sealed by Gabriela
  const wfKeys: string[] = [];

  try {
    const SKIP = process.env.SKIP_EDITOR === "1";
    if (SKIP) await step("00 seal both sections via the hook (rerun of 21+)", async () => {
      await inv("ensurePanel", { pageId: P });
      const lh = await inv("listPageHeadings", { pageId: P, actor: MIHAI });
      const r = (lh.result?.headings || []).find((h: any) => h.text === "Risks");
      SEC_MINE = (await inv("sealSection", { pageId: P, hi: String(r.index), htext: "Risks", actor: MIHAI })).result?.sectionId;
      const lh2 = await inv("listPageHeadings", { pageId: P, actor: GABI });
      const d = (lh2.result?.headings || []).find((h: any) => h.text === THEIRS);
      SEC_GABI = (await inv("sealSection", { pageId: P, hi: String(d.index), htext: THEIRS, actor: GABI })).result?.sectionId;
      note(`SEC_MINE=${SEC_MINE} SEC_GABI=${SEC_GABI}`);
    });
    // ───────────────────────────── 1. EDITOR (Mihai) ─────────────────────────────
    if (!SKIP) await step("01 fresh page view", async () => {
      await gotoView(page, P);
      await shot(page, "01-fresh-page");
      const rb = await devFrames(page, '[data-testid="ribbon-bar"]');
      note(`fresh page: ribbon frames=${rb.length} (expected 0 in exceptions mode)`);
      const chip = await findDevChip(page, 30_000).catch(() => null);
      note(`fresh page byline chip: ${chip ? norm(await chip.innerText()) : "(none)"}`);
    });

    if (!SKIP) await step("02 editor: where would I seal a section?", async () => {
      await gotoEdit(page, P);
      await shot(page, "02-editor-fresh");
      // Hover the heading: any app affordance?
      const h = page.locator(".ProseMirror h2", { hasText: "Risks" }).first();
      await h.hover().catch(() => {});
      await page.waitForTimeout(800);
      await shot(page, "03-editor-heading-hover");
      // Select the heading text: floating toolbar?
      await h.click({ clickCount: 3 }).catch(() => {});
      await page.waitForTimeout(1200);
      await shot(page, "04-editor-heading-selected-toolbar");
      // Slash command
      const last = page.locator(".ProseMirror p", { hasText: "option B" }).first();
      await last.click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.type("/seal");
      await page.waitForTimeout(2500);
      await shot(page, "05-editor-slash-seal");
      const menuText = norm(await page.locator('[role="listbox"], [data-testid="element-browser"], .fabric-editor-typeahead').first().innerText().catch(() => "(no typeahead)"));
      note(`slash "/seal" menu: ${menuText.slice(0, 300)}`);
      // pick the Sentinel Vault sealed section item if present
      const item = page.getByRole("option", { name: /Sealed Section/i }).first();
      if (await item.isVisible().catch(() => false)) {
        await item.click();
        await page.waitForTimeout(6000);
        await shot(page, "06-editor-macro-inserted-or-dialog");
        const cfg = await waitFrame(page, ".sec-config", 20_000);
        if (cfg) {
          note(`macro CONFIG dialog copy: ${norm(await cfg.locator(".sec-config").innerText())}`);
          await cfg.locator('[data-testid="sec-cancel"]').click().catch(() => {});
        } else {
          note("no config dialog frame appeared after inserting the macro");
        }
        await page.waitForTimeout(1500);
        await shot(page, "07-editor-after-macro-insert");
        const pm = norm(await page.locator(".ProseMirror").first().innerText());
        note(`editor text after insert: ${pm.slice(0, 600)}`);
      } else {
        await page.keyboard.press("Escape");
        note("no 'Sealed Section' option in the slash menu");
      }
      await leaveEditor(page, P);
    });

    if (!SKIP) await step("08 page-details modal (byline chip): no way to seal a section", async () => {
      await gotoView(page, P);
      const chip = await findDevChip(page, 60_000);
      await chip.click();
      const fr = await waitFrame(page, '[data-testid="pd-modal"]', 60_000);
      await page.waitForTimeout(3000);
      await shot(page, "08-details-overview");
      if (fr) {
        note(`details modal text: ${norm(await fr.locator('[data-testid="pd-modal"]').innerText()).slice(0, 900)}`);
        await fr.locator('[data-testid="pd-tab-attachments"]').click().catch(() => {});
        await page.waitForTimeout(1500);
        await shot(page, "09-details-attachments");
      }
      await page.keyboard.press("Escape");
    });

    if (!SKIP) await step("10 panel: Sealed Sections group → picker → seal Risks", async () => {
      const ep = await inv("ensurePanel", { pageId: P });
      note(`ensurePanel: ${JSON.stringify(ep.result).slice(0, 200)}`);
      await gotoView(page, P);
      const panel = await panelFrame(page);
      if (!panel) throw new Error("panel not found");
      const grp = panel.locator(".sv-section-seals");
      await grp.scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      await shot(page, "10-panel-sections-group-empty");
      note(`sections group header: ${norm(await grp.locator(".sv-card-section-header").innerText())}`);
      // the whole panel top for context
      await panel.locator(".sv-panel-container").first().scrollIntoViewIfNeeded().catch(() => {});
      await shot(page, "11-panel-top");
      await grp.getByRole("button", { name: /Seal a section/ }).click();
      await page.waitForTimeout(2500);
      await grp.scrollIntoViewIfNeeded();
      await shot(page, "12-panel-picker");
      note(`picker rows: ${norm(await grp.locator(".sv-section-picker").innerText())}`);
      await grp.locator(".sv-section-pick-row", { hasText: "Risks" }).click();
      await page.waitForTimeout(8000);
      await grp.scrollIntoViewIfNeeded();
      await shot(page, "13-panel-sealed-row-mine");
      note(`my section row: ${norm(await grp.locator('[data-testid="sv-section-row"]').first().innerText())} | aria=${await grp.locator('[data-testid="sv-section-row"]').first().getAttribute("aria-label")}`);
      const kebab = grp.locator('[data-testid="sv-section-kebab"]').first();
      await kebab.click().catch(() => {});
      await page.waitForTimeout(800);
      await shot(page, "14-panel-row-kebab");
      note(`my section ⋯ menu: ${norm(await panel.locator('[role="menu"]').first().innerText().catch(() => "(no menu)"))}`);
      await page.keyboard.press("Escape");
      const recs = await queryKvs("section-protection-");
      for (const k of recs) { const v = await getKvs(k); if (v?.pageId === P && v.lockedBy === MIHAI) SEC_MINE = v.sectionId; }
      note(`SEC_MINE=${SEC_MINE}`);
    });

    if (!SKIP) await step("15 view: the macro after sealing", async () => {
      await gotoView(page, P);
      const frs = await sectionFrames(page);
      const fr = frs[0];
      if (!fr) throw new Error("no section frame");
      await page.waitForTimeout(6000);
      await fr.locator(".sec-frame").first().scrollIntoViewIfNeeded().catch(() => {});
      await page.evaluate(() => window.scrollBy(0, -160));
      await shot(page, "15-macro-view-sealed-by-me");
      note(`macro badge: "${norm(await fr.locator('[data-testid="sec-view-badge"]').innerText())}" state=${await fr.locator('[data-testid="sec-view-badge"]').getAttribute("data-state")}`);
      note(`macro frame text: ${norm(await fr.locator(".sec-frame").innerText()).slice(0, 300)}`);
      note(`ribbon after my own seal: ${await ribbonText(page)}`);
      const chip = await findDevChip(page, 30_000).catch(() => null);
      note(`byline chip after seal: ${chip ? norm(await chip.innerText()) : "(none)"} title=${chip ? await chip.getAttribute("title") : ""}`);
    });

    if (!SKIP) await step("16 editor: the placeholder around my sealed section", async () => {
      await gotoEdit(page, P);
      const ext = page.locator('.ProseMirror [data-node-type="bodiedExtension"], .ProseMirror .bodiedExtensionView-content-wrap, .ProseMirror [data-extension-type]').first();
      if (await ext.count()) {
        await ext.scrollIntoViewIfNeeded().catch(() => {});
        await page.evaluate(() => window.scrollBy(0, -200));
      }
      await page.waitForTimeout(1500);
      await shot(page, "16-editor-placeholder");
      note(`editor: bodied extension nodes=${await ext.count()}; text=${norm(await page.locator(".ProseMirror").first().innerText()).slice(0, 700)}`);
      // select the macro → toolbar (Edit / Remove)
      const titleBar = page.locator('.ProseMirror [data-node-type="bodiedExtension"] .extension-title, .ProseMirror .extension-title, .ProseMirror [data-testid="extension-title"]').first();
      if (await titleBar.count()) { await titleBar.click().catch(() => {}); await page.waitForTimeout(1200); }
      else { await ext.click({ position: { x: 10, y: 10 } }).catch(() => {}); await page.waitForTimeout(1200); }
      await shot(page, "17-editor-macro-selected");
      const tb = page.locator('[data-testid="extension-toolbar"], [aria-label*="Extension"], .extension-toolbar, [data-testid="popup-wrapper"]').first();
      note(`macro toolbar text: ${norm(await tb.innerText().catch(() => "(no toolbar)")).slice(0, 200)}`);
      const editBtn = page.getByRole("button", { name: /^Edit$/ }).first();
      if (await editBtn.isVisible().catch(() => false)) {
        await editBtn.click();
        await page.waitForTimeout(6000);
        await shot(page, "18-editor-config-dialog");
        const cfg = await waitFrame(page, ".sec-config", 20_000);
        if (cfg) {
          note(`config dialog (existing node) copy: ${norm(await cfg.locator(".sec-config").innerText())}`);
          await cfg.locator('[data-testid="sec-cancel"]').click().catch(() => {});
        }
      } else note("no Edit button on the selected macro");
      await leaveEditor(page, P);
    });

    // ───────────────────────────── 2. COLLABORATOR (Mihai vs Gabriela's section) ─────────────────────────────
    if (!SKIP) await step("19 Gabriela seals Decisions; Mihai types into it; the guard undoes it", async () => {
      const lh = await inv("listPageHeadings", { pageId: P, actor: GABI });
      const dec = (lh.result?.headings || []).find((h: any) => h.text === "Decisions");
      const sr = await inv("sealSection", { pageId: P, hi: String(dec.index), htext: THEIRS, actor: GABI });
      if (!sr.result?.success) throw new Error(`Gabriela seal failed: ${sr.result?.reason}`);
      SEC_GABI = sr.result.sectionId;
      await call("guard-page-now", GABI, { pageId: P });
      const before = await readPage(P);
      const adf = JSON.parse(JSON.stringify(before.adf));
      const wraps = adf.content.filter((n: any) => n.type === "bodiedExtension");
      const gw = wraps.find((n: any) => JSON.stringify(n).includes(SEC_GABI!));
      gw.content.push(paragraph("MIHAI ADDED A DECISION HERE"));
      await writeAdf(P, adf);
      const tamperV = (await readPage(P)).version;
      note(`tampered Gabriela's section at v${tamperV}`);
      await gotoView(page, P);
      const frs = await sectionFrames(page);
      const found: Frame[] = [];
      const t0 = Date.now();
      while (Date.now() - t0 < 60_000 && found.length === 0) {
        for (const fr of await devFrames(page, ".sec-frame")) if ((await fr.locator('[data-testid="sec-undone"]').count()) > 0) found.push(fr);
        if (found.length === 0) await page.waitForTimeout(1500);
      }
      const noticeFrame: Frame | null = found[0] || null;
      const now = await readPage(P);
      note(`after view: restored=${!JSON.stringify(now.adf).includes("MIHAI ADDED")} v${tamperV}→v${now.version}; frames=${frs.length}; notice=${!!noticeFrame}`);
      if (noticeFrame) {
        await noticeFrame.locator(".sec-frame").scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -160));
        await page.waitForTimeout(800);
        await shot(page, "19-macro-undone-notice");
        note(`undone notice: ${norm(await noticeFrame.locator('[data-testid="sec-undone"]').innerText())}`);
        note(`Gabriela's macro badge: ${norm(await noticeFrame.locator('[data-testid="sec-view-badge"]').innerText())}`);
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1500);
      await shot(page, "20-ribbon-restored");
      note(`ribbon (restored): ${await ribbonText(page)}`);
    });

    await step("21 panel: Request edit on Gabriela's section", async () => {
      await gotoView(page, P);
      const panel = await panelFrame(page);
      const grp = panel.locator(".sv-section-seals");
      await grp.scrollIntoViewIfNeeded();
      await page.waitForTimeout(2500);
      await shot(page, "21-panel-two-rows");
      const rows = grp.locator('[data-testid="sv-section-row"]');
      for (let i = 0; i < await rows.count(); i++) note(`row ${i}: ${norm(await rows.nth(i).innerText())} | primary=${await rows.nth(i).getAttribute("data-primary")}`);
      const theirs = rows.filter({ hasText: THEIRS }).first();
      await theirs.locator('[data-testid="sv-section-kebab"]').click().catch(() => {});
      await page.waitForTimeout(700);
      await shot(page, "22-panel-their-row-kebab");
      note(`their section ⋯ menu: ${norm(await panel.locator('[role="menu"]').first().innerText().catch(() => "(no menu)"))}`);
      await page.keyboard.press("Escape");
      await theirs.locator('[data-primary="request"]').click();
      await page.waitForTimeout(800);
      await shot(page, "23-panel-reason-bar");
      note(`reason bar: placeholder="${await theirs.locator(".card-reason-input").getAttribute("placeholder")}" buttons=${norm(await theirs.locator(".card-reason-bar").innerText())}`);
      await theirs.locator(".card-reason-input").fill("I need to add the decision we took today");
      await theirs.locator('[data-testid="sv-section-reason-bar-confirm"]').click();
      await page.waitForTimeout(4000);
      await shot(page, "24-panel-waiting");
      note(`their row after request: ${norm(await theirs.innerText())} | primary=${await theirs.getAttribute("data-primary")}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await gotoView(page, P);
      await page.waitForTimeout(3000);
      await shot(page, "25-ribbon-waiting-for-owner");
      note(`ribbon (my request pending): ${await ribbonText(page)}`);
      const chip = await findDevChip(page, 30_000);
      await chip.click();
      const fr = await waitFrame(page, '[data-testid="pd-modal"]', 60_000);
      await page.waitForTimeout(3000);
      await shot(page, "26-details-waiting");
      if (fr) note(`details rows (pending): ${norm(await fr.locator('[data-testid="pd-seals"]').innerText())}`);
      await page.keyboard.press("Escape");
    });

    await step("27 Gabriela approves → Edit now", async () => {
      const ap = await inv("approveSectionEdit", { section: SEC_GABI!, actor: GABI, requester: MIHAI });
      note(`approve: ${JSON.stringify(ap.result)}`);
      await gotoView(page, P);
      await page.waitForTimeout(3000);
      await shot(page, "27-ribbon-edit-now");
      note(`ribbon (granted): ${await ribbonText(page)}`);
      const panel = await panelFrame(page);
      const grp = panel.locator(".sv-section-seals");
      await grp.scrollIntoViewIfNeeded();
      await page.waitForTimeout(2500);
      await shot(page, "28-panel-edit-now");
      const theirs = grp.locator('[data-testid="sv-section-row"]').filter({ hasText: THEIRS }).first();
      note(`their row (granted): ${norm(await theirs.innerText())} | primary=${await theirs.getAttribute("data-primary")}`);
      const frs = await devFrames(page, ".sec-frame");
      for (const fr of frs) note(`macro badge (granted view): ${norm(await fr.locator('[data-testid="sec-view-badge"]').innerText().catch(() => ""))}`);
      // What does the editor tell the grantee?
      await gotoEdit(page, P);
      await page.waitForTimeout(2000);
      await shot(page, "29-editor-as-grantee");
      await leaveEditor(page, P);
    });

    await step("30 revoke, re-request, Gabriela declines → cooldown copy", async () => {
      note(`revoke: ${JSON.stringify(await call("revoke-section-edit-grant", GABI, { sectionId: SEC_GABI, editorAccountId: MIHAI }))}`);
      note(`re-request: ${JSON.stringify(await call("request-section-edit", MIHAI, { sectionId: SEC_GABI, reason: "second try" }))}`);
      note(`deny: ${JSON.stringify(await inv("denySectionEdit", { section: SEC_GABI!, actor: GABI, requester: MIHAI }).then((r) => r.result))}`);
      await gotoView(page, P);
      await page.waitForTimeout(3000);
      await shot(page, "30-ribbon-after-decline");
      note(`ribbon (declined): ${await ribbonText(page)}`);
      const rf = await waitFrame(page, '[data-testid="ribbon-bar"]', 20_000);
      if (rf && (await rf.locator('[data-testid="ribbon-request-edit"]').count())) {
        await rf.locator('[data-testid="ribbon-request-edit"]').click();
        await page.waitForTimeout(600);
        await rf.locator('[data-testid="ribbon-ask-reason"]').fill("third try");
        await rf.locator('[data-testid="ribbon-ask-send"]').click();
        await page.waitForTimeout(3000);
        await shot(page, "31-ribbon-declined-error");
        note(`ribbon ask error: ${norm(await rf.locator('[data-testid="ribbon-ask-error"]').innerText().catch(() => "(none)"))}`);
        await page.keyboard.press("Escape");
      }
      const panel = await panelFrame(page);
      const grp = panel.locator(".sv-section-seals");
      await grp.scrollIntoViewIfNeeded();
      await page.waitForTimeout(2500);
      await shot(page, "32-panel-declined");
      const theirs = grp.locator('[data-testid="sv-section-row"]').filter({ hasText: THEIRS }).first();
      const btn = theirs.locator('[data-primary="request"]');
      note(`their row (declined): ${norm(await theirs.innerText())} | primary=${await theirs.getAttribute("data-primary")} disabled=${await btn.isDisabled().catch(() => "?")} title="${await btn.getAttribute("title").catch(() => "")}"`);
      await btn.hover().catch(() => {});
      await page.waitForTimeout(1200);
      await shot(page, "33-panel-declined-hover");
      // the requester's My work: is anything of this visible there?
      await page.goto(`${BASE_URL}/wiki/apps/c30bf71e-4287-4872-954d-db49cc68f0ff/${ENV}/my-work`, { waitUntil: "domcontentloaded" });
      const mw = await waitFrame(page, '[data-testid="mw-total"], .mw-card', 90_000);
      await page.waitForTimeout(4000);
      await shot(page, "34-my-work-as-requester");
      if (mw) note(`My work (requester, declined): ${norm(await mw.locator("body").innerText()).slice(0, 900)}`);
    });

    // ───────────────────────────── 3. WORKFLOW on the same page ─────────────────────────────
    if (!SKIP_WF) await step("35 workflow: In Review, approval pending on Mihai, section still locked", async () => {
      note(`settings: ${JSON.stringify((await inv("setSpaceWorkflowSettings", { spaceKey: SPACE, enabled: "1", autoAssignNew: "0", workflowId: "default" })).result).slice(0, 200)}`);
      note(`assign: ${JSON.stringify((await inv("assignWorkflow", { pageId: P, spaceKey: SPACE, workflowId: "default", actor: MIHAI })).result).slice(0, 200)}`);
      note(`to in_review: ${JSON.stringify((await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: MIHAI })).result).slice(0, 200)}`);
      note(`request approval: ${JSON.stringify((await inv("requestApproval", { pageId: P, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, mode: "any", actor: GABI })).result).slice(0, 300)}`);
      wfKeys.push(`workflow-state-${P}`, `workflow-pending-${P}`, `workflow-autoassigned-${P}`, `workflow-approval-${P}-approved-approval-${MIHAI}`, `workflow-inbox-${MIHAI}-${P}`, `workflow-idx-${SPACE}-draft-${P}`, `workflow-idx-${SPACE}-in_review-${P}`, `workflow-idx-${SPACE}-approved-${P}`);
      // requester's ribbon: Gabriela cannot be driven in the browser; Mihai is approver + section-requester(declined)
      await gotoView(page, P);
      await page.waitForTimeout(4000);
      await shot(page, "35-ribbon-in-review");
      note(`ribbon (in review, approval on me, Decisions locked): ${await ribbonText(page)}`);
      const chip = await findDevChip(page, 30_000).catch(() => null);
      note(`byline chip (in review): ${chip ? norm(await chip.innerText()) : "(none)"} title=${chip ? await chip.getAttribute("title") : ""}`);
      // the labels Confluence shows (label-sync)
      note(`page labels: ${norm(await page.locator('[data-testid="labels-container"], .labels-section, [data-test-id="labels"]').first().innerText().catch(() => "(none found)"))}`);
      const rf = await waitFrame(page, '[data-testid="ribbon-bar"]', 20_000);
      if (rf) {
        const wf = rf.locator(".wf-chip").first();
        if (await wf.count()) {
          note(`workflow chip: "${norm(await wf.innerText())}" title="${await wf.getAttribute("title")}"`);
          await wf.click();
          await page.waitForTimeout(1500);
          await shot(page, "36-ribbon-approval-dialog");
          note(`approval dialog: ${norm(await rf.locator(".wf-appr-panel").innerText().catch(() => "(none)"))}`);
          await page.keyboard.press("Escape");
        }
      }
      await chip?.click();
      const fr = await waitFrame(page, '[data-testid="pd-modal"]', 60_000);
      await page.waitForTimeout(3000);
      await shot(page, "37-details-in-review");
      if (fr) note(`details modal (in review): ${norm(await fr.locator('[data-testid="pd-modal"]').innerText()).slice(0, 900)}`);
      await page.keyboard.press("Escape");
      const panel = await panelFrame(page);
      if (panel) {
        await panel.locator(".sv-panel-container").first().scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(1500);
        await shot(page, "38-panel-in-review");
        note(`panel header (in review): ${norm(await panel.locator(".sv-panel-container").first().innerText()).slice(0, 700)}`);
      }
      await page.goto(`${BASE_URL}/wiki/apps/c30bf71e-4287-4872-954d-db49cc68f0ff/${ENV}/my-work`, { waitUntil: "domcontentloaded" });
      const mw = await waitFrame(page, '[data-testid="mw-total"], .mw-card', 90_000);
      await page.waitForTimeout(5000);
      await shot(page, "39-my-work-approver");
      if (mw) note(`My work (approver): ${norm(await mw.locator("body").innerText()).slice(0, 1200)}`);
    });

    // ───────────────────────────── 4. APPROVER ─────────────────────────────
    if (!SKIP_WF) await step("40 approve the page → what happens to the sections?", async () => {
      const secBefore = { mine: await getKvs(`section-protection-${SEC_MINE}`), gabi: await getKvs(`section-protection-${SEC_GABI}`) };
      await gotoView(page, P);
      const rf = await waitFrame(page, '[data-testid="ribbon-bar"]', 60_000);
      if (!rf) throw new Error("no ribbon");
      await rf.locator(".wf-chip").first().click();
      await page.waitForTimeout(1500);
      const approve = rf.locator(".wf-appr-approve").first();
      note(`approve button: "${norm(await approve.innerText().catch(() => "(none)"))}" outcome="${norm(await rf.locator(".wf-appr-outcome").innerText().catch(() => ""))}"`);
      await approve.click();
      await page.waitForTimeout(6000);
      await shot(page, "40-ribbon-approved");
      note(`ribbon (approved): ${await ribbonText(page)}`);
      const wf = rf.locator(".wf-chip").first();
      if (await wf.count()) { await wf.click(); await page.waitForTimeout(1500); await shot(page, "41-approved-chip-menu"); note(`approved chip menu/details: ${norm(await rf.locator('[role="menu"], .wf-details-panel').first().innerText().catch(() => "(none)"))}`); await page.keyboard.press("Escape"); }
      const state = await getKvs(`workflow-state-${P}`);
      note(`workflow state: ${JSON.stringify({ stateId: state?.stateId, approvedVersion: state?.approvedVersion, enforce: state?.enforce, approvers: state?.approvers })}`);
      const secAfter = { mine: await getKvs(`section-protection-${SEC_MINE}`), gabi: await getKvs(`section-protection-${SEC_GABI}`) };
      note(`section records unchanged by approval: mine=${JSON.stringify(secBefore.mine) === JSON.stringify(secAfter.mine)} gabi=${JSON.stringify(secBefore.gabi) === JSON.stringify(secAfter.gabi)}`);
      const chip = await findDevChip(page, 30_000).catch(() => null);
      note(`byline chip (approved): ${chip ? norm(await chip.innerText()) : "(none)"}`);
      // the approver (privileged for the workflow) edits inside Gabriela's SEALED section
      const before = await readPage(P);
      const adf = JSON.parse(JSON.stringify(before.adf));
      const gw = adf.content.find((n: any) => n.type === "bodiedExtension" && JSON.stringify(n).includes(SEC_GABI!));
      gw.content.push(paragraph("APPROVER EDIT INSIDE GABRIELAS SECTION"));
      await writeAdf(P, adf);
      const v = (await readPage(P)).version;
      await gotoView(page, P);
      await page.waitForTimeout(25_000);
      const after = await readPage(P);
      note(`approver edit inside sealed section at v${v}: reverted=${!JSON.stringify(after.adf).includes("APPROVER EDIT")} now v${after.version}; workflow=${JSON.stringify({ stateId: (await getKvs(`workflow-state-${P}`))?.stateId, approvedVersion: (await getKvs(`workflow-state-${P}`))?.approvedVersion })}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, "42-ribbon-after-approver-edit-in-section");
      note(`ribbon (after approver's section edit): ${await ribbonText(page)}`);
      // and an approver's edit OUTSIDE any section, on the Approved page
      const b2 = await readPage(P);
      const adf2 = JSON.parse(JSON.stringify(b2.adf));
      adf2.content.push(paragraph("APPROVER EDIT OUTSIDE SECTIONS"));
      await writeAdf(P, adf2);
      await page.waitForTimeout(20_000);
      const a2 = await readPage(P);
      note(`approver edit outside sections: kept=${JSON.stringify(a2.adf).includes("APPROVER EDIT OUTSIDE")} v${a2.version}; workflow=${JSON.stringify({ stateId: (await getKvs(`workflow-state-${P}`))?.stateId, approvedVersion: (await getKvs(`workflow-state-${P}`))?.approvedVersion })}`);
      await gotoView(page, P);
      await shot(page, "43-approved-page-final");
      note(`ribbon (final): ${await ribbonText(page)}`);
      const panel = await panelFrame(page);
      if (panel) { await panel.locator(".sv-section-seals").scrollIntoViewIfNeeded(); await page.waitForTimeout(2000); await shot(page, "44-panel-approved"); }
    });
  } finally {
    writeFileSync(`${OUT}/LOG.txt`, log.join("\n"));
    if (SEC_MINE) { await call("unseal-section", MIHAI, { sectionId: SEC_MINE }).catch(() => {}); await delKvs(`section-protection-${SEC_MINE}`).catch(() => {}); await delKvs(`section-snapshot-${SEC_MINE}`).catch(() => {}); }
    if (SEC_GABI) { await call("unseal-section", GABI, { sectionId: SEC_GABI }).catch(() => {}); await delKvs(`section-protection-${SEC_GABI}`).catch(() => {}); await delKvs(`section-snapshot-${SEC_GABI}`).catch(() => {}); for (const a of [MIHAI]) { await delKvs(`section-edit-request-${SEC_GABI}-${a}`).catch(() => {}); await delKvs(`section-edit-grant-${SEC_GABI}-${a}`).catch(() => {}); await delKvs(`sectionreq-owner-${GABI}-${SEC_GABI}-${a}`).catch(() => {}); } }
    for (const k of wfKeys) await delKvs(k).catch(() => {});
    for (const prefix of [`workflow-log-${P}-`, `workflow-approval-${P}-`, `space-section-protection-`]) {
      const keys = await queryKvs(prefix).catch(() => [] as string[]);
      for (const k of keys) { if (prefix !== "space-section-protection-" || (await getKvs(k))?.pageId === P) await delKvs(k).catch(() => {}); }
    }
    await delKvs(`workflow-settings-${SPACE}`).catch(() => {}); // was null before this walk
    await delKvs(`page-guard-${P}`).catch(() => {});
    if (originalGlobal) await setKvs("admin-settings-global", originalGlobal); else await delKvs("admin-settings-global");
    await deletePage(P).catch(() => {});
  }
});
