// SEC-2 (e) (UX critique 2026-09-19, done 2026-09-20): "Propose a change". On an Approved page a
// sealed row used to offer nothing personal and say why ("Locked by the approval of this page");
// the only path was the workflow's own Move to…, which an editor does not have. After the fix the
// held row's primary is "Propose a change": it opens the existing edit-request flow with the reason
// prefilled ("Proposed change to an approved page") and routes the request to the page's
// APPROVERS (one My work row per approver), not the seal's owner. An approver's Approve is the
// workflow's own door — the page is moved back for review (custody hands every seal back) and only
// then is the ordinary grant minted, so "the workflow is the senior lock" holds; Decline is the
// usual decline with a word. Server half on the plain-editor bed (PLAIN proposes, Mihai the
// approver decides); browser half on the details modal as Mihai (Gabriela the approver).
import { test, expect } from "../../fixtures/forge";
import { mkdirSync } from "node:fs";
import { setupWorkflowPage, loadPage, inv, getKvs, norm, SPACE, MIHAI, GABI, PLAIN, PLAIN_SPACE } from "./_wf";
import { openDetailsModal } from "./_door";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
// @ts-ignore
import { uploadAttachment } from "../../data/confluence.mjs";

const OUT = process.env.OUT_DIR || "evidence/sec2e-propose-change";
test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor: string) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Risks", 2), paragraph("The risks we accept."), heading("Decisions", 2), paragraph("What we decided.")];
const PREFILL = "Proposed change to an approved page";

async function approveViaMihai(P: string, S: string, requester: string) {
  const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: S, to: "in_review", actor: requester, actorName: "Requester" });
  expect(t1.result?.success).toBe(true);
  const rq = await inv("reqTransition", { pageId: P, spaceKey: S, to: "approved", actor: requester });
  expect(rq.result?.pending, `request opens (${JSON.stringify(rq.result).slice(0, 160)})`).toBe(true);
  const dec = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "approved", reason: "ok" });
  expect(dec.result?.success && dec.result?.transitioned, `approve completes (${JSON.stringify(dec.result).slice(0, 160)})`).toBe(true);
}

test("SEC-2 (e) server: a proposal on a held section goes to the approvers; Approve moves the page back and grants; a proposal on a held file is declined with a word", async () => {
  const bed = await setupWorkflowPage("sec2e-server", { body: BODY, space: PLAIN_SPACE });
  const P = bed.pageId;
  const S = PLAIN_SPACE;
  let sid: string | null = null; let att: string | null = null;
  try {
    const hs = await call("list-page-headings", { pageId: P }, GABI);
    const risks = (hs?.headings || []).find((h: any) => h.text === "Risks");
    const s = await call("seal-section", { pageId: P, headingIndex: risks.index, headingText: "Risks", lockDuration: 2 * 86400 }, GABI);
    expect(s?.success).toBe(true); sid = s.sectionId;
    const up = await uploadAttachment(P, `sec2e-${Date.now()}.txt`, "held file"); att = up.attachmentId;
    const sa = await call("seal-artifact", { attachmentId: att, lockDuration: 2 * 86400 }, GABI);
    expect(sa?.success).toBe(true);
    // let the panel embed land, then approve (Mihai is the sole approver)
    await new Promise((r) => setTimeout(r, 12_000));
    await approveViaMihai(P, S, PLAIN);
    expect((await getKvs(`section-protection-${sid}`))?.workflowHeld, "the section is held").toBeTruthy();
    expect((await getKvs(`protection-${att}`))?.workflowHeld, "the file is held").toBeTruthy();

    // ── PLAIN's row on the modal offers Propose a change; his proposal goes to the approvers ─
    const sum0 = await call("page-details-summary", { pageId: P }, PLAIN);
    const row0 = (sum0?.seals || []).find((r: any) => r.kind === "section" && r.id === sid);
    console.log("### PLAIN's row before:", JSON.stringify({ workflowHeld: row0?.workflowHeld, primary: row0?.primary?.kind, myEditStatus: row0?.myEditStatus }));
    expect(row0?.primary?.kind ?? "(rows carry no primary)").toMatch(/propose|\(rows carry no primary\)/);
    const req = await call("request-section-edit", { sectionId: sid, reason: PREFILL }, PLAIN);
    console.log("### proposal:", JSON.stringify(req));
    expect(req?.success, "a request on a held seal is accepted as a proposal").toBe(true);
    const rec = await getKvs(`section-edit-request-${sid}-${PLAIN}`);
    console.log("### request record:", JSON.stringify({ proposal: rec?.proposal, approvers: rec?.approvers, ownerAccountId: rec?.ownerAccountId, reason: rec?.reason }));
    expect(rec?.proposal).toBe(true);
    expect(rec?.approvers, "addressed to the page's approver (Mihai), not the seal's owner (Gabriela)").toEqual([MIHAI]);
    expect(rec?.reason).toBe(PREFILL);
    expect(await getKvs(`sectionreq-owner-${MIHAI}-${sid}-${PLAIN}`), "the approver's My work row").toBeTruthy();
    expect(await getKvs(`sectionreq-owner-${GABI}-${sid}-${PLAIN}`), "no row for the seal owner").toBeNull();
    const inboxM = (await call("list-my-section-edit-requests", {}, MIHAI))?.requests || [];
    expect(inboxM.some((r: any) => r.sectionId === sid && r.requesterAccountId === PLAIN && r.proposal), "the approver sees the proposal as waiting on him").toBe(true);
    const inboxG = (await call("list-my-section-edit-requests", {}, GABI))?.requests || [];
    expect(inboxG.some((r: any) => r.sectionId === sid && r.requesterAccountId === PLAIN), "the seal owner does not").toBe(false);
    expect((await call("check-section-edit", { sectionId: sid }, PLAIN))?.status, "the proposer sees it pending").toBe("pending");
    const sum1 = await call("page-details-summary", { pageId: P }, PLAIN);
    const row1 = (sum1?.seals || []).find((r: any) => r.kind === "section" && r.id === sid);
    expect(row1?.myEditStatus).toBe("pending");
    // the seal owner cannot approve a proposal (it is not hers to decide)
    const wrong = await call("approve-section-edit", { sectionId: sid, requesterAccountId: PLAIN }, PLAIN);
    expect(wrong?.success, "the proposer cannot approve his own proposal").toBe(false);

    // ── the approver approves: the page goes back for review, the seal is handed back, the grant is minted ─
    const ok = await call("approve-section-edit", { sectionId: sid, requesterAccountId: PLAIN }, MIHAI);
    console.log("### approve:", JSON.stringify(ok));
    expect(ok?.success).toBe(true);
    const wf = await getKvs(`workflow-state-${P}`);
    console.log("### workflow after approve:", JSON.stringify({ stateId: wf?.stateId, enforce: wf?.enforce }));
    expect(wf?.stateId, "the page moved back (the workflow's own door)").toBe("draft");
    expect(wf?.enforce).toBeFalsy();
    const sec = await getKvs(`section-protection-${sid}`);
    expect(sec?.workflowHeld, "custody handed the section back").toBeFalsy();
    expect(sec?.expiresAt, "…with a live expiry").toBeTruthy();
    expect((await getKvs(`protection-${att}`))?.workflowHeld, "…and the file too (the whole page left Approved)").toBeFalsy();
    const grant = await getKvs(`section-edit-grant-${sid}-${PLAIN}`);
    expect(grant, "the ordinary grant exists on the now-personal seal").toBeTruthy();
    expect((await call("check-section-edit", { sectionId: sid }, PLAIN))?.status).toBe("granted");
    expect(await getKvs(`sectionreq-owner-${MIHAI}-${sid}-${PLAIN}`), "the approver's row is consumed").toBeNull();
    const act = await call("get-page-activity", { pageId: P, limit: 12 }, MIHAI);
    const types = (act?.entries || []).map((e: any) => e.type);
    console.log("### activity:", JSON.stringify(types));
    expect(types).toContain("editreq.approved");
    expect(types.some((t: string) => t === "workflow.transitioned" || t === "workflow.seals-released")).toBe(true);

    // ── a proposal on the held FILE, declined with a word ────────────────────────────────────
    await approveViaMihai(P, S, PLAIN);
    expect((await getKvs(`protection-${att}`))?.workflowHeld, "held again").toBeTruthy();
    const reqA = await call("request-edit-access", { attachmentId: att, reason: PREFILL }, PLAIN);
    expect(reqA?.success, `file proposal (${JSON.stringify(reqA).slice(0, 120)})`).toBe(true);
    expect((await getKvs(`edit-request-${att}-${PLAIN}`))?.approvers).toEqual([MIHAI]);
    expect(await getKvs(`editreq-owner-${MIHAI}-${att}-${PLAIN}`), "the approver's file row").toBeTruthy();
    const dn = await call("deny-edit-request", { attachmentId: att, requesterAccountId: PLAIN, reason: "not while the audit runs" }, MIHAI);
    expect(dn?.success).toBe(true);
    const chk = await call("check-edit-request", { attachmentId: att }, PLAIN);
    console.log("### declined file proposal:", JSON.stringify(chk));
    expect(chk?.status).toBe("denied");
    expect(chk?.deniedReason).toBe("not while the audit runs");
    expect(chk?.retryAt).toBeTruthy();
    expect((await getKvs(`workflow-state-${P}`))?.stateId, "a decline moves nothing").toBe("approved");
    expect((await getKvs(`protection-${att}`))?.workflowHeld, "the file stays held").toBeTruthy();
  } finally {
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    if (sid) await call("unseal-section", { sectionId: sid, reason: "harness cleanup" }, MIHAI).catch(() => {});
    if (att) await call("unseal-artifact", { attachmentId: att, adminOverride: true, reason: "harness cleanup" }, MIHAI).catch(() => {});
    await bed.restore();
  }
});

test("SEC-2 (e) browser: the held row's primary is Propose a change; the bar comes prefilled; after Propose the row waits for the approvers", async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  const bed = await setupWorkflowPage("sec2e-browser", { body: BODY, approvers: [{ id: GABI, name: "Gabriela Perdum" }] });
  const P = bed.pageId;
  let sid: string | null = null;
  try {
    const hs = await call("list-page-headings", { pageId: P }, GABI);
    const risks = (hs?.headings || []).find((h: any) => h.text === "Risks");
    const s = await call("seal-section", { pageId: P, headingIndex: risks.index, headingText: "Risks", lockDuration: 2 * 86400 }, GABI);
    expect(s?.success).toBe(true); sid = s.sectionId;
    await new Promise((r) => setTimeout(r, 12_000));
    const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: SPACE, to: "in_review", actor: MIHAI, actorName: "Mihai Perdum" });
    expect(t1.result?.success).toBe(true);
    const rq = await inv("reqTransition", { pageId: P, spaceKey: SPACE, to: "approved", actor: MIHAI });
    expect(rq.result?.pending).toBe(true);
    const dec = await inv("decideApproval", { pageId: P, approver: GABI, decision: "approved", reason: "ok" });
    expect(dec.result?.success && dec.result?.transitioned, `approved by Gabriela (${JSON.stringify(dec.result).slice(0, 120)})`).toBe(true);
    await loadPage(page, P);
    const app = await openDetailsModal(page);
    const row = app.locator('[data-testid="pd-seal-row"][data-kind="section"]', { hasText: "Risks" });
    await expect(row).toBeVisible({ timeout: 20_000 });
    const primary = row.locator('[data-testid="pd-primary"]');
    await expect(primary).toHaveAttribute("data-action", "propose");
    await expect(primary).toHaveText("Propose a change");
    expect(norm(await row.innerText())).toMatch(/Locked by the approval of this page · expiry paused/);
    await page.screenshot({ path: `${OUT}/01-modal-propose.png` });
    await primary.click();
    const input = row.locator('[data-testid="pd-reason-input"]');
    await expect(input).toBeVisible();
    await expect(input, "the reason comes prefilled").toHaveValue(PREFILL);
    await expect(row.locator('[data-testid="pd-reason-confirm"]')).toHaveText("Propose");
    await page.screenshot({ path: `${OUT}/02-modal-propose-bar.png` });
    await row.locator('[data-testid="pd-reason-confirm"]').click();
    await expect(row.locator('[data-testid="pd-primary"]'), "after Propose the row waits for the approvers").toHaveAttribute("data-action", "waiting", { timeout: 20_000 });
    await expect(row.locator('[data-testid="pd-primary"]')).toHaveText("Waiting for the approvers");
    const rec = await getKvs(`section-edit-request-${sid}-${MIHAI}`);
    expect(rec?.proposal).toBe(true);
    expect(rec?.approvers).toEqual([GABI]);
    await page.screenshot({ path: `${OUT}/03-modal-waiting.png` });
    await app.locator("html").evaluate((h: any) => h.setAttribute("data-color-mode", "dark"));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/03b-modal-waiting-dark.png` });
  } finally {
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    if (sid) await call("unseal-section", { sectionId: sid, reason: "harness cleanup" }, MIHAI).catch(() => {});
    await bed.restore();
  }
});
