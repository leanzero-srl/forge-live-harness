// SEC-2 (UX critique 2026-09-19, owner decision: the workflow is the senior lock). Before the fix
// two enforcers ran on one Approved page and did not know each other: approving the page changed
// nothing on its sealed sections, the approver was reverted inside a section he had just approved,
// and the personal owner could release a seal on an Approved page at will. After the fix ONE rule
// (shared/seal-authority.js) decides: entering Approved takes custody of every seal on the page
// (expiry paused, personal release / extend / grant / request refused with "Locked by the approval of
// this page — changes go through the workflow"), the page's privileged set is the only one that
// edits inside a held seal (re-baselined, never reverted), and leaving Approved hands each seal back
// with the time it had left. Server half through the hook + REST page writes; browser half on the
// ribbon and the details modal. FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, shotRibbon, inv, getKvs, norm, SPACE, MIHAI, GABI } from "./_wf";
import { openDetailsModal } from "./_door";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
// @ts-ignore
import { readPage, writeAdf, uploadAttachment } from "../../data/confluence.mjs";

const OUT = process.env.OUT_DIR || "evidence/sec2-workflow-owns-seals";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Risks", 2), paragraph("The risks we accept."), heading("Decisions", 2), paragraph("What we decided.")];
const HELD = "Locked by the approval of this page — changes go through the workflow";

/** Draft → In Review (Gabriela) → request Approved (Gabriela) → Mihai approves. */
async function approve(P: string) {
  const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: GABI, actorName: "Gabriela Perdum" });
  expect(t1.result?.success, `to in_review (${JSON.stringify(t1.result).slice(0, 120)})`).toBe(true);
  const rq = await inv("reqTransition", { pageId: P, spaceKey: SPACE, to: "approved", actor: GABI });
  expect(rq.result?.pending, `request opens (${JSON.stringify(rq.result).slice(0, 160)})`).toBe(true);
  const dec = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "approved", reason: "ok" });
  expect(dec.result?.success && dec.result?.transitioned, `approve completes (${JSON.stringify(dec.result).slice(0, 160)})`).toBe(true);
}

test("SEC-2 server: Approved takes custody of the seals, refuses personal actions, lets the approver edit inside, and hands them back with their remaining time", async () => {
  const bed = await setupWorkflowPage("sec2-server", { body: BODY });
  const P = bed.pageId;
  let sectionId: string | null = null;
  try {
    // ── Gabriela seals Risks for 2 days (she can edit WFH pages; Mihai is the approver) ──────
    const hs = await call("list-page-headings", { pageId: P }, GABI);
    const risks = (hs?.headings || []).find((h: any) => h.text === "Risks");
    const s = await call("seal-section", { pageId: P, headingIndex: risks.index, headingText: "Risks", lockDuration: 2 * 86400 }, GABI);
    expect(s?.success, `Gabriela seals (${JSON.stringify(s).slice(0, 160)})`).toBe(true);
    sectionId = s.sectionId;
    const rec0 = await getKvs(`section-protection-${sectionId}`);
    expect(rec0.lockedBy).toBe(GABI);
    const remainingBefore = new Date(rec0.expiresAt).getTime() - Date.now();

    // ── approve the page: the seal becomes the workflow's ────────────────────────────────────
    await approve(P);
    const rec1 = await getKvs(`section-protection-${sectionId}`);
    console.log("### held record:", JSON.stringify({ expiresAt: rec1.expiresAt, workflowHeld: rec1.workflowHeld, lockedBy: rec1.lockedBy }));
    expect(rec1.workflowHeld, "the record says the workflow holds it").toBeTruthy();
    expect(rec1.expiresAt, "expiry is paused").toBeNull();
    expect(rec1.workflowHeld.stateName).toBe("Approved");
    expect(Math.abs(rec1.workflowHeld.remainingMs - remainingBefore), "the remaining time was captured").toBeLessThan(60_000);
    expect(rec1.lockedBy, "the personal owner stays on the record (the trail)").toBe(GABI);
    const rows = await call("enumerate-section-seals", { pageId: P }, GABI);
    expect(rows?.sections?.[0]?.workflowHeld, "the rows say so").toBe(true);
    const sum = await call("page-details-summary", { pageId: P }, GABI);
    expect(sum?.seals?.[0]?.workflowHeld).toBe(true);
    const act = await call("get-page-activity", { pageId: P, limit: 8 });
    expect((act?.entries || []).some((e: any) => e.type === "workflow.seals-held"), "the trail records the custody").toBe(true);

    // ── the owner's personal actions are refused with the one sentence ──────────────────────
    const rel = await call("unseal-section", { sectionId }, GABI);
    console.log("### owner release while Approved:", JSON.stringify(rel));
    expect(rel?.success).toBe(false); expect(rel?.reason).toBe(HELD);
    const ext = await call("extend-section", { sectionId, additionalSeconds: 3600 }, GABI);
    expect(ext?.success).toBe(false); expect(ext?.reason).toBe(HELD);
    const grant = await call("grant-section-edit", { sectionId, editorAccountId: MIHAI }, GABI);
    expect(grant?.success).toBe(false); expect(grant?.reason).toBe(HELD);
    // SEC-2 (e): a request on a held seal is not refused — it is a PROPOSAL to the page's approvers.
    const req = await call("request-section-edit", { sectionId, reason: "please" }, MIHAI);
    expect(req?.success, "a request on a held seal opens as a proposal").toBe(true);
    expect((await getKvs(`section-edit-request-${sectionId}-${MIHAI}`))?.proposal).toBe(true);
    expect(await getKvs(`section-protection-${sectionId}`), "nothing changed on the record").toMatchObject({ workflowHeld: rec1.workflowHeld });

    // ── the approver (Mihai, not the seal's owner) edits INSIDE the section: kept, re-baselined ─
    const before = await readPage(P);
    const versionBefore = before.version;
    const adf = before.adf;
    const wrap = (adf.content || []).find((n: any) => n.type === "bodiedExtension");
    expect(wrap, "the sealed wrapper is on the page").toBeTruthy();
    wrap.content = [heading("Risks", 2), paragraph("The risks we accept — reviewed by the approver.")];
    await writeAdf(P, adf, { message: "approver edits inside the sealed section" });
    const snapBefore = rec1.contentHash;
    // The page-content trigger runs on the save; wait until it has judged this version.
    await expect.poll(async () => (await getKvs(`section-protection-${sectionId}`))?.contentHash !== snapBefore, { timeout: 120_000, message: "the section was RE-BASELINED to the approver's text (not reverted)" }).toBe(true);
    // Give a (wrong) restore write time to land before judging the version.
    await new Promise((r) => setTimeout(r, 15_000));
    const after = await readPage(P);
    console.log("### versions:", versionBefore, "→", after.version, "author:", after.page?.version?.authorId?.slice(-6));
    expect(after.version, "no restore write followed the approver's edit").toBe(versionBefore + 1);
    const wrapAfter = after.adf.content.find((n: any) => n.type === "bodiedExtension");
    expect(JSON.stringify(wrapAfter.content), "the approver's text is still on the page").toContain("reviewed by the approver");
    const wf = await getKvs(`workflow-state-${P}`);
    expect(wf.stateId, "the page stayed Approved").toBe("approved");
    expect(wf.approvedVersion, "the baseline followed the privileged edit").toBe(after.version);

    // ── leaving Approved hands the seal back with the time it had left ───────────────────────
    const t = await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI);
    expect(t?.success, `back to Draft (${JSON.stringify(t).slice(0, 120)})`).toBe(true);
    const rec2 = await getKvs(`section-protection-${sectionId}`);
    console.log("### handed back:", JSON.stringify({ expiresAt: rec2.expiresAt, workflowHeld: rec2.workflowHeld, handedBackAt: rec2.handedBackAt }));
    expect(rec2.workflowHeld, "the hold is gone").toBeFalsy();
    const remainingAfter = new Date(rec2.expiresAt).getTime() - Date.now();
    expect(Math.abs(remainingAfter - remainingBefore), "…with the remaining time restored (not the wall-clock time lost while Approved)").toBeLessThan(120_000);
    const rel2 = await call("unseal-section", { sectionId }, GABI);
    expect(rel2?.success, "the owner can release again").toBe(true);
    sectionId = null;
  } finally {
    if (sectionId) await call("unseal-section", { sectionId }, GABI).catch(() => {});
    await bed.restore();
  }
});

test("SEC-2 server (attachments): an attachment seal is held on Approved, its release / extend / grant refused, and handed back with its remaining time", async () => {
  const bed = await setupWorkflowPage("sec2-attachment", { body: BODY });
  const P = bed.pageId;
  let att: string | null = null;
  try {
    const up = await uploadAttachment(P, `sec2-held-${Date.now()}.txt`, "held while approved");
    att = up.attachmentId;
    const s = await call("seal-artifact", { attachmentId: att, lockDuration: 2 * 86400 }, GABI);
    expect(s?.success, `Gabriela seals the file (${JSON.stringify(s).slice(0, 160)})`).toBe(true);
    const rec0 = await getKvs(`protection-${att}`);
    expect(rec0?.lockedBy).toBe(GABI);
    expect(rec0?.expiresAt, "a live expiry before the approval").toBeTruthy();
    const remainingBefore = new Date(rec0.expiresAt).getTime() - Date.now();
    const freeze = await call("workflow-seals-to-freeze", { pageId: P }, MIHAI);
    expect((freeze?.attachments || []).some((a: any) => String(a.id) === String(att)), "the approval dialog lists the file it will freeze").toBe(true);
    // The first seal on a page embeds the inline panel (an app page write that lands a few seconds
    // later); an approval requested before it lands is refused as stale. Wait for the version to settle.
    let last = (await readPage(P)).version;
    for (let i = 0; i < 12; i++) { await new Promise((r) => setTimeout(r, 5000)); const v = (await readPage(P)).version; if (v === last && i >= 1) break; last = v; }

    await approve(P);
    const rec1 = await getKvs(`protection-${att}`);
    console.log("### held attachment:", JSON.stringify({ expiresAt: rec1.expiresAt, workflowHeld: rec1.workflowHeld }));
    expect(rec1.workflowHeld, "the file seal is the workflow's").toBeTruthy();
    expect(rec1.expiresAt, "expiry paused").toBeNull();
    expect(Math.abs(rec1.workflowHeld.remainingMs - remainingBefore)).toBeLessThan(60_000);
    if (rec1.spaceId) expect((await getKvs(`space-protection-${rec1.spaceId}-${att}`))?.workflowHeld, "the space index row follows").toBeTruthy();
    const sum = await call("page-details-summary", { pageId: P }, GABI);
    const row = (sum?.seals || []).find((r: any) => r.kind === "attachment" && String(r.id) === String(att));
    expect(row?.workflowHeld, "the modal row says so").toBe(true);

    const rel = await call("unseal-artifact", { attachmentId: att }, GABI);
    const ext = await call("extend-seal", { attachmentId: att, additionalSeconds: 3600 }, GABI);
    const grant = await call("grant-edit-access", { attachmentId: att, editorAccountId: MIHAI }, GABI);
    const req = await call("request-edit-access", { attachmentId: att, reason: "please" }, MIHAI);
    console.log("### attachment refusals:", JSON.stringify({ rel, ext, grant, req }));
    expect(rel?.success).toBe(false); expect(rel?.reason).toBe(HELD);
    expect(ext?.success).toBe(false); expect(ext?.reason).toBe(HELD);
    expect(grant?.success).toBe(false); expect(grant?.reason).toBe(HELD);
    expect(req?.success, "SEC-2 (e): a request on a held file opens as a proposal to the approvers").toBe(true);
    expect((await getKvs(`edit-request-${att}-${MIHAI}`))?.proposal).toBe(true);
    expect(await getKvs(`protection-${att}`), "nothing changed on the record").toMatchObject({ workflowHeld: rec1.workflowHeld, expiresAt: null });

    const t = await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI);
    expect(t?.success, `back to Draft (${JSON.stringify(t).slice(0, 120)})`).toBe(true);
    const rec2 = await getKvs(`protection-${att}`);
    console.log("### handed back:", JSON.stringify({ expiresAt: rec2.expiresAt, workflowHeld: rec2.workflowHeld }));
    expect(rec2.workflowHeld).toBeFalsy();
    expect(Math.abs(new Date(rec2.expiresAt).getTime() - Date.now() - remainingBefore), "the remaining time is restored").toBeLessThan(120_000);
    const rel2 = await call("unseal-artifact", { attachmentId: att }, GABI);
    expect(rel2?.success, "the owner can release again").toBe(true);
    att = null;
  } finally {
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    if (att) await call("unseal-artifact", { attachmentId: att }, GABI).catch(() => {});
    await bed.restore();
  }
});

test("SEC-2 browser: the ribbon and the details modal say the approval holds the seal", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("sec2-browser", { body: BODY });
  const P = bed.pageId;
  let sectionId: string | null = null;
  try {
    const hs = await call("list-page-headings", { pageId: P }, GABI);
    const risks = (hs?.headings || []).find((h: any) => h.text === "Risks");
    const s = await call("seal-section", { pageId: P, headingIndex: risks.index, headingText: "Risks", lockDuration: 2 * 86400 }, GABI);
    expect(s?.success).toBe(true);
    sectionId = s.sectionId;
    await approve(P);
    // Mihai views: he does not own Gabriela's seal → the ribbon's Locked pill, with the workflow sentence.
    const r = await loadPage(page, P);
    expect(r, "ribbon renders").toBeTruthy();
    await expect(r!.frame.locator('[data-testid="ribbon-pill"]')).toContainText("Locked", { timeout: 20_000 });
    const text = norm(await r!.frame.locator('[data-testid="ribbon-bar"]').innerText());
    console.log("### ribbon:", text);
    expect(text, "the sentence names the approval, not the person").toMatch(/locked by this page's approval/);
    await expect(r!.frame.locator('[data-testid="ribbon-request"], .ribbon-action:has-text("Request edit")'), "no personal Request edit on a held seal").toHaveCount(0);
    await shotRibbon(page, r!.el, `${OUT}/01-ribbon-held.png`);
    const app = await openDetailsModal(page);
    const row = app.locator('[data-testid="pd-seal-row"][data-kind="section"]', { hasText: "Risks" });
    await expect(row).toBeVisible({ timeout: 20_000 });
    // SEC-2 (e): the held row's primary is the workflow's door — Propose a change (to the approvers).
    await expect(row.locator('[data-testid="pd-primary"]')).toHaveAttribute("data-action", "propose");
    await expect(row.locator('[data-testid="pd-primary"]')).toHaveText("Propose a change");
    expect(norm(await row.innerText()), "the sentence still says the approval holds it").toMatch(/Locked by the approval of this page · expiry paused/);
    await row.locator('[data-testid="pd-kebab"]').click();
    await expect(app.locator('[data-testid="pd-menu-release"], [data-testid="pd-menu-extend"], [data-testid="pd-menu-give-access"]'), "no personal actions under ⋯").toHaveCount(0);
    await expect(app.locator('[data-testid="pd-menu-force-release"]'), "the space admin keeps the break-glass").toBeVisible();
    await page.screenshot({ path: `${OUT}/02-modal-held.png` });
    // Close the menu by clicking elsewhere in the modal (Escape would close the modal itself).
    await app.locator('[data-testid="pd-title"]').click();
    await expect(app.locator('[data-testid="pd-menu-force-release"]')).toHaveCount(0);
    await page.evaluate(() => { document.documentElement.dataset.colorMode = "dark"; });
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/02b-modal-held-dark.png` });
  } finally {
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    if (sectionId) await call("unseal-section", { sectionId }, GABI).catch(() => {});
    await bed.restore();
  }
});
