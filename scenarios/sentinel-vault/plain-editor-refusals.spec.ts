// The plain-editor bed (2026-09-20) — the refusals the UX-critique groups could only grep for.
// Root cause of "unverified": every real wolfaenpak account the harness knew (Mihai, Gabriela,
// LeanZero SRL) is a SITE admin, so the steward gate's site-admin arm answers "steward" for them
// on every space; a synthetic id cannot read a page. The one real licensed account with no admin
// operation is the second "Mihai Perdum" (mihai@leanzero.net, PLAIN) — a member of
// confluence-users-wolfaenpak only — and space SVPLAIN gives that group read/create/update while
// `administer` stays with confluence-admins-wolfaenpak, site-admins and Mihai.
//
// Server-only (the hook's `actor` seam; the harness browser session is Mihai's). Every refusal is
// paired with the SAME call as a steward through the SAME seam, so a refusal is the account's
// standing and not the seam's lack of a user session. FAILS if any refusal sentence drifts.
import { test, expect } from "../../fixtures/forge";
import { setupWorkflowPage, inv, getKvs, MIHAI, GABI, PLAIN, PLAIN_SPACE } from "./_wf";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
// @ts-ignore
import { readPage, writeAdf, getComments } from "../../data/confluence.mjs";

test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor: string) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Risks", 2), paragraph("The risks we accept."), heading("Decisions", 2), paragraph("What we decided.")];
const HELD = "Locked by the approval of this page — changes go through the workflow";
const S = PLAIN_SPACE;

async function approveViaMihai(P: string, requester = PLAIN) {
  const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: S, to: "in_review", actor: requester, actorName: "Plain Editor" });
  expect(t1.result?.success, `to in_review (${JSON.stringify(t1.result).slice(0, 120)})`).toBe(true);
  const rq = await inv("reqTransition", { pageId: P, spaceKey: S, to: "approved", actor: requester });
  expect(rq.result?.pending, `request opens (${JSON.stringify(rq.result).slice(0, 160)})`).toBe(true);
  const dec = await inv("decideApproval", { pageId: P, approver: MIHAI, decision: "approved", reason: "ok" });
  expect(dec.result?.success && dec.result?.transitioned, `approve completes (${JSON.stringify(dec.result).slice(0, 160)})`).toBe(true);
}

test("bed: PLAIN is an editor on SVPLAIN and not a steward; the site admins are stewards through the same seam", async () => {
  const bed = await setupWorkflowPage("plain-bed", { body: BODY, space: S });
  const P = bed.pageId;
  try {
    const rp = await call("check-user-role", { spaceKey: S }, PLAIN);
    const rm = await call("check-user-role", { spaceKey: S }, MIHAI);
    const rg = await call("check-user-role", { spaceKey: S }, GABI);
    console.log("### roles on SVPLAIN:", JSON.stringify({ plain: rp, mihai: rm, gabi: rg }));
    expect(rp?.role, "PLAIN is a user").toBe("user");
    expect(rm?.role, "Mihai is a steward (site admin)").toBe("steward");
    expect(rg?.role, "Gabriela is a steward (site admin) — which is why she never manufactured a refusal").toBe("steward");
    // PLAIN can EDIT the page (the seal / request gates are canEditPage) — proven by sealing one.
    const hs = await call("list-page-headings", { pageId: P }, PLAIN);
    const scope = (hs?.headings || []).find((h: any) => h.text === "Scope");
    expect(scope, "PLAIN reads the page's headings").toBeTruthy();
    const s = await call("seal-section", { pageId: P, headingIndex: scope.index, headingText: "Scope", lockDuration: 3600 }, PLAIN);
    expect(s?.success, `PLAIN may seal a section (edit permission) (${JSON.stringify(s).slice(0, 160)})`).toBe(true);
    expect((await getKvs(`section-protection-${s.sectionId}`))?.lockedBy).toBe(PLAIN);
    // Enforcement's steward check is the asApp one (space ADMINISTER as a third arm): PLAIN is not
    // privileged on an Approved page, Gabriela (site admin, not an approver) is.
    await approveViaMihai(P);
    // Gabriela FIRST: her call changes nothing; PLAIN's demotes the page (demote mode), after which
    // a second call would find nothing enforced.
    const dg = await inv("enforceDecision", { pageId: P, actor: GABI, eventVersion: "99" });
    const dp = await inv("enforceDecision", { pageId: P, actor: PLAIN, eventVersion: "99" });
    console.log("### enforcement:", JSON.stringify({ plain: dp.result, gabi: dg.result }));
    expect(dg.result?.action, "a site admin is privileged (asApp steward arm)").toBe("privileged");
    expect(dp.result?.action, "PLAIN is demoted (enforceMode demote) — not privileged").toBe("demote");
    await call("unseal-section", { sectionId: s.sectionId }, PLAIN).catch(() => {});
  } finally {
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    await bed.restore();
  }
});

test("SEC-7 + SEC-2: a non-owner non-steward is refused extend / release / grant on a personal seal; a held seal refuses its non-steward OWNER too", async () => {
  const bed = await setupWorkflowPage("plain-sec7-sec2", { body: BODY, space: S });
  const P = bed.pageId;
  const sealed: { id: string; owner: string }[] = [];
  try {
    const hs = await call("list-page-headings", { pageId: P }, GABI);
    const risks = (hs?.headings || []).find((h: any) => h.text === "Risks");
    // ── Gabriela's seal, PLAIN a stranger to it ──────────────────────────────────────────────
    const s = await call("seal-section", { pageId: P, headingIndex: risks.index, headingText: "Risks", lockDuration: 7200 }, GABI);
    expect(s?.success, `Gabriela seals (${JSON.stringify(s).slice(0, 160)})`).toBe(true);
    sealed.push({ id: s.sectionId, owner: GABI });
    const ext = await call("extend-section", { sectionId: s.sectionId, additionalSeconds: 3600 }, PLAIN);
    console.log("### PLAIN extend:", JSON.stringify(ext));
    expect(ext?.success).toBe(false);
    expect(ext?.reason).toBe("Only the seal owner or a space admin can extend this seal");
    const rel = await call("unseal-section", { sectionId: s.sectionId, reason: "trying" }, PLAIN);
    console.log("### PLAIN release:", JSON.stringify(rel));
    expect(rel?.success).toBe(false);
    expect(rel?.reason).toBe("Only the section owner or a space admin can release this seal");
    const grant = await call("grant-section-edit", { sectionId: s.sectionId, editorAccountId: MIHAI }, PLAIN);
    console.log("### PLAIN grant:", JSON.stringify(grant));
    expect(grant?.success).toBe(false);
    expect(String(grant?.reason)).toMatch(/owner|space admin|Not authorized/i);
    const recAfter = await getKvs(`section-protection-${s.sectionId}`);
    expect(recAfter.expiresAt, "nothing changed on the record").toBe((await getKvs(`section-protection-${s.sectionId}`)).expiresAt);
    expect(recAfter.extensionCount ?? 0).toBe(0);
    // control: Mihai — site admin, NOT the owner — extends through the same seam
    const extM = await call("extend-section", { sectionId: s.sectionId, additionalSeconds: 3600 }, MIHAI);
    expect(extM?.success, `the steward's extend goes through (${JSON.stringify(extM).slice(0, 120)})`).toBe(true);
    // PLAIN may ASK (he can read and edit the page)
    const req = await call("request-section-edit", { sectionId: s.sectionId, reason: "need to fix a typo" }, PLAIN);
    expect(req?.success, `PLAIN's request opens (${JSON.stringify(req).slice(0, 120)})`).toBe(true);

    // ── PLAIN's OWN seal on the same page, then the page is Approved ─────────────────────────
    const hs2 = await call("list-page-headings", { pageId: P }, PLAIN);
    const dec = (hs2?.headings || []).find((h: any) => h.text === "Decisions");
    const s2 = await call("seal-section", { pageId: P, headingIndex: dec.index, headingText: "Decisions", lockDuration: 7200 }, PLAIN);
    expect(s2?.success, `PLAIN seals Decisions (${JSON.stringify(s2).slice(0, 160)})`).toBe(true);
    sealed.push({ id: s2.sectionId, owner: PLAIN });
    await approveViaMihai(P);
    const held = await getKvs(`section-protection-${s2.sectionId}`);
    expect(held.workflowHeld, "PLAIN's seal is held by the approval").toBeTruthy();
    const r1 = await call("unseal-section", { sectionId: s2.sectionId }, PLAIN);
    const r2 = await call("extend-section", { sectionId: s2.sectionId, additionalSeconds: 3600 }, PLAIN);
    const r3 = await call("grant-section-edit", { sectionId: s2.sectionId, editorAccountId: GABI }, PLAIN);
    const r4 = await call("request-section-edit", { sectionId: s.sectionId, reason: "again" }, PLAIN); // Gabriela's held seal — PLAIN already asked on it above (pending), so "already pending"; a fresh ask would open as a PROPOSAL (SEC-2 (e))
    console.log("### held refusals for the non-steward owner:", JSON.stringify({ r1, r2, r3, r4 }));
    expect(r1?.success).toBe(false); expect(r1?.reason).toBe(HELD);
    expect(r2?.success).toBe(false); expect(r2?.reason).toBe(HELD);
    expect(r3?.success).toBe(false); expect(r3?.reason).toBe(HELD);
    expect(r4?.success).toBe(false); expect(String(r4?.reason)).toBe("Request already pending");
    expect(await getKvs(`section-protection-${s2.sectionId}`), "the held record is untouched").toMatchObject({ workflowHeld: held.workflowHeld, expiresAt: null });
    // hand back, then the non-steward owner can release his own again
    const t = await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI);
    expect(t?.success).toBe(true);
    const rel2 = await call("unseal-section", { sectionId: s2.sectionId }, PLAIN);
    expect(rel2?.success, "handed back — the owner releases").toBe(true);
    sealed.splice(sealed.findIndex((x) => x.id === s2.sectionId), 1);
  } finally {
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    for (const x of sealed) await call("unseal-section", { sectionId: x.id, reason: "harness cleanup" }, x.owner === PLAIN ? PLAIN : MIHAI).catch(() => {});
    await bed.restore();
  }
});

test("WF-10: the two 'Only a space admin can move a page…' sentences, provoked by a real editor", async () => {
  // approvers: [] → an enforce target with no approvers is the steward's alone
  const bed = await setupWorkflowPage("plain-wf10", { body: BODY, space: S, approvers: [] });
  const P = bed.pageId;
  try {
    const t1 = await call("request-transition", { pageId: P, toStateId: "in_review" }, PLAIN);
    expect(t1?.success, `PLAIN moves Draft → In review (a non-enforce target: anyone who can edit) (${JSON.stringify(t1).slice(0, 120)})`).toBe(true);
    const into = await call("request-transition", { pageId: P, toStateId: "approved" }, PLAIN);
    console.log("### PLAIN into Approved:", JSON.stringify(into));
    expect(into?.success).toBe(false);
    expect(into?.reason).toBe("Only a space admin can move a page into Approved when no approvers are set");
    const intoM = await call("request-transition", { pageId: P, toStateId: "approved" }, MIHAI);
    expect(intoM?.success, `the steward's move goes through (${JSON.stringify(intoM).slice(0, 120)})`).toBe(true);
    expect((await getKvs(`workflow-state-${P}`))?.stateId).toBe("approved");
    const out = await call("request-transition", { pageId: P, toStateId: "draft" }, PLAIN);
    console.log("### PLAIN out of Approved:", JSON.stringify(out));
    expect(out?.success).toBe(false);
    expect(out?.reason).toBe("Only a space admin can move a page out of Approved");
    expect((await getKvs(`workflow-state-${P}`))?.stateId, "the page stayed Approved").toBe("approved");
    const outM = await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI);
    expect(outM?.success).toBe(true);
  } finally {
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    await bed.restore();
  }
});

test("WF-2 REVERT: a real non-privileged editor's publish on an Approved page is reverted, announced to that editor, and the editor can read the dispatch", async () => {
  const bed = await setupWorkflowPage("plain-wf2-revert", { body: BODY, space: S, enforceMode: "revert" });
  const P = bed.pageId;
  const originalNotifs = await getKvs("recent-notifications");
  try {
    const t1 = await inv("transitionWorkflow", { pageId: P, spaceKey: S, to: "in_review", actor: PLAIN, actorName: "Plain Editor" });
    expect(t1.result?.success).toBe(true);
    const t2 = await inv("transitionWorkflow", { pageId: P, spaceKey: S, to: "approved", actor: MIHAI, actorName: "Mihai Perdum", approvers: MIHAI, approvedVersion: "1" });
    expect(t2.result?.success, `to approved (${JSON.stringify(t2.result).slice(0, 120)})`).toBe(true);
    // LIMIT, stated: the harness holds one token (Mihai's), so v2 is authored by Mihai over REST and
    // the pipeline is told PLAIN published it (hook `pageEvent`). The decision, the revert write, the
    // dispatch and the comment are the real code path with a real non-privileged account.
    const before = await readPage(P);
    const adf = before.adf;
    adf.content.push(paragraph("PLAIN ADDED THIS WITHOUT APPROVAL"));
    await writeAdf(P, adf, { message: "an unapproved edit" });
    const v2 = (await readPage(P)).version;
    expect(v2).toBe(before.version + 1);
    const dec = await inv("enforceDecision", { pageId: P, actor: PLAIN, eventVersion: String(v2) });
    console.log("### decision for PLAIN:", JSON.stringify(dec.result));
    expect(dec.result?.action, "revert mode: PLAIN's edit is to be reverted").toBe("revert");
    // now the whole pipeline, as if PLAIN had published v2
    await inv("pageEvent", { pageId: P, actor: PLAIN, version: String(v2) });
    await expect.poll(async () => (await readPage(P)).version, { timeout: 60_000, message: "the app wrote the revert (v3)" }).toBe(v2 + 1);
    const after = await readPage(P);
    expect(JSON.stringify(after.adf), "the unapproved text is gone").not.toContain("PLAIN ADDED THIS WITHOUT APPROVAL");
    const wf = await getKvs(`workflow-state-${P}`);
    expect(wf.stateId, "still Approved").toBe("approved");
    expect(wf.approvedVersion, "the baseline follows the restore write").toBe(v2 + 1);
    // the editor reads his own dispatch through the gated resolver (a real account can read the page)
    const rd = await call("recent-dispatches", { pageId: P }, PLAIN);
    const mine = (rd?.notifications || []).filter((n: any) => n.editorAccountId === PLAIN);
    console.log("### PLAIN's dispatches:", JSON.stringify(mine));
    expect(mine.length, "PLAIN sees his enforcement dispatch").toBeGreaterThan(0);
    expect(mine[0]?.type).toBe("workflow-reverted");
    expect(mine[0]?.revertedVersion, "…naming the version his text lives at").toBe(v2);
    const bodies = (await getComments(P)).map((c: any) => String(c.body?.storage?.value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
    console.log("### comments:", JSON.stringify(bodies));
    expect(bodies.some((b: string) => /reverted/i.test(b) && /approved/i.test(b)), "the editor's comment is on the page").toBe(true);
  } finally {
    if (originalNotifs) await inv("set", { key: "recent-notifications", value: JSON.stringify(originalNotifs) }).catch(() => {});
    await call("request-transition", { pageId: P, toStateId: "draft" }, MIHAI).catch(() => {});
    await bed.restore();
  }
});
