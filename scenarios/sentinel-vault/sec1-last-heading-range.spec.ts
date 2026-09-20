// SEC-1 (UX critique 2026-09-19): sealing the LAST heading swallowed everything below it — including
// the app's own inline-panel macro — because computeSectionRange ran "to the next heading of the same
// or higher level" and, for the last heading, that is the end of the page. Consequences seen live:
// the panel vanished for the rest of the session, the sealed body never rendered (nested Forge macro
// inside the ADF-renderer iframe), and the undone notice sent collaborators to a panel that no longer
// existed. This spec FAILS before the fix (the panel extension ends up INSIDE the sealed wrapper) and
// PASSES after (the range stops at the first top-level Sentinel Vault macro; the picker says where the
// range ends). Disposable page, real actor (Mihai), everything restored in finally.
import { test, expect } from "../../fixtures/forge";
import type { Frame, Page } from "@playwright/test";
import { BASE_URL } from "../../config/env";
import { getTestState } from "../../testhook/client";
import { findDevPanel } from "./_door";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
import { mkdirSync } from "node:fs";

const SPACE = "WFH";
const DEV = "17516615";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const OUT = process.env.OUT_DIR || "evidence/sec1-last-heading";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const isSealedWrap = (n: any) => n.type === "bodiedExtension" && /sentinel-vault-sealed-section/.test(String(n.attrs?.extensionKey || ""));
const isPanel = (n: any) => /extension/i.test(n.type) && /sentinel-vault-panel/.test(String(n.attrs?.extensionKey || ""));

test.describe.configure({ timeout: 600_000 });

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
async function panelFrame(page: Page, timeoutMs = 120_000): Promise<any> {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const panel = await findDevPanel(page);
    if (panel && (await panel.locator(".sv-section-seals").count().catch(() => 0)) > 0) return panel;
    await page.waitForTimeout(1000);
  }
  return null;
}

test("SEC-1: sealing the last heading stops before the Sentinel Vault panel and the picker says so", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const spaceId = await spaceIdByKey(SPACE);
  const created = await createPage({
    spaceId, title: `HARNESS sec1-last-heading ${Date.now()}`,
    adf: doc(
      paragraph("Intro paragraph above every heading."),
      heading("Scope", 2), paragraph("Scope body."),
      heading("Last", 2), paragraph("Last body — the only paragraph under the last heading."),
    ),
  });
  const P = String(created.id);
  let sectionId: string | null = null;
  try {
    const ep = await inv("ensurePanel", { pageId: P });
    expect(ep.result?.success !== false, `panel inserted (${JSON.stringify(ep.result).slice(0, 120)})`).toBe(true);
    const before = await readPage(P);
    const topBefore = (before.adf.content || []).map((n: any) => n.type + (n.attrs?.extensionKey ? `:${String(n.attrs.extensionKey).split("/").pop()}` : ""));
    console.log("### top-level before:", topBefore.join(" | "));
    expect((before.adf.content || []).some(isPanel), "control: the panel sits at the top level before sealing").toBe(true);

    // 1. The picker (list-page-headings) tells the user where each range ends.
    const lh = await inv("listPageHeadings", { pageId: P, actor: MIHAI });
    const hs = lh.result?.headings || [];
    const scope = hs.find((h: any) => h.text === "Scope");
    const last = hs.find((h: any) => h.text === "Last");
    console.log("### headings:", JSON.stringify(hs));
    expect(scope && last, "both headings are listed").toBeTruthy();
    expect.soft(scope.stopsAt?.kind, "Scope's range ends at the next heading").toBe("heading");
    expect.soft(scope.stopsAt?.text, "…named").toBe("Last");
    expect.soft(scope.blocks, "Scope = 1 block after the heading").toBe(1);
    expect.soft(last.stopsAt?.kind, "Last's range ends BEFORE the Sentinel Vault panel, not at the end of the page").toBe("sentinel-vault");
    expect.soft(last.stopsAt?.what, "…and names the panel").toBe("panel");
    expect.soft(last.blocks, "Last = 1 block after the heading (the panel is not counted)").toBe(1);

    // 2. Seal "Last": the panel must stay at the top level, outside the wrapper.
    const sr = await inv("sealSection", { pageId: P, hi: String(last.index), htext: "Last", actor: MIHAI });
    expect(sr.result?.success, `seal-section succeeds (got: ${sr.result?.reason})`).toBe(true);
    sectionId = sr.result?.sectionId;
    const after = await readPage(P);
    const top = after.adf.content || [];
    const topAfter = top.map((n: any) => n.type + (n.attrs?.extensionKey ? `:${String(n.attrs.extensionKey).split("/").pop()}` : ""));
    console.log("### top-level after:", topAfter.join(" | "));
    const wrap = top.find(isSealedWrap);
    expect(wrap, "a sealed wrapper exists at the top level").toBeTruthy();
    const wrapBody = wrap.content || [];
    expect(wrapBody.some(isPanel), "the sealed body does NOT contain the panel macro").toBe(false);
    expect(wrapBody.some((n: any) => /extension/i.test(n.type)), "the sealed body contains no extension at all").toBe(false);
    expect(wrapBody.length, "the sealed body is heading + 1 paragraph").toBe(2);
    expect(top.some(isPanel), "the panel is still on the page at the top level").toBe(true);
    expect(top.findIndex(isPanel), "…after the sealed section").toBeGreaterThan(top.findIndex(isSealedWrap));

    // 3. Browser: the panel is still usable, the section renders, the picker shows the range.
    await page.goto(`${BASE_URL}/wiki/spaces/${SPACE}/pages/${P}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const panel = await panelFrame(page);
    expect(panel, "the inline panel is still on the page after sealing the last heading").toBeTruthy();
    const grp = panel.locator(".sv-section-seals");
    await grp.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/01-panel-still-present.png` });
    const rows = grp.locator('[data-testid="sv-section-row"]');
    await expect.poll(async () => norm(await rows.first().innerText().catch(() => "")), { timeout: 60_000 }).toContain("Last");
    await grp.getByRole("button", { name: /Seal a section/ }).click();
    const pick = grp.locator(".sv-section-pick-row", { hasText: "Scope" });
    await pick.waitFor({ timeout: 30_000 });
    await grp.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/02-picker-range-preview.png` });
    const pickText = norm(await pick.innerText());
    console.log("### picker row:", pickText);
    // "Last" is sealed by now, so Scope's range ends at that sealed section — and the row must say so.
    expect(pickText, "the picker row says what the seal will cover").toMatch(/Seals heading \+ 1 block · ends before a sealed section/);
    const sealedFrame = await waitFrame(page, ".sec-frame:not(.sec-loading)", 90_000);
    expect(sealedFrame, "the sealed-section macro renders").toBeTruthy();
    await expect.poll(async () => norm(await sealedFrame!.locator('[data-testid="sec-view-badge"]').innerText().catch(() => "")), { timeout: 60_000 }).toMatch(/Sealed by (you|Mihai Perdum)/); // SEC-3 (2026-09-20): the owner reads "Sealed by you"
    await expect.poll(async () => norm(await sealedFrame!.locator(".sec-frame").innerText().catch(() => "")), { timeout: 60_000 }).not.toMatch(/could not be displayed|Loading the section/);
    // The section sits above the panel: scroll the OUTER page to the top (an inner-iframe scroll
    // never moves the host document) before the shot.
    const host = await sealedFrame!.frameElement();
    await host.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/03-sealed-section-renders.png` });
  } finally {
    if (sectionId) {
      await inv("unsealSection", { section: sectionId, actor: MIHAI }).catch(() => {});
      for (const k of [`section-protection-${sectionId}`, `section-snapshot-${sectionId}`]) await delKvs(k).catch(() => {});
      const keys = (await getTestState("sentinel-vault", { what: "query", prefix: "space-section-protection-" })).keys || [];
      for (const k of keys) if (k.endsWith(sectionId)) await delKvs(k).catch(() => {});
    }
    await deletePage(P).catch(() => {});
  }
});
