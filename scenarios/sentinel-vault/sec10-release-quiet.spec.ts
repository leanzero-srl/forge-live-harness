// SEC-10 (UX critique 2026-09-19). Before the fix the only primary on your own seal's panel row was
// "Release" in the red danger style (`action-btn unlock`) and `seal-row.js` marked `release` as a
// danger menu item — releasing your own 3-day seal is routine, not destructive; "Force release…"
// (someone else's seal, typed reason) is the dangerous one. After the fix your own Release is the
// quiet secondary style on the panel, the overlay and the modal, the ⋯ "Release" item is plain, and
// only Force release (and the deletes) keep the danger red. FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, inv, norm, MIHAI, GABI } from "./_wf";
import { openDetailsModal, findDevPanel } from "./_door";
import { getTarget } from "../../config/targets";
// @ts-ignore
import { heading, paragraph, buildExtensionNode } from "../../data/adf.mjs";
// @ts-ignore
import { insertNode } from "../../data/confluence.mjs";

const OUT = process.env.OUT_DIR || "evidence/sec10-release-quiet";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Risks", 2), paragraph("The risks we accept."), heading("Decisions", 2), paragraph("What we decided.")];
const DANGER_RED = /rgb\((2[0-2]\d|1[89]\d), (2\d|3\d|4\d), (2\d|3\d|4\d)\)/; // the app's danger tokens (#DC2626 / #B91C1C family)

test("SEC-10 browser: Release on your own seal is the quiet style on the panel and the modal; only Force release is red", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("sec10-browser", { body: BODY });
  const P = bed.pageId;
  let mine: string | null = null;
  let theirs: string | null = null;
  const shot = async (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
  try {
    const T = getTarget("sentinel-vault-realm");
    await insertNode(P, buildExtensionNode(T.appId, T.envId, "sentinel-vault-panel", { title: "Sentinel Vault" }), { message: "harness: add the panel" });
    const hs = await call("list-page-headings", { pageId: P });
    const dec = (hs?.headings || []).find((h: any) => h.text === "Decisions");
    const sM = await call("seal-section", { pageId: P, headingIndex: dec.index, headingText: "Decisions", lockDuration: 2 * 86400 }, MIHAI);
    expect(sM?.success).toBe(true);
    mine = sM.sectionId;
    const hs2 = await call("list-page-headings", { pageId: P }, GABI);
    const risks = (hs2?.headings || []).find((h: any) => h.text === "Risks");
    const sG = await call("seal-section", { pageId: P, headingIndex: risks.index, headingText: "Risks", lockDuration: 2 * 86400 }, GABI);
    expect(sG?.success).toBe(true);
    theirs = sG.sectionId;

    await loadPage(page, P);
    // ── the panel ────────────────────────────────────────────────────────────────────────────
    let panel = await findDevPanel(page);
    if (!panel) { await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(3000); panel = await findDevPanel(page); }
    expect(panel, "the inline panel is on the page").toBeTruthy();
    const pf = panel!;
    const rowMine = pf.locator('[data-testid="sv-section-row"]', { hasText: "Decisions" });
    await expect(rowMine).toBeVisible({ timeout: 30_000 });
    const rel = rowMine.locator('[data-primary="release"]');
    await expect(rel, "my own seal's primary is Release").toBeVisible();
    const cls = await rel.evaluate((e: any) => e.className);
    const bg = await rel.evaluate((e: any) => getComputedStyle(e).backgroundColor);
    console.log("### own Release:", cls, bg);
    expect(cls).toMatch(/\brelease\b/);
    expect(cls).not.toMatch(/\bunlock\b/);
    expect(bg, "not the danger red").not.toMatch(DANGER_RED);
    // Force release on Gabriela's seal (Mihai is a space admin) stays the danger style under ⋯
    // Two rows mention "Risks" (the other row's range/meta text names it) — match the TITLE cell.
    const rowTheirs = pf.locator('[data-testid="sv-section-row"]', { has: pf.locator(".sv-section-row-title", { hasText: /^Risks$/ }) });
    await rowTheirs.locator('[data-testid="sv-section-kebab"]').click();
    const force = pf.locator('[role="menuitem"]', { hasText: "Force release" });
    await expect(force, "the space admin's Force release is offered").toBeVisible();
    expect(await force.evaluate((e: any) => e.className), "…as a danger item").toMatch(/\bdanger\b/);
    const el = await page.locator(`iframe[src*="17516615"]`).filter({ has: page.locator(".sv-panel-container") }).first().elementHandle().catch(() => null);
    if (el) await el.scrollIntoViewIfNeeded().catch(() => {});
    await shot("01-panel-release-quiet-force-danger");
    await page.keyboard.press("Escape");
    await pf.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(300);
    await shot("01b-panel-dark");
    await pf.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "light"));

    // ── the modal: Release quiet, Force release red ──────────────────────────────────────────
    await page.evaluate(() => window.scrollTo(0, 0));
    const app = await openDetailsModal(page);
    const mrow = app.locator('[data-testid="pd-seal-row"][data-kind="section"]', { hasText: "Decisions" });
    const mrel = mrow.locator('[data-testid="pd-primary"][data-action="release"]');
    await expect(mrel).toBeVisible({ timeout: 20_000 });
    expect(await mrel.evaluate((e: any) => e.className)).toContain("quiet");
    expect(await mrel.evaluate((e: any) => getComputedStyle(e).backgroundColor)).not.toMatch(DANGER_RED);
    const trow = app.locator('[data-testid="pd-seal-row"][data-kind="section"]', { hasText: "Risks" });
    await trow.locator('[data-testid="pd-kebab"]').click();
    const mforce = app.locator('[data-testid="pd-menu-force-release"]');
    await expect(mforce).toBeVisible();
    expect(await mforce.evaluate((e: any) => e.className)).toMatch(/\bdanger\b/);
    await shot("02-modal-release-quiet-force-danger");
    await app.locator('[data-testid="pd-title"]').click();
  } finally {
    if (theirs) await call("unseal-section", { sectionId: theirs }, GABI).catch(() => {});
    if (mine) await call("unseal-section", { sectionId: mine }, MIHAI).catch(() => {});
    await bed.restore();
  }
});
