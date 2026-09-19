// SEC-9 (UX critique 2026-09-19). Before the fix the section request / approve / decline notices
// went through the attachment layouts: the owner read "… is requesting permission to edit your
// sealed FILE "Decisions"", was sent to "the space console (Edit Requests)" (which has no section
// requests), and the requester read "You can edit this FILE until the seal expires". After the fix
// the three layouts take `targetKind` and say "section" for a section, the CTA names the panel, the
// byline and My work, and a decline carries the owner's word (SEC-8). Proven on the LIVE comments the
// app posts (the comment master switched on for the run and restored). FAILS before, PASSES after.
import { test, expect } from "../../fixtures/forge";
import { setupWorkflowPage, inv, getKvs, setKvs, delKvs, strip, MIHAI, GABI } from "./_wf";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
// @ts-ignore
import { getComments } from "../../data/confluence.mjs";

test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Decisions", 2), paragraph("What we decided.")];
const GLOBAL = "admin-settings-global";

async function commentsMatching(P: string, re: RegExp, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const decode = (t: string) => t.replace(/&quot;/g, '"').replace(/&mdash;/g, "—").replace(/&amp;/g, "&");
    const bodies = (await getComments(P)).map((c: any) => decode(strip(c.body?.storage?.value || "")));
    const hit = bodies.find((b: string) => re.test(b));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return null;
}

test("SEC-9 server: the request, decline and approve comments on a SECTION say section, point at My work, and carry the owner's word", async () => {
  const bed = await setupWorkflowPage("sec9-notices", { body: BODY });
  const P = bed.pageId;
  const before = await getKvs(GLOBAL);
  let sectionId: string | null = null;
  try {
    // the comment channel is opt-in since 4.7 — on for this run
    await setKvs(GLOBAL, { ...(before || {}), enableEmailDispatches: true, enableConfluenceDispatches: true });
    const hs = await call("list-page-headings", { pageId: P }, GABI);
    const dec = (hs?.headings || []).find((h: any) => h.text === "Decisions");
    const s = await call("seal-section", { pageId: P, headingIndex: dec.index, headingText: "Decisions", lockDuration: 2 * 86400 }, GABI);
    expect(s?.success, `Gabriela seals (${JSON.stringify(s).slice(0, 160)})`).toBe(true);
    sectionId = s.sectionId;

    // ── request: the owner's comment ─────────────────────────────────────────────────────────
    const rq = await call("request-section-edit", { sectionId, reason: "need to add a decision" }, MIHAI);
    expect(rq?.success, `request (${JSON.stringify(rq).slice(0, 120)})`).toBe(true);
    const reqComment = await commentsMatching(P, /Edit Access Requested/);
    console.log("### request comment:", reqComment);
    expect(reqComment, "the request comment was posted").toBeTruthy();
    expect(reqComment!).toMatch(/your sealed section "Decisions"/);
    expect(reqComment!).not.toMatch(/sealed file/);
    expect(reqComment!).toMatch(/My work/);
    expect(reqComment!).not.toMatch(/space console/);
    expect(reqComment!).toMatch(/Approve or decline/);

    // ── decline with a word: the requester's comment ─────────────────────────────────────────
    const dn = await call("deny-section-edit", { sectionId, requesterAccountId: MIHAI, reason: "not during the freeze" }, GABI);
    expect(dn?.success).toBe(true);
    const denyComment = await commentsMatching(P, /Edit Access Declined/);
    console.log("### decline comment:", denyComment);
    expect(denyComment, "the decline comment was posted").toBeTruthy();
    expect(denyComment!).toMatch(/sealed section "Decisions"/);
    expect(denyComment!).toMatch(/The owner said: "not during the freeze"/);
    expect(denyComment!).not.toMatch(/\bfile\b/);

    // ── approve (direct grant): the requester's comment ──────────────────────────────────────
    const g = await call("grant-section-edit", { sectionId, editorAccountId: MIHAI }, GABI);
    expect(g?.success, `grant (${JSON.stringify(g).slice(0, 120)})`).toBe(true);
    const okComment = await commentsMatching(P, /Edit Access Granted/);
    console.log("### granted comment:", okComment);
    expect(okComment, "the granted comment was posted").toBeTruthy();
    expect(okComment!).toMatch(/sealed section "Decisions"/);
    expect(okComment!).toMatch(/edit this section until the seal expires/);
    expect(okComment!).not.toMatch(/\bfile\b/);
  } finally {
    if (before == null) await delKvs(GLOBAL).catch(() => {}); else await setKvs(GLOBAL, before);
    if (sectionId) await call("unseal-section", { sectionId }, GABI).catch(() => {});
    await bed.restore();
  }
});
