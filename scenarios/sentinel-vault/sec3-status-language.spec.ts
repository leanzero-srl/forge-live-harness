// SEC-3 (UX critique 2026-09-19). Before the fix one page said, in one session: badge "Sealed by
// Mihai Perdum", panel "until Sep 22, 2026, 10:57 PM", modal "Sealed by you · until Tue 10:57 PM",
// ribbon "Locked · Decisions is sealed by Gabriela Perdum until Tue 23:13" (four date formatters,
// 12-h and 24-h clocks), "Restored" for the editor's undone edit, "Approved ▾ · Approved v6 · review
// due …" (the word twice in one bar), and a byline chip that never mentioned the seals. After the fix
// ONE module (src/ui/kit/status-language.js) gives every surface its words and its clock: the modal
// row, the panel row and the macro badge carry the SAME sentence ("Sealed by you · until Tue 23:13" /
// "Locked by Gabriela Perdum · until Tue 23:13"), the ribbon's pill is "Undone", "Approved" appears
// once ("Approved v1 ▾" on the state chip, the details chip drops it), and the byline title carries
// "Sealed (N)". Server half through the hook; browser half reads every surface. FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, shotRibbon, inv, getKvs, setKvs, delKvs, norm, SPACE, MIHAI, GABI } from "./_wf";
import { openDetailsModal, findDevPanel, findDevChip } from "./_door";
import { getTarget } from "../../config/targets";
// @ts-ignore
import { heading, paragraph, buildExtensionNode } from "../../data/adf.mjs";
// @ts-ignore
import { insertNode, BASE } from "../../data/confluence.mjs";

const OUT = process.env.OUT_DIR || "evidence/sec3-status-language";
const GLOBAL = "admin-settings-global";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Risks", 2), paragraph("The risks we accept."), heading("Decisions", 2), paragraph("What we decided.")];
// The ONE clock: "Tue 23:13" inside the week (24-h, no AM/PM).
const CLOCK = "[A-Z][a-z]{2} \\d{2}:\\d{2}";
const auth = "Basic " + Buffer.from(`${process.env.JIRA_ADMIN_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");
async function readByline(pageId: string): Promise<{ title: string; tooltip: string } | null> {
  const r = await fetch(`${BASE}/wiki/api/v2/pages/${pageId}/properties?key=sentinel-byline`, { headers: { Authorization: auth, Accept: "application/json" } });
  if (!r.ok) throw new Error(`property read → ${r.status}`);
  return ((await r.json()) as any).results?.[0]?.value || null;
}

async function sealBoth(P: string) {
  const hs = await call("list-page-headings", { pageId: P }, GABI);
  const risks = (hs?.headings || []).find((h: any) => h.text === "Risks");
  const sG = await call("seal-section", { pageId: P, headingIndex: risks.index, headingText: "Risks", lockDuration: 2 * 86400 }, GABI);
  expect(sG?.success, `Gabriela seals Risks (${JSON.stringify(sG).slice(0, 160)})`).toBe(true);
  const hs2 = await call("list-page-headings", { pageId: P }, MIHAI);
  const dec = (hs2?.headings || []).find((h: any) => h.text === "Decisions");
  const sM = await call("seal-section", { pageId: P, headingIndex: dec.index, headingText: "Decisions", lockDuration: 2 * 86400 }, MIHAI);
  expect(sM?.success, `Mihai seals Decisions (${JSON.stringify(sM).slice(0, 160)})`).toBe(true);
  return { risks: sG.sectionId as string, decisions: sM.sectionId as string };
}
async function approve(P: string) {
  const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
  expect(t1.result?.success).toBe(true);
  const rq = await inv("reqTransition", { pageId: P, spaceKey: SPACE, to: "approved", actor: GABI });
  expect(rq.result?.pending).toBe(true);
  const dec = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "approved", reason: "ok" });
  expect(dec.result?.success && dec.result?.transitioned).toBe(true);
}

test("SEC-3 server: the byline title carries the seal count next to the level and the state; refusals say release, never unseal", async () => {
  const bed = await setupWorkflowPage("sec3-server", { body: BODY });
  const P = bed.pageId;
  const before = await getKvs(GLOBAL);
  let ids: { risks: string; decisions: string } | null = null;
  try {
    ids = await sealBoth(P);
    await setKvs(GLOBAL, { ...(before || {}), classificationEnabled: true });
    await inv("refreshByline", { pageId: P, force: "1" });
    const b1 = await readByline(P);
    console.log("### byline on/draft:", JSON.stringify(b1));
    expect(b1?.title, "classification on, Draft, two seals → Level · State · Sealed (2)").toBe("Unclassified · Draft · Sealed (2)");
    await setKvs(GLOBAL, { ...(before || {}), classificationEnabled: false });
    await inv("refreshByline", { pageId: P, force: "1" });
    expect((await readByline(P))?.title, "classification off → State · Sealed (2)").toBe("Draft · Sealed (2)");
    await approve(P);
    // (each seal wrote a page version, so the reviewed version is whatever the page is at)
    await expect.poll(async () => (await readByline(P))?.title, { timeout: 20_000 }).toMatch(/^Approved v\d+ · Sealed \(2\)$/);
    expect((await readByline(P))?.tooltip, "the tooltip keeps the long count").toContain("2 seals on this page");
    // the release verb in a refusal (the seal is held by the approval, so the held sentence wins;
    // hand the page back first and ask a stranger to release)
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI);
    const rel = await call("unseal-section", { sectionId: ids.risks }, MIHAI); // Mihai is a steward → allowed; use a synthetic non-owner instead
    console.log("### steward release of a foreign seal:", JSON.stringify(rel).slice(0, 120));
    const relX = await call("unseal-section", { sectionId: ids.decisions }, "sv-sec3-stranger");
    console.log("### stranger release refusal:", JSON.stringify(relX));
    expect(relX?.success).toBe(false);
    expect(relX?.reason, "the refusal says release, never unseal").not.toMatch(/unseal/i);
    if (rel?.success) ids.risks = "";
  } finally {
    if (before == null) await delKvs(GLOBAL).catch(() => {}); else await setKvs(GLOBAL, before);
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    if (ids?.risks) await call("unseal-section", { sectionId: ids.risks }, GABI).catch(() => {});
    if (ids?.decisions) await call("unseal-section", { sectionId: ids.decisions }, MIHAI).catch(() => {});
    await bed.restore();
  }
});

test("SEC-3 browser: the modal row, the panel row, the macro badge and the ribbon say the same sentence with the same clock; Undone; Approved once", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("sec3-browser", { body: BODY });
  const P = bed.pageId;
  const originalNotifs = await getKvs("recent-notifications");
  let ids: { risks: string; decisions: string } | null = null;
  const shot = async (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
  try {
    const T = getTarget("sentinel-vault-realm");
    await insertNode(P, buildExtensionNode(T.appId, T.envId, "sentinel-vault-panel", { title: "Sentinel Vault" }), { message: "harness: add the panel" });
    ids = await sealBoth(P);

    // ── Mihai views: ribbon Locked on Gabriela's Risks, 24-h clock ──────────────────────────
    let r = await loadPage(page, P);
    expect(r, "ribbon renders").toBeTruthy();
    await expect(r!.frame.locator('[data-testid="ribbon-pill"]')).toContainText("Locked", { timeout: 20_000 });
    const ribbonText = norm(await r!.frame.locator('[data-testid="ribbon-status"]').innerText());
    console.log("### ribbon sentence:", ribbonText);
    const ribbonClock = ribbonText.match(new RegExp(`until (${CLOCK})`))?.[1];
    expect(ribbonClock, "the ribbon's clock is the shared format (weekday + 24-h)").toBeTruthy();
    expect(ribbonText).not.toMatch(/AM|PM/);
    await shotRibbon(page, r!.el, `${OUT}/01-ribbon-locked.png`);

    // ── the details modal: both rows, one sentence shape ─────────────────────────────────────
    const app = await openDetailsModal(page);
    const mine = app.locator('[data-testid="pd-seal-row"][data-kind="section"]', { hasText: "Decisions" });
    const theirs = app.locator('[data-testid="pd-seal-row"][data-kind="section"]', { hasText: "Risks" });
    await expect(mine).toBeVisible({ timeout: 20_000 });
    const mineText = norm(await mine.locator(".pd-m").innerText());
    const theirsText = norm(await theirs.locator(".pd-m").innerText());
    console.log("### modal rows:", mineText, "|", theirsText);
    expect(mineText).toMatch(new RegExp(`^Sealed by you · until ${CLOCK}`));
    expect(theirsText).toMatch(new RegExp(`^Locked by Gabriela Perdum · until ${CLOCK}`));
    const modalClock = theirsText.match(new RegExp(`until (${CLOCK})`))![1];
    expect(modalClock, "the modal and the ribbon show the same instant the same way").toBe(ribbonClock);
    // SEC-10: the owner's Release is the quiet style, not the danger red
    const rel = mine.locator('[data-testid="pd-primary"][data-action="release"]');
    await expect(rel).toBeVisible();
    expect(await rel.evaluate((e: any) => e.className)).toContain("quiet");
    await shot("02-modal-rows");
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(300);
    await shot("02b-modal-rows-dark");
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "light"));
    await app.locator('[data-testid="pd-close"]').click();

    // ── the panel rows say the same ──────────────────────────────────────────────────────────
    let panel = await findDevPanel(page);
    if (!panel) { await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(3000); panel = await findDevPanel(page); }
    expect(panel, "the inline panel is on the page").toBeTruthy();
    const pf = panel!;
    const rowTheirs = pf.locator('[data-testid="sv-section-row"]', { hasText: "Risks" });
    await expect(rowTheirs).toBeVisible({ timeout: 30_000 });
    const panelTheirs = norm(await rowTheirs.locator(".sv-section-row-meta").innerText());
    const rowMine = pf.locator('[data-testid="sv-section-row"]', { hasText: "Decisions" });
    const panelMine = norm(await rowMine.locator(".sv-section-row-meta").innerText());
    console.log("### panel rows:", panelMine, "|", panelTheirs);
    expect(panelTheirs).toMatch(new RegExp(`^Locked by Gabriela Perdum · until ${modalClock}`));
    expect(panelMine).toMatch(new RegExp(`^Sealed by you · until ${CLOCK}`));
    // SEC-10 on the panel: Release on your own seal is not the red button
    const relP = rowMine.locator('[data-primary="release"]');
    await expect(relP).toBeVisible();
    expect(await relP.evaluate((e: any) => e.className), "quiet 'release' class, not the danger 'unlock'").toMatch(/\brelease\b/);
    expect(await relP.evaluate((e: any) => e.className)).not.toMatch(/\bunlock\b/);
    const bg = await relP.evaluate((e: any) => getComputedStyle(e).backgroundColor);
    console.log("### own Release background:", bg);
    expect(bg, "not the danger red").not.toMatch(/rgb\((2[0-2]\d|18\d|19\d), (2\d|3\d|4\d), (2\d|3\d|4\d)\)/);
    const el = await page.locator(`iframe[src*="17516615"]`).filter({ has: page.locator(".sv-panel-container") }).first().elementHandle().catch(() => null);
    if (el) await el.scrollIntoViewIfNeeded().catch(() => {});
    await shot("03-panel-rows");

    // ── the macro badges say the same ────────────────────────────────────────────────────────
    const badges: string[] = [];
    await expect.poll(async () => {
      badges.length = 0;
      for (const fr of page.frames()) {
        if (!fr.url().includes("17516615")) continue;
        const b = fr.locator('[data-testid="sec-view-badge"]');
        if ((await b.count().catch(() => 0)) > 0) badges.push(norm(await b.first().innerText().catch(() => "")));
      }
      return badges.filter((b) => /until/.test(b)).length;
    }, { timeout: 60_000, message: "both macro badges have their status" }).toBe(2);
    console.log("### badges:", JSON.stringify(badges));
    expect(badges.some((b) => new RegExp(`^Locked by Gabriela Perdum · until ${modalClock}`).test(b)), "Gabriela's badge = the modal's sentence").toBe(true);
    expect(badges.some((b) => new RegExp(`^Sealed by you · until ${CLOCK}`).test(b)), "my badge says Sealed by you").toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    for (const fr of page.frames()) { if (fr.url().includes("17516615") && (await fr.locator('[data-testid="sec-view-badge"]').count().catch(() => 0)) > 0) { const fe = await fr.frameElement().catch(() => null); if (fe) { await fe.scrollIntoViewIfNeeded().catch(() => {}); break; } } }
    await shot("04-macro-badges");

    // ── the byline chip carries the count ────────────────────────────────────────────────────
    const chip = await findDevChip(page);
    const chipText = norm(await chip.innerText());
    console.log("### chip:", chipText);
    expect(chipText).toMatch(/Sealed \(2\)/);

    // ── "Undone", not "Restored" ─────────────────────────────────────────────────────────────
    await setKvs("recent-notifications", { events: [{ id: `sec3-${Date.now()}`, type: "section-reverted", pageId: P, attachmentName: "Risks", ownerAccountId: GABI, editorAccountId: MIHAI, revertedVersion: 2, timestamp: new Date().toISOString() }] });
    r = await loadPage(page, P);
    await expect(r!.frame.locator('[data-testid="ribbon-pill"]')).toHaveText(/Undone/, { timeout: 20_000 });
    await shotRibbon(page, r!.el, `${OUT}/05-ribbon-undone.png`);
    if (originalNotifs) await setKvs("recent-notifications", originalNotifs); else await delKvs("recent-notifications").catch(() => {});

    // ── Approved once per bar ────────────────────────────────────────────────────────────────
    await approve(P);
    r = await loadPage(page, P);
    const bar = norm(await r!.frame.locator('[data-testid="ribbon-bar"]').innerText());
    console.log("### approved bar:", bar);
    const approvedCount = (bar.match(/\bApproved\b/g) || []).length;
    expect(approvedCount, "the word Approved appears exactly once in the bar").toBe(1);
    await expect(r!.frame.locator('[data-testid="wf-state-chip-label"]')).toHaveText(/^Approved v\d+$/);
    await shotRibbon(page, r!.el, `${OUT}/06-ribbon-approved-once.png`);
    await r!.frame.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(300);
    await shotRibbon(page, r!.el, `${OUT}/06b-ribbon-approved-once-dark.png`);
  } finally {
    if (originalNotifs) await setKvs("recent-notifications", originalNotifs).catch(() => {}); else await delKvs("recent-notifications").catch(() => {});
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    if (ids?.risks) await call("unseal-section", { sectionId: ids.risks }, GABI).catch(() => {});
    if (ids?.decisions) await call("unseal-section", { sectionId: ids.decisions }, MIHAI).catch(() => {});
    await bed.restore();
  }
});
