// THROWAWAY critique walk (2026-09-19): a naive user's path through classification, screenshotted at
// every step for docs/ux-critique/BACKLOG-CLASSIFICATION.md. Reads only, plus a throwaway WFH page and
// a temporary ribbonMode flip on admin-settings-global that is restored EXACTLY. No import in Assets.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { enterForgeSurface, ensureInViewport } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import { BASE_URL } from "../../config/env";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/evidence/critique-classification";
const DEV = "17516615";
const SPACE = "WFH";
const GLOBAL = "admin-settings-global";
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const notes: string[] = [];
const note = (s: string) => { notes.push(s); console.log("### " + s); };
const shot = (page: any, name: string, opts: any = {}) => page.screenshot({ path: `${OUT}/${name}.png`, ...opts });

test.describe.configure({ mode: "serial", timeout: 420_000 });
mkdirSync(OUT, { recursive: true });

async function devFrames(page: any) {
  const ifr = page.locator(`iframe[src*="${DEV}"]`);
  const n = await ifr.count();
  const out: any[] = [];
  for (let i = 0; i < n; i++) out.push(ifr.nth(i).contentFrame());
  return out;
}
async function ribbonState(page: any, label: string) {
  let found: any = null;
  for (let t = 0; t < 12 && !found; t++) {
    for (const f of await devFrames(page)) {
      if ((await f.locator('[data-testid="ribbon-bar"]').count().catch(() => 0)) > 0) { found = f; break; }
    }
    if (!found) await page.waitForTimeout(1500);
  }
  if (!found) { note(`${label}: NO ribbon bar rendered (banner hidden)`); return null; }
  const bar = found.locator('[data-testid="ribbon-bar"]');
  const text = (await bar.innerText()).replace(/\s+/g, " ").trim();
  const attrs = await bar.evaluate((el: any) => ({ state: el.dataset.state, mode: el.dataset.mode, level: el.dataset.level, source: el.dataset.source }));
  const title = await found.locator('[data-testid="ribbon-class"]').getAttribute("title");
  const buttons = await bar.locator("button").allInnerTexts();
  note(`${label}: ribbon text="${text}" attrs=${JSON.stringify(attrs)} classTitle="${title}" buttons=${JSON.stringify(buttons.map((b: string) => b.trim()).filter(Boolean))}`);
  return found;
}
async function chipInfo(page: any, label: string) {
  const chips = page.locator('button[data-testid="byline-forge-app-button"]');
  await chips.first().waitFor({ state: "visible", timeout: 60000 }).catch(() => {});
  const texts = await chips.allInnerTexts();
  note(`${label}: byline chips=${JSON.stringify(texts.map((t: string) => t.trim()))}`);
  // _door.ts rule: Sentinel Vault's dev chip carries the app image, or (no property yet) the static title.
  const withImage = chips.filter({ has: page.locator('img[data-testid="byline-forge-app-image"]'), hasText: "(Development)" });
  const byTitle = chips.filter({ hasText: /^Sentinel Vault.*\(Development\)/ });
  const dev = withImage.or(byTitle).first();
  if (await dev.count()) {
    const box = await dev.boundingBox();
    if (box) await shot(page, `${label}-byline-zoom`, { clip: { x: Math.max(0, box.x - 260), y: Math.max(0, box.y - 60), width: Math.min(900, box.width + 520), height: box.height + 120 } });
    const tip = await dev.getAttribute("title").catch(() => null);
    const aria = await dev.getAttribute("aria-label").catch(() => null);
    note(`${label}: dev chip title-attr=${JSON.stringify(tip)} aria=${JSON.stringify(aria)}`);
  }
  return dev;
}
async function openModal(page: any, chip: any) {
  await chip.scrollIntoViewIfNeeded();
  await chip.click();
  let app: any = null;
  await expect.poll(async () => {
    for (const f of await devFrames(page)) {
      if ((await f.locator('[data-testid="pd-modal"][data-ready="1"]').count().catch(() => 0)) > 0) { app = f; return true; }
    }
    return false;
  }, { timeout: 60000, message: "page-details modal boots" }).toBe(true);
  return app;
}

let spaceId = "";
let pageId: string | null = null;
let originalGlobal: any = null;
let originalSpaceDefault: any = null;

test.beforeAll(async () => {
  spaceId = String(await spaceIdByKey(SPACE));
  originalGlobal = (await getKvs(GLOBAL)) || null;
  // CLS-1 (2026-09-20): classification is OFF by default and the tab's controls are inert while it is — on for this walk, restored in afterAll.
  await setKvs(GLOBAL, { ...(originalGlobal || {}), classificationEnabled: true });
  originalSpaceDefault = (await getKvs(`classification-space-${spaceId}`)) || null;
  note(`global settings: ribbonMode=${originalGlobal?.ribbonMode ?? "(unset→exceptions)"} ribbonThresholdRank=${originalGlobal?.ribbonThresholdRank ?? "(unset→4)"} enableDocRibbons=${originalGlobal?.enableDocRibbons ?? "(unset)"}; WFH space default=${JSON.stringify(originalSpaceDefault)}; levels KVS=${JSON.stringify(await getKvs("classification-levels"))}`);
});
test.afterAll(async () => {
  if (originalGlobal) await setKvs(GLOBAL, originalGlobal); else await delKvs(GLOBAL).catch(() => {});
  if (pageId) { await delKvs(`classification-page-${pageId}`).catch(() => {}); await deletePage(pageId).catch(() => {}); }
  writeFileSync(`${OUT}/NOTES.txt`, notes.join("\n") + "\n");
});

test("A. page editor: fresh page → byline chip → modal → classify → ribbon in each mode", async ({ page }) => {
  await delKvs(`classification-space-${spaceId}`).catch(() => {});
  const created = await createPage({ spaceId, title: `HARNESS critique-classification ${Date.now()}`, adf: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "A plain page. Where do I classify it?" }] }] } });
  pageId = String(created.id);
  const url = `${BASE_URL}/wiki/spaces/${SPACE}/pages/${pageId}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await shot(page, "A01-fresh-page");
  await ribbonState(page, "A01 fresh (exceptions, unclassified)");
  const chip = await chipInfo(page, "A02");
  note("A: clicks so far to reach the classification control: 1 (byline chip)");
  const app = await openModal(page, chip);
  await shot(page, "A03-modal-open");
  const cls = app.locator('[data-testid="pd-classification"]');
  const hasCls = await cls.count();
  note(`A03: modal has a Classification section: ${hasCls > 0}; modal tabs=${JSON.stringify(await app.locator('[data-testid^="pd-tab-"]').allInnerTexts())}; header=${JSON.stringify((await app.locator('[data-testid="pd-modal"] h1, [data-testid="pd-modal"] h2, [data-testid="pd-modal"] h3').allInnerTexts()).slice(0, 4))}`);
  if (hasCls) {
    await cls.scrollIntoViewIfNeeded();
    const box = await app.locator('[data-testid="pd-modal"]').boundingBox();
    note(`A03: pill="${await app.locator('[data-testid="pd-level-pill"]').innerText()}" desc="${await app.locator('[data-testid="pd-level-desc"]').innerText()}" picker-btn="${(await app.locator('[data-testid="pd-level-picker"]').innerText()).trim()}" use-space-default-disabled=${await app.locator('[data-testid="pd-use-space-default"]').isDisabled()}`);
    await shot(page, "A04-modal-classification-section");
    await app.locator('[data-testid="pd-level-picker"]').click();
    await page.waitForTimeout(400);
    note(`A05: picker options=${JSON.stringify(await app.locator('[role="option"]').allInnerTexts())}`);
    await shot(page, "A05-picker-open");
    await app.locator('[data-testid="pd-level-option-restricted"]').click();
    await expect(app.locator('[data-testid="pd-level-pill"]')).toHaveText("Restricted", { timeout: 20000 });
    await page.waitForTimeout(800);
    note(`A06: after pick pill="${await app.locator('[data-testid="pd-level-pill"]').innerText()}" desc="${await app.locator('[data-testid="pd-level-desc"]').innerText()}" — total clicks from page view: 3 (chip, picker, option). Any confirmation/undo/what-now message? ${JSON.stringify(await app.locator('[role="alert"], [role="status"]').allInnerTexts())}`);
    await shot(page, "A06-after-pick-restricted");
    // Activity tab: is the change recorded?
    const act = app.locator('[data-testid="pd-tab-activity"]');
    if (await act.count()) { await act.click(); await page.waitForTimeout(2500); note(`A07: activity tab text (first 600)="${(await app.locator('[data-testid="pd-modal"]').innerText()).replace(/\s+/g, " ").slice(0, 600)}"`); await shot(page, "A07-activity-after-classify"); }
  }
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await shot(page, "A08-page-restricted-exceptions");
  await ribbonState(page, "A08 Restricted (exceptions, rank 4 ≥ 4)");
  await chipInfo(page, "A08");

  await setKvs(`classification-page-${pageId}`, { levelId: "internal", updatedAt: new Date().toISOString() });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await shot(page, "A09-page-internal-exceptions");
  await ribbonState(page, "A09 Internal (exceptions, rank 2 < 4)");
  await chipInfo(page, "A09");

  await setKvs(GLOBAL, { ...(originalGlobal || {}), ribbonMode: "always" });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await shot(page, "A10-page-internal-always");
  await ribbonState(page, "A10 Internal (always)");

  await delKvs(`classification-page-${pageId}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  await shot(page, "A11-page-unclassified-always");
  const rf = await ribbonState(page, "A11 Unclassified (always)");
  if (rf) {
    const bar = rf.locator('[data-testid="ribbon-bar"]');
    const box = await bar.boundingBox();
    note(`A11: ribbon bar size=${JSON.stringify(box)}`);
    await rf.locator('[data-testid="ribbon-dismiss"]').click().catch(() => {});
    await page.waitForTimeout(1000);
    await shot(page, "A12-after-dismiss");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await ribbonState(page, "A12b after dismiss + reload (does dismissal stick?)");
  }
  if (originalGlobal) await setKvs(GLOBAL, originalGlobal); else await delKvs(GLOBAL).catch(() => {});
  if (originalSpaceDefault) await setKvs(`classification-space-${spaceId}`, originalSpaceDefault);
});

test("B. site admin: steward console Settings (ribbon) and Classification tab, Assets wizard up to preview", async ({ page }) => {
  const T = getTarget("sentinel-steward-console");
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 45000 });
  if (s.kind !== "custom") throw new Error("expected Custom UI");
  const app = s.frame;
  note(`B01: console tabs=${JSON.stringify(await app.locator('.tab-navigation .tab-button, [data-testid^="tab-"]').allInnerTexts())}`);
  await shot(page, "B01-console-landing");
  const rm = app.locator('[data-testid^="ribbon-mode"]').first();
  if (await rm.count()) {
    await ensureInViewport(page, rm);
    await page.waitForTimeout(500);
    note(`B02: ribbon setting row text="${(await rm.locator("xpath=ancestor::*[contains(@class,'settings-row')][1]").innerText().catch(async () => (await rm.innerText()))).replace(/\s+/g, " ").slice(0, 500)}"`);
    await shot(page, "B02-settings-ribbon-mode");
  } else note("B02: no ribbon-mode control found on the landing tab");
  await app.locator('[data-testid="tab-classification"]').click();
  await expect(app.locator('[data-testid="cls-tab"], [data-testid="cls-error"]').first()).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(800);
  await shot(page, "B03-classification-tab-top");
  const tabText = (await app.locator('[data-testid="cls-tab"]').innerText()).replace(/\s+/g, " ");
  note(`B03: cls tab text (first 1200)="${tabText.slice(0, 1200)}"`);
  note(`B03: does the tab say what a level DOES? mentions of seal/workflow/approval/enforce/restrict/export: ${JSON.stringify((tabText.match(/seal|workflow|approv|enforc|restrict|export|ribbon|banner/gi) || []))}`);
  const levels = app.locator('[data-testid="cls-levels-editor"]');
  await ensureInViewport(page, levels); await page.waitForTimeout(400);
  await shot(page, "B04-levels-editor");
  const table = app.locator('[data-testid="cls-spaces-table"]');
  await ensureInViewport(page, table); await page.waitForTimeout(400);
  await shot(page, "B05-space-defaults");
  const rows = await table.locator("tbody tr").count();
  const set = await table.locator("tbody tr .cls-chip:not(.cls-chip-none)").count();
  note(`B05: spaces listed=${rows}, with a default set=${set}`);
  // Assets wizard, stop before import
  const sec = app.locator('[data-testid="cls-assets"]');
  await ensureInViewport(page, sec); await page.waitForTimeout(300);
  await shot(page, "B06-assets-section-idle");
  note(`B06: assets section idle text="${(await sec.innerText()).replace(/\s+/g, " ")}"`);
  await sec.locator('[data-testid="cls-assets-load"]').click();
  await expect(sec.locator('[data-testid="cls-assets-schemas"], [data-testid="cls-assets-error"]').first()).toBeVisible({ timeout: 60000 });
  await page.waitForTimeout(500);
  await shot(page, "B07-assets-schemas");
  note(`B07: schemas=${JSON.stringify(await sec.locator('[data-testid="cls-assets-schema"]').allInnerTexts())} error=${JSON.stringify(await sec.locator('[data-testid="cls-assets-error"]').allInnerTexts())}`);
  const ig = sec.locator('[data-testid="cls-assets-schema"]', { hasText: "Information Governance" });
  if (await ig.count()) {
    await ig.click();
    await expect(sec.locator('[data-testid="cls-assets-types"], [data-testid="cls-assets-error"]').first()).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(500);
    note(`B08: object types=${JSON.stringify(await sec.locator('[data-testid="cls-assets-type"]').allInnerTexts())}`);
    await shot(page, "B08-assets-types");
    await sec.locator('[data-testid="cls-assets-type"]', { hasText: "Classification Level" }).click();
    await expect(sec.locator('[data-testid="cls-assets-mapping"], [data-testid="cls-assets-error"]').first()).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(500);
    await ensureInViewport(page, sec.locator('[data-testid="cls-assets-mapping"]'));
    note(`B09: mapping step text="${(await sec.locator('[data-testid="cls-assets-mapping"]').innerText()).replace(/\s+/g, " ")}"`);
    await shot(page, "B09-assets-mapping");
    await sec.locator('[data-testid="cls-assets-preview-btn"]').click();
    await expect(sec.locator('[data-testid="cls-assets-preview"], [data-testid="cls-assets-error"]').first()).toBeVisible({ timeout: 60000 });
    await page.waitForTimeout(500);
    await ensureInViewport(page, sec.locator('[data-testid="cls-assets-preview"]'));
    note(`B10: preview text="${(await sec.locator('[data-testid="cls-assets-preview"]').innerText()).replace(/\s+/g, " ")}"`);
    await shot(page, "B10-assets-preview-NOT-imported");
  }
  // 900px width sanity of the tab
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(800);
  await shot(page, "B11-classification-900px");
});

test("C. space admin: the space console has no classification control; D. My work says nothing about it", async ({ page }) => {
  const T = getTarget("sentinel-vault-realm");
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".space-admin-title", timeout: 45000 });
  if (s.kind !== "custom") throw new Error("expected Custom UI");
  const app = s.frame;
  const tabs = await app.locator(".tab-navigation .tab-button").allInnerTexts();
  note(`C01: space console tabs=${JSON.stringify(tabs)}; any 'classif' in page text: ${/classif/i.test(await app.locator("body").innerText())}`);
  await shot(page, "C01-space-console");
  const M = getTarget("sentinel-my-work");
  await page.goto(M.deepLink(M.envId)!, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  await shot(page, "D01-my-work");
  let txt = "";
  for (const f of await devFrames(page)) txt += (await f.locator("body").innerText().catch(() => "")) + " ";
  note(`D01: my work mentions classification: ${/classif/i.test(txt)}; text(first 400)="${txt.replace(/\s+/g, " ").slice(0, 400)}"`);
});
