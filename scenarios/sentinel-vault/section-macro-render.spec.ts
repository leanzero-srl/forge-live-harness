// Sentinel Vault — the Sealed Section macro SURFACE as the reader actually sees it (dev env 17516615).
//
// 2026-09-14 the owner saw the macro as a BLACK BLOCK in Blisk (Chromium ~137, dark host) and
// off-centre in view mode. Diagnosis: the body is a NESTED ADF-renderer iframe; when its colour
// scheme differs from the app document's, Chromium paints the embedded canvas opaque near-black;
// the dark palette was #020617 on a #1F1F21 surface; the body sat 2px from the frame edge while
// the badge sat at 12px; and a renderer that never answers `forge-adf-renderer-ready` left a
// blank box. This spec pins the fix: (a) light bg not black, (b) dark bg host-aligned, (c) body
// inset ≥ 10px, (d) the macro box centred in the column, (e) the editor lock banner (owner line
// live; the non-owner banner through the surface's stub seam).
import { test, expect } from "../../fixtures/forge";
import type { Frame, Page } from "@playwright/test";
import { BASE_URL } from "../../config/env";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const DEV = process.env.SENTINEL_ENV_ID?.slice(0, 8) || "17516615";
const ACTOR = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086"; // Mihai — the harness browser identity
const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

let PAGE = "";
let SECTION: string | null = null;

test.describe.configure({ timeout: 240_000 });

test.beforeAll(async () => {
  const spaceId = await spaceIdByKey(SPACE);
  const created = await createPage({
    spaceId, title: `HARNESS sv-macro-render ${Date.now()}`,
    adf: doc(paragraph("COLUMN REFERENCE PARAGRAPH above the sealed section"), heading("SECTION ALPHA", 2), paragraph("alpha body content"), paragraph("footer paragraph")),
  });
  PAGE = String(created.id);
  const lh = await inv("listPageHeadings", { pageId: PAGE, actor: ACTOR });
  const alpha = (lh.result?.headings || []).find((h: any) => h.text === "SECTION ALPHA");
  if (!alpha) throw new Error("ALPHA heading not listed");
  const sr = await inv("sealSection", { pageId: PAGE, hi: String(alpha.index), htext: "SECTION ALPHA", actor: ACTOR });
  if (!sr.result?.success) throw new Error(`seal-section failed: ${sr.result?.reason}`);
  SECTION = sr.result.sectionId;
});
test.afterAll(async () => {
  if (SECTION) { await delKvs(`section-protection-${SECTION}`).catch(() => {}); await delKvs(`section-snapshot-${SECTION}`).catch(() => {}); }
  if (PAGE) await deletePage(PAGE).catch(() => {});
});

const rgb = (s: string) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 4).map(Number);
const isTransparent = (s: string) => /rgba\(\s*0,\s*0,\s*0,\s*0\)|transparent/.test(s);

// The app frame is the Custom UI iframe (dev env id in its URL) whose document carries `.sec-frame`.
async function findAppFrame(page: Page, timeoutMs = 90_000): Promise<{ frame: Frame; el: any }> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const fr of page.frames()) {
      if (!fr.url().includes(DEV)) continue;
      if ((await fr.locator(".sec-frame:not(.sec-loading)").count().catch(() => 0)) > 0) {
        const el = await fr.frameElement();
        return { frame: fr, el };
      }
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("section-setup app frame (.sec-frame) not found");
}

test("view: light not black, dark host-aligned, body inset, box centred", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (m) => { if (/SECTION-UI/.test(m.text())) logs.push(m.text()); });
  await page.goto(`${BASE_URL}/wiki/spaces/${SPACE}/pages/${PAGE}`, { waitUntil: "domcontentloaded" });
  await page.locator("#content, [data-testid='page-content'], .ak-renderer-document").first().waitFor({ timeout: 60_000 });
  const { frame, el } = await findAppFrame(page);
  await page.waitForTimeout(1500);

  // (a) light: the frame background is a real colour, not black, not transparent
  const lightBg = await frame.locator(".sec-frame").evaluate((e) => getComputedStyle(e).backgroundColor);
  const mode = await frame.evaluate(() => document.documentElement.getAttribute("data-color-mode"));
  const scheme = await frame.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  console.log(`### (a) host mode=${mode} color-scheme=${scheme} .sec-frame bg=${lightBg}`);
  if (mode !== "dark") {
    expect(isTransparent(lightBg), "light frame bg is not transparent").toBe(false);
    const [r, g, b] = rgb(lightBg);
    expect(Math.min(r, g, b), "light frame bg is not black").toBeGreaterThan(200);
    expect(scheme, "app document color-scheme follows the light host").toBe("light");
  }

  // Handshake: the body iframe is put in flow only once the renderer answered ready.
  const bodyFrame = frame.locator(".sec-body-frame");
  let ready = false;
  try { await frame.locator('.sec-body-frame[data-ready="true"]').waitFor({ timeout: 20_000 }); ready = true; } catch (_) { ready = false; }
  const fallbackVisible = await frame.locator(".sec-body-fallback").isVisible().catch(() => false);
  console.log(`### renderer ready=${ready} fallbackVisible=${fallbackVisible}`);
  expect(ready || fallbackVisible, "either the renderer body is in flow or the explanation text is visible — never a blank box").toBe(true);

  // (c) the body iframe's left edge sits ≥ 10px inside the frame (aligned with the 12px badge inset)
  if (ready) {
    const fr = await frame.locator(".sec-frame").boundingBox();
    const bb = await bodyFrame.boundingBox();
    const bodyBg = await bodyFrame.evaluate((e) => getComputedStyle(e).backgroundColor);
    console.log(`### (c) frame.left=${fr?.x} body.left=${bb?.x} inset=${(bb?.x ?? 0) - (fr?.x ?? 0)} body bg=${bodyBg} h=${bb?.height}`);
    expect((bb?.x ?? 0) - (fr?.x ?? 0), "body frame inset from the frame's left edge").toBeGreaterThanOrEqual(10);
    expect(isTransparent(bodyBg), "body frame has an explicit background").toBe(false);
    const minHeight = await bodyFrame.evaluate((e) => getComputedStyle(e).minHeight);
    expect(minHeight === "0px" || minHeight === "auto", `no min-height dead space (got ${minHeight})`).toBe(true);
  } else {
    console.log("### (c) SKIPPED: renderer never answered in this browser; fallback text shown instead");
  }

  // (d) the macro iframe box is horizontally centred in the content column (the paragraph above is the reference)
  const refPara = page.locator(".ak-renderer-document p, #content p").filter({ hasText: "COLUMN REFERENCE PARAGRAPH" }).first();
  const ref = await refPara.boundingBox();
  const box = await el.boundingBox();
  const leftGap = (box?.x ?? 0) - (ref?.x ?? 0);
  const rightGap = ((ref?.x ?? 0) + (ref?.width ?? 0)) - ((box?.x ?? 0) + (box?.width ?? 0));
  console.log(`### (d) ref=[${ref?.x},${ref?.width}] macro=[${box?.x},${box?.width}] leftGap=${leftGap} rightGap=${rightGap}`);
  expect(Math.abs(leftGap - rightGap), "macro iframe centred in the column").toBeLessThanOrEqual(4);
  await page.screenshot({ path: "test-results/section-macro-render-light.png" });

  // (b) dark: flip the host AND the app document; the palette must land on the Confluence dark surface
  await page.evaluate(() => { document.documentElement.dataset.colorMode = "dark"; });
  await frame.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "dark"); });
  await page.waitForTimeout(500);
  const darkBg = await frame.locator(".sec-frame").evaluate((e) => getComputedStyle(e).backgroundColor);
  const darkScheme = await frame.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
  const bodyDark = ready ? await bodyFrame.evaluate((e) => getComputedStyle(e).backgroundColor) : "n/a";
  console.log(`### (b) dark .sec-frame bg=${darkBg} color-scheme=${darkScheme} body bg=${bodyDark}`);
  const [dr, dg, db] = rgb(darkBg);
  expect(darkScheme, "app document color-scheme follows the dark host").toBe("dark");
  expect(isTransparent(darkBg), "dark frame bg is not transparent").toBe(false);
  // #1F1F21 = rgb(31,31,33); accept the native --ds-surface dark (#1D2125 = 29,33,37) too; refuse #020617 (2,6,23) and #000
  expect(Math.min(dr, dg, db), "dark frame bg is NOT #020617/#000 (a black box)").toBeGreaterThanOrEqual(24);
  expect(Math.max(dr, dg, db), "dark frame bg is the Confluence dark surface, not a light colour").toBeLessThanOrEqual(48);
  if (ready) expect(bodyDark, "body iframe background follows the dark palette").toBe(darkBg);
  await page.screenshot({ path: "test-results/section-macro-render-dark.png" });
  console.log("### SECTION-UI console:\n" + logs.join("\n"));
});

// In the editor a BODIED Custom UI macro is rendered NATIVELY by ProseMirror (title chrome +
// editable body): the app iframe is never mounted in edit mode (confirmed 2026-09-14 from the
// editor a11y snapshot). The one app surface the editor shows is the node's Edit dialog (the
// config resource), which mounts this same surface with isEditing=true — with a body present
// it renders in view mode — so that is where the lock notice lives and what this test opens.
async function openConfigDialog(page: Page): Promise<Frame> {
  const node = page.locator('.ProseMirror [data-testid*="extension"], .ProseMirror .extension-container, .ProseMirror').locator("text=Sentinel Vault Sealed Section").first();
  await node.waitFor({ timeout: 60_000 });
  await node.click();
  await page.waitForTimeout(1200);
  const toolbar = page.getByRole("toolbar", { name: "Floating Toolbar" });
  await toolbar.waitFor({ timeout: 15_000 });
  const editBtn = toolbar.getByRole("button", { name: "Edit", exact: true });
  if (await editBtn.count()) { await editBtn.click(); } else {
    const labels = await toolbar.locator("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || e.textContent));
    throw new Error("no Edit button on the node toolbar; buttons: " + JSON.stringify(labels));
  }
  // The dialog mounts the SAME surface; with a body present it renders in view mode with
  // isEditing=true, so match either root by its data-editing attribute, in any frame.
  const t0 = Date.now();
  while (Date.now() - t0 < 90_000) {
    for (const fr of page.frames()) {
      if ((await fr.locator('.sec-frame[data-editing="true"], .sec-config[data-editing="true"]').count().catch(() => 0)) > 0) {
        console.log("### config dialog frame:", fr.url().slice(0, 140));
        return fr;
      }
    }
    await page.waitForTimeout(1000);
  }
  throw new Error("config dialog frame (editing surface) not found");
}

test("editor: the owner sees 'You can edit this section'; a stubbed non-owner sees the lock banner", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (m) => { if (/SECTION-UI/.test(m.text())) logs.push(m.text()); });
  await page.goto(`${BASE_URL}/wiki/pages/resumedraft.action?draftId=${PAGE}`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="ak-editor-main-toolbar"], .ProseMirror').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  // the app iframe is NOT mounted for a bodied macro in edit mode — record that fact
  const mounted = page.frames().some((f) => f.url().includes(DEV) && /section-setup/.test(f.url()));
  console.log(`### (e) app frame mounted inline in the editor: ${mounted}`);
  const cfg = await openConfigDialog(page);
  await expect(cfg.locator(".sec-editable"), "owner line rendered in the config dialog").toContainText("You can edit this section", { timeout: 30_000 });
  expect(await cfg.locator(".sec-lock").count(), "no lock banner for the owner").toBe(0);
  const editing = await cfg.locator('[data-editing]').first().getAttribute("data-editing");
  console.log(`### (e) owner: data-editing=${editing}; ${logs.join(" | ")}`);
  expect(editing, "the surface knows it is in the editor").toBe("true");
  if (await cfg.locator("button.sec-btn").count()) await expect(cfg.locator("button.sec-btn"), "existing node: the button is Done, not Insert").toHaveText("Done");
  await page.screenshot({ path: "test-results/section-macro-render-editor-owner.png" });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  // Non-owner branch through the surface's stub seam (only one real browser identity exists here).
  await page.addInitScript(() => {
    (window as any).__svSectionStatusStub = { sealed: true, isMine: false, hasGrant: false, ownerName: "Harness Owner", ownerAccountId: "557058:harness-dummy-owner", expiresAt: "2030-01-15T00:00:00.000Z", isExpired: false };
  });
  await page.goto(`${BASE_URL}/wiki/pages/resumedraft.action?draftId=${PAGE}`, { waitUntil: "domcontentloaded" });
  await page.locator('[data-testid="ak-editor-main-toolbar"], .ProseMirror').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2000);
  const cfg2 = await openConfigDialog(page);
  const lock = cfg2.locator(".sec-lock");
  await expect(lock, "lock banner for a non-owner without a grant").toBeVisible({ timeout: 30_000 });
  const text = await lock.innerText();
  console.log(`### (e) stubbed non-owner banner: ${text.replace(/\s+/g, " ")}`);
  expect(text).toContain("Locked by Harness Owner");
  expect(text).toMatch(/until .*2030/);
  expect(text).toContain("edits you publish here are reverted automatically");
  expect(text).toContain("Ask to edit from the Sentinel Vault panel");
  const bg = await lock.evaluate((e) => getComputedStyle(e).backgroundColor);
  const borderLeft = await lock.evaluate((e) => getComputedStyle(e).borderLeftWidth);
  console.log(`### (e) banner bg=${bg} border-left=${borderLeft}`);
  expect(bg, "banner is a solid saturated fill").toBe("rgb(201, 55, 44)");
  expect(borderLeft, "no left accent rail").toBe("0px");
  expect(await cfg2.locator(".sec-editable").count(), "no owner line for the non-owner").toBe(0);
  await page.screenshot({ path: "test-results/section-macro-render-editor-locked.png" });
  await page.keyboard.press("Escape");
  // leave the draft without publishing
  await page.goto(`${BASE_URL}/wiki/spaces/${SPACE}/pages/${PAGE}`, { waitUntil: "domcontentloaded" }).catch(() => {});
});
