// Data classification (Part 3.1 + 3.2) — UAT of the steward console's Classification tab and the
// six classification-* resolvers, live on the dev env. The App provider runs on wolfaenpak (native
// levels answer []). No test-hook seam exists for these resolvers and no page surface calls the
// page-level pair yet, so resolvers are driven by REPLAYING the console's own Forge invocation
// (the useInvokeExtensionRelayMutation the host posts on the tab's behalf) with another
// functionKey/payload — same session, same context token, i.e. always Mihai (site admin). Anything
// that needs a different caller (Gabriela) is therefore NOT verifiable here and is logged as such.
// Restores: WFH default cleared, levels KVS restored to its original value, the throwaway page deleted.
// @covers resolver:classification-provider resolver:classification-list-spaces resolver:classification-set-space-default resolver:classification-get-page resolver:classification-set-page resolver:classification-manage-levels
import { test, expect } from "../../fixtures/forge";
import type { Page, FrameLocator } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { enterForgeSurface, ensureInViewport } from "../../forge/frame";
import { getTestState } from "../../testhook/client";
import { VIEWPORT } from "../../config/env";
// @ts-ignore plain ESM helpers
import { createPage, deletePage, spaceIdByKey } from "../../data/confluence.mjs";
// @ts-ignore plain ESM helpers
import { request as rest } from "../../data/jira.mjs";
import { mkdirSync } from "node:fs";

const T = getTarget("sentinel-steward-console");
const OUT = "/tmp/sv-class";
const SPACE_KEY = process.env.SENTINEL_TEST_SPACE || "WFH";
const PROP = "sentinel-classification";
const LEVELS_KEY = "classification-levels";
const spaceKvs = (id: string) => `classification-space-${id}`;
const pageKvs = (id: string) => `classification-page-${id}`;
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

test.describe.configure({ mode: "serial", timeout: 180_000 });
mkdirSync(OUT, { recursive: true });

// ── invoke replay ─────────────────────────────────────────────────────────────────────────────
let captured: { url: string; headers: Record<string, string>; body: any } | null = null;
function armCapture(page: Page) {
  page.on("request", (r) => {
    const b = r.postData() || "";
    if (!captured && b.includes('"functionKey":"classification-')) {
      const h: Record<string, string> = {};
      for (const k of ["content-type", "atl-client-name", "x-experimentalapi", "accept"]) if (r.headers()[k]) h[k] = r.headers()[k];
      captured = { url: r.url(), headers: h, body: JSON.parse(b) };
    }
  });
}
async function invoke(page: Page, functionKey: string, payload: any) {
  if (!captured) throw new Error("no classification invocation captured yet — open the tab first");
  const body = JSON.parse(JSON.stringify(captured.body));
  body.variables.input.payload.call = { functionKey, payload };
  const out = await page.evaluate(async ({ url, hdr, body }) => {
    const r = await fetch(url, { method: "POST", headers: hdr, credentials: "include", body: JSON.stringify(body) });
    return { status: r.status, text: await r.text() };
  }, { url: captured.url, hdr: captured.headers, body });
  if (out.status !== 200) throw new Error(`invoke ${functionKey} → HTTP ${out.status}: ${out.text.slice(0, 300)}`);
  const env = JSON.parse(out.text)?.data?.invokeExtension;
  if (!env?.success) throw new Error(`invoke ${functionKey} → not successful: ${out.text.slice(0, 300)}`);
  return env.response?.body;
}

// ── UI helpers ────────────────────────────────────────────────────────────────────────────────
const uiProblems: string[] = [];
async function openTab(page: Page): Promise<FrameLocator> {
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  const s = await enterForgeSurface(page, { surface: "custom", readySelector: ".admin-title", timeout: 45000 });
  if (s.kind !== "custom") throw new Error("expected Custom UI");
  const app = s.frame;
  await app.locator('[data-testid="tab-classification"]').click();
  // loading → content, and never a permanent spinner or an error panel
  await expect(app.locator('[data-testid="cls-tab"], [data-testid="cls-error"]').first()).toBeVisible({ timeout: 40000 });
  if (await app.locator('[data-testid="cls-error"]').count()) throw new Error("Classification tab shows an error: " + (await app.locator('[data-testid="cls-error"]').innerText()));
  await expect(app.locator('[data-testid="cls-loading"]')).toHaveCount(0);
  return app;
}
/** Open a LevelPicker and choose the option whose chip reads `name` ("Not set" clears). */
async function pick(page: Page, app: FrameLocator, pickerTestId: string, name: string) {
  const picker = app.locator(`[data-testid="${pickerTestId}"]`);
  await ensureInViewport(page, picker);
  await picker.locator(".mini-select-value").click();
  const menu = picker.locator(".cls-picker-menu");
  await expect(menu).toBeVisible({ timeout: 5000 });
  // Clipping probe: a menu opened inside the table's overflow-x:auto wrap (which makes overflow-y
  // auto too) is cut off at the wrap's bottom edge and only reachable by scrolling INSIDE the table.
  const clip = await menu.evaluate((el) => {
    const m = el.getBoundingClientRect();
    const wrap = el.closest(".cls-table-wrap");
    if (!wrap) return null;
    const w = wrap.getBoundingClientRect();
    return { menuBottom: Math.round(m.bottom), wrapBottom: Math.round(w.bottom), wrapScrollable: wrap.scrollHeight > wrap.clientHeight + 1 };
  });
  if (clip && clip.menuBottom > clip.wrapBottom + 1) uiProblems.push(`picker ${pickerTestId}: menu extends ${clip.menuBottom - clip.wrapBottom}px past the table wrap (overflow-x:auto clips it; the wrap became scrollable=${clip.wrapScrollable})`);
  const opt = menu.locator(".cls-picker-opt", { has: app.locator(`.cls-chip:text-is("${name}")`) }).first();
  await expect(opt, `option ${name} listed in ${pickerTestId}`).toBeVisible({ timeout: 5000 });
  await opt.click();
  await expect(menu).toBeHidden({ timeout: 5000 });
}
async function shot(page: Page, name: string) { await page.screenshot({ path: `${OUT}/${name}.png` }); }

// ── state ─────────────────────────────────────────────────────────────────────────────────────
let spaceId = "";
let originalLevels: any = null;
let originalSpaceDefault: any = null;
let originalGlobal: any = null;
let throwawayPageId: string | null = null;
const consoleErrors: string[] = [];
const dialogs: string[] = [];

test.beforeAll(async () => {
  spaceId = String(await spaceIdByKey(SPACE_KEY));
  expect(spaceId, `space id of ${SPACE_KEY}`).toMatch(/^\d+$/);
  originalLevels = await getKvs(LEVELS_KEY);
  originalSpaceDefault = await getKvs(spaceKvs(spaceId));
  // CLS-1 (2026-09-20): classification is OFF by default and the tab's controls are inert while it is.
  originalGlobal = await getKvs("admin-settings-global");
  await setKvs("admin-settings-global", { ...(originalGlobal || {}), classificationEnabled: true });
  console.log(`### ${SPACE_KEY} id=${spaceId}; original levels KVS=${JSON.stringify(originalLevels)}; original space default=${JSON.stringify(originalSpaceDefault)}`);
});
test.afterAll(async () => {
  if (originalGlobal) await setKvs("admin-settings-global", originalGlobal); else await delKvs("admin-settings-global").catch(() => {});
  if (originalLevels) await setKvs(LEVELS_KEY, originalLevels); else await delKvs(LEVELS_KEY);
  if (originalSpaceDefault) await setKvs(spaceKvs(spaceId), originalSpaceDefault); else await delKvs(spaceKvs(spaceId));
  if (throwawayPageId) { await delKvs(pageKvs(throwawayPageId)); await deletePage(throwawayPageId).catch(() => {}); }
  console.log("### UI observations (" + uiProblems.length + "):"); uiProblems.forEach((p) => console.log("  - " + p));
  console.log("### console errors (" + consoleErrors.length + "):"); consoleErrors.slice(0, 20).forEach((p) => console.log("  - " + p));
  console.log("### native dialogs (" + dialogs.length + "):"); dialogs.forEach((p) => console.log("  - " + p));
});
test.beforeEach(async ({ page }) => {
  armCapture(page);
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + String(e).slice(0, 200)));
  page.on("dialog", async (d) => { dialogs.push(`${d.type()}: ${d.message()}`); await d.dismiss().catch(() => {}); });
});

// 1 ─────────────────────────────────────────────────────────────────────────────────────────────
test("1. the Classification tab renders: App badge, 4 seeded levels with swatches, spaces table with pickers", async ({ page }) => {
  const app = await openTab(page);
  await shot(page, "01-tab-loaded");

  const badge = app.locator('[data-testid="cls-provider-badge"]');
  await expect(badge).toBeVisible();
  expect((await badge.textContent())?.trim(), "provider badge (textContent; CSS uppercases it)").toBe("App");

  // site admin on the App scheme → the levels EDITOR (rows with a colour swatch, name, rank, description)
  // The app's DEFAULT_LEVELS (classification/logic.js): the contrast palette (white ink >= 4.5:1) — the older #15803D/#1D4ED8/#B45309/#B91C1C set was replaced.
  const expected = [["Public", "#15803D", "1"], ["Internal", "#1D4ED8", "2"], ["Confidential", "#B45309", "3"], ["Restricted", "#B91C1C", "4"]];
  const rows = app.locator(".cls-level-row");
  await expect(rows).toHaveCount(4);
  const toRgb = (hex: string) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
  for (let i = 0; i < 4; i++) {
    const row = rows.nth(i);
    const [name, hex, rank] = expected[i];
    expect(await row.locator('input[aria-label="Level name"]').inputValue(), `level ${i} name`).toBe(name);
    expect(await row.locator('input[aria-label="Rank"]').inputValue(), `level ${i} rank`).toBe(rank);
    expect((await row.locator('input[aria-label="Description"]').inputValue()).length, `level ${i} has a description`).toBeGreaterThan(5);
    const bg = await row.locator(".cls-swatch").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg, `level ${name} swatch colour`).toBe(toRgb(hex));
  }
  await expect(app.locator('[data-testid="cls-levels-save"]')).toBeDisabled(); // nothing dirty yet

  // spaces table
  const table = app.locator('[data-testid="cls-spaces-table"]');
  await ensureInViewport(page, table);
  await expect(table).toBeVisible();
  const n = await table.locator("tbody tr[data-testid^='cls-space-row-']").count();
  expect(n, "at least one space row").toBeGreaterThan(0);
  const wfh = table.locator(`[data-testid="cls-space-row-${SPACE_KEY}"]`);
  await expect(wfh).toBeVisible();
  expect((await wfh.locator("td").nth(1).innerText()).trim()).toBe(SPACE_KEY);
  expect((await wfh.locator("td").nth(2).innerText()).trim().length, "space name shown").toBeGreaterThan(0);
  expect((await wfh.locator("td").nth(3).innerText()).trim().toLowerCase()).toMatch(/global|personal/);
  await expect(wfh.locator(`[data-testid="cls-space-level-${SPACE_KEY}"]`)).toBeVisible();
  // every row has a picker and it is the console's custom control (no native <select> anywhere)
  expect(await table.locator("tbody tr [data-testid^='cls-space-picker-']").count(), "one picker per row").toBe(n);
  expect(await app.locator("select").count(), "no native <select>").toBe(0);
  console.log(`### spaces listed: ${n}`);
  await shot(page, "02-spaces-table");

  // header cells the user sees
  const heads = (await table.locator("thead th").allTextContents()).map((t: string) => t.trim()); // textContent: CSS uppercases the header
  expect(heads.slice(1)).toEqual(["Key", "Space", "Type", "Default level", "Change"]);

  // 900px once: nothing may scroll the tab horizontally except the table wrap itself
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(600);
  await shot(page, "03-tab-900px");
  const overflow = await app.locator('[data-testid="cls-tab"]').evaluate((el) => {
    const doc = el.ownerDocument.documentElement;
    const head = el.querySelector(".cls-levels-head") as HTMLElement | null;
    const wrap = el.querySelector(".cls-table-wrap") as HTMLElement | null;
    return { docScroll: doc.scrollWidth, docClient: doc.clientWidth, headScroll: head?.scrollWidth, headClient: head?.clientWidth, wrapScroll: wrap?.scrollWidth, wrapClient: wrap?.clientWidth };
  });
  console.log("### 900px overflow probe:", JSON.stringify(overflow));
  if (overflow.docScroll > overflow.docClient + 1) uiProblems.push(`900px: the tab scrolls horizontally (${overflow.docScroll} > ${overflow.docClient})`);
  if ((overflow.wrapScroll || 0) > (overflow.wrapClient || 0) + 1) uiProblems.push(`900px: the spaces table overflows its wrap (${overflow.wrapScroll} > ${overflow.wrapClient}) — horizontal scroll inside the table`);
  await page.setViewportSize(VIEWPORT);
});

// 2 ─────────────────────────────────────────────────────────────────────────────────────────────
test("2. WFH default via the row picker → KVS → reload shows it; bulk bar sets Internal; clear restores", async ({ page }) => {
  await delKvs(spaceKvs(spaceId));
  let app = await openTab(page);
  await pick(page, app, `cls-space-picker-${SPACE_KEY}`, "Confidential");
  const notice = app.locator('[data-testid="cls-notice"]');
  await expect(notice).toBeVisible({ timeout: 15000 });
  expect((await notice.innerText()).trim(), "row set notice").toBe("1 space updated.");
  await expect(app.locator(`[data-testid="cls-space-level-${SPACE_KEY}"]`)).toHaveText("Confidential");
  await expect.poll(async () => (await getKvs(spaceKvs(spaceId)))?.levelId, { timeout: 15000 }).toBe("confidential");
  await shot(page, "04-row-set-confidential");

  app = await openTab(page);
  const chip = app.locator(`[data-testid="cls-space-level-${SPACE_KEY}"]`);
  await ensureInViewport(page, chip);
  await expect(chip, "after reload the row shows Confidential").toHaveText("Confidential");
  const chipBg = await chip.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(chipBg, "chip is a solid fill of the level colour").toBe("rgb(180, 83, 9)");
  // the row picker's own value shows the same chip
  await expect(app.locator(`[data-testid="cls-space-picker-${SPACE_KEY}"] .cls-chip`)).toHaveText("Confidential");

  // bulk: tick WFH → bulk bar → Internal → Apply → custom dialog → confirm
  const row = app.locator(`[data-testid="cls-space-row-${SPACE_KEY}"]`);
  await row.locator('input[type="checkbox"]').check();
  const bar = app.locator('[data-testid="cls-bulk-bar"]');
  await expect(bar).toBeVisible();
  expect((await bar.locator("strong").innerText()).trim()).toBe("1 space selected");
  await expect(app.locator('[data-testid="cls-bulk-apply"]')).toBeDisabled(); // no level chosen yet
  await pick(page, app, "cls-bulk-picker", "Internal");
  await app.locator('[data-testid="cls-bulk-apply"]').click();
  const dialog = app.locator('.cls-dialog[role="dialog"]');
  await expect(dialog).toBeVisible();
  await shot(page, "05-bulk-dialog");
  const confirm = dialog.locator("button.btn-primary");
  expect((await confirm.innerText()).trim(), "dialog confirm label").toBe("Set 1 space");
  expect(await dialog.locator(".cls-chip").innerText()).toBe("Internal");
  await confirm.click();
  await expect(dialog).toBeHidden({ timeout: 15000 });
  await expect(app.locator('[data-testid="cls-notice"]')).toHaveText("1 space updated.", { timeout: 15000 });
  await expect(app.locator(`[data-testid="cls-space-level-${SPACE_KEY}"]`)).toHaveText("Internal");
  await expect(bar, "selection cleared after the bulk write").toBeHidden();
  await expect.poll(async () => (await getKvs(spaceKvs(spaceId)))?.levelId, { timeout: 15000 }).toBe("internal");
  await shot(page, "06-bulk-set-internal");

  // clear via the row picker ("Not set")
  await pick(page, app, `cls-space-picker-${SPACE_KEY}`, "Not set");
  await expect(app.locator(`[data-testid="cls-space-level-${SPACE_KEY}"]`)).toHaveText("Not set", { timeout: 15000 });
  await expect.poll(async () => await getKvs(spaceKvs(spaceId)), { timeout: 15000 }).toBeFalsy();
  // space-property mirror needs write:space:confluence (not in the manifest) — report, do not fail
  const sp = await rest("GET", `/wiki/api/v2/spaces/${spaceId}/properties?key=${PROP}`, { raw: true });
  console.log(`### space property mirror after clear: HTTP ${sp.status} results=${sp.status < 400 ? (JSON.parse(sp.text).results || []).length : "n/a"}`);
  expect(dialogs, "no native alert/confirm/prompt fired").toEqual([]);
});

// 3 ─────────────────────────────────────────────────────────────────────────────────────────────
test("3. page override on a throwaway page: space default → page Restricted (+ content property) → reset", async ({ page }) => {
  await openTab(page);
  const set = await invoke(page, "classification-set-space-default", { spaceId, levelId: "confidential" });
  expect(set?.results?.[0]?.ok, "space default set for the page test").toBe(true);

  const created = await createPage({ spaceId, title: `SV classification UAT ${Date.now()}`, adf: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "classification UAT" }] }] } });
  throwawayPageId = String(created.id);
  const pid: string = throwawayPageId;
  console.log("### throwaway page", pid);

  const g1 = await invoke(page, "classification-get-page", { pageId: pid });
  expect(g1?.effective?.source, "inherits the space default").toBe("space");
  expect(g1?.effective?.level?.id).toBe("confidential");
  expect(g1?.pageLevelId).toBeNull();

  const s1 = await invoke(page, "classification-set-page", { pageId: pid, levelId: "restricted" });
  expect(s1?.ok, "set-page Restricted ok").toBe(true);
  expect(s1?.effective?.source).toBe("page");
  expect(s1?.effective?.level?.id).toBe("restricted");
  const g2 = await invoke(page, "classification-get-page", { pageId: pid });
  expect(g2?.effective).toEqual(expect.objectContaining({ source: "page" }));
  expect(g2?.pageLevelId).toBe("restricted");
  expect((await getKvs(pageKvs(pid)))?.levelId, "KVS page override").toBe("restricted");
  const p1 = await rest("GET", `/wiki/api/v2/pages/${pid}/properties?key=${PROP}`, { raw: true });
  expect(p1.status, "content property read").toBeLessThan(400);
  const props1 = JSON.parse(p1.text).results || [];
  expect(props1.length, `content property ${PROP} exists after set-page`).toBe(1);
  expect(props1[0].value, "property value carries the level").toEqual({ levelId: "restricted" });

  // an unknown level is refused, and the override is untouched
  const bad = await invoke(page, "classification-set-page", { pageId: pid, levelId: "top-secret" });
  expect(bad?.ok, "unknown level refused").toBe(false);
  expect(bad?.reason).toMatch(/Unknown classification level/);
  expect((await getKvs(pageKvs(pid)))?.levelId).toBe("restricted");

  const s2 = await invoke(page, "classification-set-page", { pageId: pid, levelId: null });
  expect(s2?.ok, "set-page null ok").toBe(true);
  expect(s2?.effective?.source, "back to the space default").toBe("space");
  expect(s2?.effective?.level?.id).toBe("confidential");
  await expect.poll(async () => await getKvs(pageKvs(pid)), { timeout: 10000 }).toBeFalsy();
  const p2 = await rest("GET", `/wiki/api/v2/pages/${pid}/properties?key=${PROP}`, { raw: true });
  expect((JSON.parse(p2.text).results || []).length, "content property removed after reset").toBe(0);

  const del = await deletePage(pid);
  expect(del.status, "throwaway page deleted").toBeLessThan(400);
  throwawayPageId = null;
  const cleared = await invoke(page, "classification-set-space-default", { spaceId, levelId: null });
  expect(cleared?.results?.[0]?.ok).toBe(true);
});

// 4 ─────────────────────────────────────────────────────────────────────────────────────────────
test("4. authorization negatives (what a site-admin session can prove; Gabriela cases are UNVERIFIED here)", async ({ page }) => {
  await openTab(page);
  // A page that does not exist / a non-numeric id: canEditPage fails closed → refused, nothing written
  const ghost = await invoke(page, "classification-set-page", { pageId: "1", levelId: "restricted" });
  expect(ghost?.ok, "set-page on a page nobody can edit is refused").toBe(false);
  expect(ghost?.reason).toBe("Not authorized");
  expect(await getKvs(pageKvs("1")), "nothing written for the refused page").toBeFalsy();
  const junk = await invoke(page, "classification-set-page", { pageId: "abc; drop", levelId: "restricted" });
  expect(junk?.ok).toBe(false);
  const ghostSpace = await invoke(page, "classification-set-space-default", { spaceId: "1", levelId: "public" });
  expect(ghostSpace?.results?.[0]?.ok, "set-space-default on an unresolvable space is refused").toBe(false);
  expect(ghostSpace?.results?.[0]?.reason).toBe("Not authorized");
  expect(await getKvs(spaceKvs("1"))).toBeFalsy();
  const readGhost = await invoke(page, "classification-get-page", { pageId: "1" });
  expect(readGhost?.reason, "get-page on an unreadable page is refused").toBe("Not authorized");
  const badLevels = await invoke(page, "classification-manage-levels", { levels: "nope" });
  expect(badLevels?.ok).toBe(false);
  expect(badLevels?.reason).toMatch(/must be an array/);
  console.log("### UNVERIFIED (no seam, session is Mihai): set-page as Gabriela on a page she cannot edit; manage-levels as Gabriela (non-site-admin); list-spaces as Gabriela (no stewardship). The replay carries Mihai's context token, so a different caller cannot be manufactured from this harness.");
});

// 5 ─────────────────────────────────────────────────────────────────────────────────────────────
test("5. level management: add Secret (visible in pickers) → remove; duplicate name refused with a visible error", async ({ page }) => {
  let app = await openTab(page);
  const editor = app.locator('[data-testid="cls-levels-editor"]');
  await editor.getByRole("button", { name: "Add level" }).click();
  const rows = app.locator(".cls-level-row");
  await expect(rows).toHaveCount(5);
  const last = rows.nth(4);
  await last.locator('input[aria-label="Level name"]').fill("Secret");
  expect(await last.locator('input[aria-label="Rank"]').inputValue(), "new level rank pre-filled").toBe("5");
  await last.locator('input[aria-label="Description"]').fill("UAT level");
  // colour via the swatch popover: type an exact hex
  await last.locator(".cls-swatch").click();
  const swatchMenu = last.locator(".cls-swatch-menu");
  await expect(swatchMenu).toBeVisible();
  await shot(page, "07-swatch-popover");
  await swatchMenu.locator('input[aria-label="Hex colour"]').fill("#7C3AED");
  await last.locator('input[aria-label="Level name"]').click(); // leave the popover
  await expect(swatchMenu).toBeHidden({ timeout: 3000 });
  expect(await last.locator(".cls-swatch").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(124, 58, 237)");
  const save = app.locator('[data-testid="cls-levels-save"]');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(app.locator('[data-testid="cls-notice"]')).toHaveText("Levels saved.", { timeout: 15000 });
  await shot(page, "08-secret-added");
  const stored = await getKvs(LEVELS_KEY);
  expect(stored?.levels?.map((l: any) => l.id), "KVS levels after add").toEqual(["public", "internal", "confidential", "restricted", "secret"]);
  expect(stored.levels[4]).toEqual(expect.objectContaining({ name: "Secret", color: "#7c3aed", rank: 5 }));
  // the new level is offered in the row pickers (without a reload)
  const picker = app.locator(`[data-testid="cls-space-picker-${SPACE_KEY}"]`);
  await ensureInViewport(page, picker);
  await picker.locator(".mini-select-value").click();
  await expect(picker.locator(".cls-picker-opt", { has: app.locator('.cls-chip:text-is("Secret")') })).toBeVisible();
  await shot(page, "09-picker-with-secret");
  await app.locator(".cls-section-title").first().click();
  // and after a reload. enterForgeSurface picks the hosted iframe by index and has landed on the
  // wrong one after a navigation (skill trap 2026-09-20) — find the frame by its content.
  app = await openTab(page);
  await expect.poll(async () => {
    const ifr = page.locator("iframe");
    const n = await ifr.count();
    for (let i = 0; i < n; i++) {
      const f = ifr.nth(i).contentFrame();
      if ((await f.locator('[data-testid="cls-level-row-secret"]').count().catch(() => 0)) > 0) { app = f; return true; }
    }
    return false;
  }, { timeout: 60000, message: "the levels editor lists Secret after the reload" }).toBe(true);
  await expect(app.locator('[data-testid="cls-level-row-secret"]')).toBeVisible();

  // remove Secret
  await app.locator('[data-testid="cls-level-row-secret"] .cls-level-remove').click();
  await expect(app.locator(".cls-level-row")).toHaveCount(4);
  await app.locator('[data-testid="cls-levels-save"]').click();
  await expect(app.locator('[data-testid="cls-notice"]')).toHaveText("Levels saved.", { timeout: 15000 });
  expect((await getKvs(LEVELS_KEY))?.levels?.length, "KVS back to 4 levels").toBe(4);

  // duplicate name → refused with the tab's own error, no alert()
  await app.locator('[data-testid="cls-notice"]').click(); // dismiss the success notice
  await app.getByRole("button", { name: "Add level" }).click();
  const dup = app.locator(".cls-level-row").nth(4);
  await dup.locator('input[aria-label="Level name"]').fill("public");
  await app.locator('[data-testid="cls-levels-save"]').click();
  const err = app.locator('[data-testid="cls-notice"].alert-error');
  await expect(err).toBeVisible({ timeout: 15000 });
  expect((await err.innerText()).trim()).toMatch(/Duplicate level (name|id) "public"/i);
  await shot(page, "10-duplicate-refused");
  expect((await getKvs(LEVELS_KEY))?.levels?.length, "duplicate not persisted").toBe(4);
  expect(dialogs, "no native dialogs").toEqual([]);
});

// 4b. The negatives a site-admin browser session cannot manufacture: driven through the dev hook's
// classification.* actor seams with REAL accounts. Gabriela cannot edit the private SVSEC1P page
// (SV-SEC-1 fixture) and is not a site admin; a synthetic id is unresolvable and must fail closed.
const GABRIELA = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55"; // SITE admin — the "no access to SVSEC1P" negative only
const PLAIN = "712020:6c8dccca-a6b1-4c6f-903c-329094a1bac1"; // the one real non-admin account (plain-editor bed, 2026-09-20)
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const clsAs = (fn: string, actor: string, payload: Record<string, unknown>) =>
  getTestState("sentinel-vault", { what: "invoke", fn: `classification.${fn}`, actor, payload: JSON.stringify(payload) });

test("4b. authorization negatives as REAL other identities via the hook seams", async () => {
  const privateSpaceId = await spaceIdByKey("SVSEC1P");
  const priv = await createPage({ spaceId: privateSpaceId, title: `HARNESS cls-authz ${Date.now()}`, adf: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "private" }] }] } });
  const pid = String(priv.id);
  try {
    const before = await getKvs(`classification-page-${pid}`);
    const r1 = await clsAs("set-page", GABRIELA, { pageId: pid, levelId: "restricted" });
    expect(r1.result?.ok, "Gabriela cannot set a level on a page she cannot edit").not.toBe(true);
    expect(await getKvs(`classification-page-${pid}`), "nothing written by the refused call").toEqual(before ?? null);
    const r2 = await clsAs("get-page", GABRIELA, { pageId: pid });
    expect(r2.result?.ok, "Gabriela cannot read the level of a page she cannot read").not.toBe(true);
    const r3 = await clsAs("manage-levels", PLAIN, { levels: [{ id: "x", name: "X", color: "#000000", rank: 1 }] });
    expect(r3.result?.ok, "a non-site-admin cannot manage levels").not.toBe(true);
    const r4 = await clsAs("list-spaces", PLAIN, {});
    expect((r4.result?.ok === true && (r4.result?.spaces || []).length > 0), "a user with no stewardship lists no spaces").toBe(false);
    const r5 = await clsAs("set-space-default", PLAIN, { spaceId: String(privateSpaceId), levelId: "internal" });
    expect(r5.result?.ok, "a non-steward cannot set a space default").not.toBe(true);
    const r6 = await clsAs("set-page", "sv-synthetic-nobody", { pageId: pid, levelId: "restricted" });
    expect(r6.result?.ok, "an unresolvable account fails closed").not.toBe(true);
    // positive control on the SAME object: Mihai (site admin, can edit) succeeds.
    const r7 = await clsAs("set-page", MIHAI, { pageId: pid, levelId: "restricted" });
    expect(r7.result?.ok, `positive control: Mihai sets the page level (got ${JSON.stringify(r7.result)})`).toBe(true);
    await clsAs("set-page", MIHAI, { pageId: pid, levelId: null });
    console.log("### 4b authz negatives ✓ (Gabriela refused on set/get/manage/list/space-default; synthetic refused; Mihai positive control)");
  } finally {
    await deletePage(pid).catch(() => {});
  }
});
