// SEC-7 (UX critique 2026-09-19). Before the fix a section was sealed for the space default with no
// duration, no note and no way to extend: there was no `extend-section` resolver (the hook answers
// "unknown resolver key"), the ⋯ menu had no Extend for sections, and the refusal on a lapsed seal
// named a button that did not exist. After the fix: seal-section takes `lockDuration` + `note`,
// `extend-section` mirrors extend-seal (owner or space admin; a live seal extends from its expiry, a
// lapsed one from now; every edit grant is carried forward; the enforce baseline is NOT touched),
// the owner's row says "expires in N days" in amber inside the last three days, and the panel's
// picker asks "Holds for" before sealing. Server half through the hook; browser half on the panel
// and the details modal. FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, inv, getKvs, setKvs, norm, strip, SPACE, MIHAI, GABI } from "./_wf";
import { openDetailsModal, findDevPanel } from "./_door";
import { getTarget } from "../../config/targets";
// @ts-ignore
import { heading, paragraph, buildExtensionNode } from "../../data/adf.mjs";
// @ts-ignore
import { insertNode } from "../../data/confluence.mjs";

const OUT = process.env.OUT_DIR || "evidence/sec7-section-extend";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Risks", 2), paragraph("The risks we accept."), heading("Decisions", 2), paragraph("What we decided.")];

test("SEC-7 server: seal with a duration and a note, extend with the grants carried forward, the lapsed refusal names Extend", async () => {
  const bed = await setupWorkflowPage("sec7-server", { body: BODY });
  const P = bed.pageId;
  const sealed: string[] = [];
  try {
    const hs = await call("list-page-headings", { pageId: P });
    const risks = (hs?.headings || []).find((h: any) => h.text === "Risks");
    expect(risks, "the Risks heading is listed").toBeTruthy();
    // ── seal for ONE hour with a note (not the 3-day default) ───────────────────────────────
    const t0 = Date.now();
    const s = await call("seal-section", { pageId: P, headingIndex: risks.index, headingText: "Risks", lockDuration: 3600, note: "freeze until the review" });
    expect(s?.success, `seal (${JSON.stringify(s).slice(0, 160)})`).toBe(true);
    sealed.push(s.sectionId);
    const rec0 = await getKvs(`section-protection-${s.sectionId}`);
    console.log("### sealed record:", JSON.stringify({ expiresAt: rec0.expiresAt, lockDuration: rec0.lockDuration, note: rec0.note }));
    expect(rec0.lockDuration, "the chosen hold, not the space default").toBe(3600);
    expect(Math.abs(new Date(rec0.expiresAt).getTime() - (t0 + 3600_000)), "expires in about an hour").toBeLessThan(60_000);
    expect(rec0.note, "the note is kept on the record").toBe("freeze until the review");
    const en = await call("enumerate-section-seals", { pageId: P });
    expect(en?.sections?.[0]?.note, "…and answered to the rows").toBe("freeze until the review");

    // ── a grant to Gabriela inherits the seal's expiry ───────────────────────────────────────
    const g = await call("grant-section-edit", { sectionId: s.sectionId, editorAccountId: GABI });
    expect(g?.success, `grant (${JSON.stringify(g).slice(0, 160)})`).toBe(true);
    const grant0 = await getKvs(`section-edit-grant-${s.sectionId}-${GABI}`);
    expect(grant0?.expiresAt).toBe(rec0.expiresAt);

    // ── extend by a day: anchored on the current expiry, the grant moves with it ─────────────
    const wfBefore = await getKvs(`workflow-state-${P}`);
    const x = await call("extend-section", { sectionId: s.sectionId, additionalSeconds: 86400 });
    console.log("### extend:", JSON.stringify(x));
    expect(x?.success, "extend-section exists and works for the owner").toBe(true);
    const rec1 = await getKvs(`section-protection-${s.sectionId}`);
    expect(new Date(rec1.expiresAt).getTime(), "new expiry = old expiry + 1 day").toBe(new Date(rec0.expiresAt).getTime() + 86400_000);
    expect(rec1.extensionCount).toBe(1);
    expect(rec1.contentHash, "the snapshot / hash is untouched").toBe(rec0.contentHash);
    const grant1 = await getKvs(`section-edit-grant-${s.sectionId}-${GABI}`);
    expect(grant1?.expiresAt, "the grant was carried forward").toBe(rec1.expiresAt);
    expect((await getKvs(`workflow-state-${P}`))?.approvedVersion ?? null, "no re-baseline").toBe(wfBefore?.approvedVersion ?? null);
    const idx = await getKvs(`space-section-protection-${rec1.spaceId}-${s.sectionId}`);
    expect(idx?.expiresAt, "the space index row follows").toBe(rec1.expiresAt);
    const act = await call("get-page-activity", { pageId: P, limit: 5 });
    expect((act?.entries || []).some((e: any) => e.type === "section.extended"), "an activity entry names the extension").toBe(true);

    // ── Gabriela (not the owner, not a steward of… well, every real account is a steward) ────
    // The authz negative needs a non-steward — synthetic ids are refused by the hook's gates, so the
    // owner/steward arm is proven and the refusal copy is exercised on the LAPSED path below.

    // ── a lapsed seal: the grant refusal names the action that now exists; extend re-arms it ──
    await setKvs(`section-protection-${s.sectionId}`, { ...rec1, expiresAt: new Date(Date.now() - 60_000).toISOString() });
    const gl = await call("grant-section-edit", { sectionId: s.sectionId, editorAccountId: GABI });
    console.log("### lapsed grant:", JSON.stringify(gl));
    expect(gl?.success).toBe(false);
    expect(gl?.reason, "the refusal points at the ⋯ Extend").toMatch(/extend it first \(⋯ → Extend the seal\)/);
    const t1 = Date.now();
    const x2 = await call("extend-section", { sectionId: s.sectionId, additionalSeconds: 7200 });
    expect(x2?.success).toBe(true);
    const rec2 = await getKvs(`section-protection-${s.sectionId}`);
    expect(Math.abs(new Date(rec2.expiresAt).getTime() - (t1 + 7200_000)), "a lapsed seal extends from NOW").toBeLessThan(60_000);
    const g2 = await call("grant-section-edit", { sectionId: s.sectionId, editorAccountId: GABI });
    expect(g2?.success, "…and the grant works again").toBe(true);

    // ── the seal picker's default without a duration = the space default (unchanged rule) ───
    const scope = (hs?.headings || []).find((h: any) => h.text === "Scope");
    const s2 = await call("seal-section", { pageId: P, headingIndex: scope.index, headingText: "Scope" });
    expect(s2?.success).toBe(true);
    sealed.push(s2.sectionId);
    expect((await getKvs(`section-protection-${s2.sectionId}`)).lockDuration, "no duration → the resolved hold").toBeGreaterThan(3600);
  } finally {
    for (const id of sealed) await call("unseal-section", { sectionId: id }).catch(() => {});
    await bed.restore();
  }
});

test("SEC-7 browser: the panel asks how long before sealing; the owner's row warns before the lapse and offers Extend", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("sec7-browser", { body: BODY });
  const P = bed.pageId;
  const shot = async (name: string) => page.screenshot({ path: `${OUT}/${name}.png` });
  try {
    // The inline panel is the seal-a-section door; put the macro on the page (the dev module).
    const T = getTarget("sentinel-vault-realm");
    await insertNode(P, buildExtensionNode(T.appId, T.envId, "sentinel-vault-panel", { title: "Sentinel Vault" }), { message: "harness: add the panel" });
    // Seal "Decisions" for one day through the hook so the row warns; the picker flow seals "Risks".
    const hs = await call("list-page-headings", { pageId: P });
    const dec = (hs?.headings || []).find((h: any) => h.text === "Decisions");
    const s0 = await call("seal-section", { pageId: P, headingIndex: dec.index, headingText: "Decisions", lockDuration: 86400 });
    expect(s0?.success).toBe(true);

    await loadPage(page, P);
    const app = await openDetailsModal(page);
    const row = app.locator('[data-testid="pd-seal-row"][data-kind="section"]', { hasText: "Decisions" });
    await expect(row, "the owner's section row is listed").toBeVisible({ timeout: 20_000 });
    const warn = row.locator('[data-testid="pd-expiry-warning"]');
    await expect(warn, "the row warns in amber before the lapse").toContainText("expires tomorrow");
    const color = await warn.evaluate((e: any) => getComputedStyle(e).color);
    console.log("### warning colour:", color);
    await row.locator('[data-testid="pd-kebab"]').click();
    await expect(row.locator('[data-testid="pd-menu-extend"]'), "⋯ offers Extend for a section").toBeVisible();
    await shot("01-modal-row-warning-and-extend");
    await row.locator('[data-testid="pd-menu-extend"]').click();
    await expect.poll(async () => (await getKvs(`section-protection-${s0.sectionId}`))?.extensionCount, { timeout: 30_000 }).toBe(1);
    await expect(warn, "after the extension the warning is gone (the space default is days away)").toHaveCount(0, { timeout: 20_000 });
    await shot("02-modal-row-after-extend");
    await app.locator('[data-testid="pd-close"]').click();

    // ── the panel: pick a heading → "Holds for" step → note → Seal ───────────────────────────
    await loadPage(page, P);
    let panel = await findDevPanel(page);
    if (!panel) { await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForTimeout(3000); panel = await findDevPanel(page); }
    expect(panel, "the inline panel is on the page (auto-inserted by the first seal)").toBeTruthy();
    const pf = panel!;
    await pf.locator("button", { hasText: "Seal a section" }).click();
    // The Scope row's range text says "ends before Risks" — match the heading text itself.
    const risks = pf.locator('[data-testid="sv-section-pick"]', { has: pf.locator(".sv-section-pick-text", { hasText: /^Risks$/ }) });
    await expect(risks, "the picker lists Risks").toBeVisible({ timeout: 20_000 });
    await expect(pf.locator('[data-testid="sv-section-hold"]'), "nothing is sealed on a click yet").toHaveCount(0);
    await risks.click();
    const holdStep = pf.locator('[data-testid="sv-section-hold"]');
    await expect(holdStep, "picking a heading opens the Holds-for step instead of sealing").toBeVisible();
    await expect(holdStep.locator('[data-testid="sv-hold-default"]'), "the space default is preselected").toHaveAttribute("aria-checked", "true");
    await holdStep.locator('[data-testid="sv-hold-86400"]').click();
    await holdStep.locator('[data-testid="sv-section-note"]').fill("frozen for the audit");
    const el = await page.locator(`iframe[src*="17516615"]`).filter({ has: page.locator(".sv-panel-container") }).first().elementHandle().catch(() => null);
    if (el) await el.scrollIntoViewIfNeeded().catch(() => {});
    await shot("03-panel-hold-step");
    await holdStep.locator('[data-testid="sv-section-seal-confirm"]').click();
    const rowP = pf.locator('[data-testid="sv-section-row"]', { hasText: "Risks" });
    await expect(rowP, "the sealed row appears").toBeVisible({ timeout: 30_000 });
    await expect(rowP.locator('[data-testid="sv-section-expiry-warning"]'), "one day → the amber warning on the owner's row").toContainText("expires tomorrow");
    expect(norm(await rowP.innerText()), "the note is on the row").toContain("frozen for the audit");
    const en2 = await call("enumerate-section-seals", { pageId: P });
    const risksRec = (en2?.sections || []).find((x: any) => x.sectionTitle === "Risks");
    expect(risksRec?.note).toBe("frozen for the audit");
    expect(Math.abs(new Date(risksRec.expiresAt).getTime() - (Date.now() + 86400_000)), "sealed for the chosen day").toBeLessThan(120_000);
    await shot("04-panel-row-warning");
    await page.evaluate(() => { document.documentElement.dataset.colorMode = "dark"; });
    await pf.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(400);
    await shot("04b-panel-row-warning-dark");
    // ⋯ → Extend on the panel row too
    await rowP.locator('[data-testid="sv-section-kebab"]').click();
    await expect(pf.locator('[role="menuitem"]', { hasText: "Extend the seal" }), "the panel's ⋯ offers Extend for a section").toBeVisible();
    await page.keyboard.press("Escape");
  } finally {
    for (const id of await inv("query", {}).then(() => [] as string[]).catch(() => [] as string[])) void id;
    const en = await call("enumerate-section-seals", { pageId: P });
    for (const sct of en?.sections || []) await call("unseal-section", { sectionId: sct.sectionId }).catch(() => {});
    await bed.restore();
  }
});
