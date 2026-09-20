// SEC-4 (a) (UX critique 2026-09-19, done 2026-09-20): SEAL ON INSERT. Inserting the Sealed
// Section macro and publishing used to leave a wrapper with no seal — the badge said "Not sealed
// yet" and the panel was a second step. After the fix the macro's Insert leaves a marker
// (section-insert-pending-{pageId}, 48 h) and the publish's page-content trigger — or the
// view-time guard, whichever runs first — adopts the wrapper: a seal record for the person who
// published, the snapshot, the space index row, activity section.sealed (adoptedOnInsert), and the
// app-issued sectionId stamped onto the node in the same write. Timing: inserted but never
// published → no event → no record; the marker expires. Server-only through the hook (the page
// version is authored by the harness token; `pageEvent` names the publisher). FAILS before
// (no record, the wrapper stays unstamped), PASSES after.
import { test, expect } from "../../fixtures/forge";
import { setupWorkflowPage, inv, getKvs, delKvs, MIHAI, GABI } from "./_wf";
import { getTarget } from "../../config/targets";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";
// @ts-ignore
import { readPage, writeAdf } from "../../data/confluence.mjs";

test.describe.configure({ timeout: 900_000 });
const call = async (key: string, payload: any, actor = MIHAI) => (await inv("invoke", { key, payload: JSON.stringify(payload), actor })).result;
const BODY = [heading("Scope", 2), paragraph("What is in and out."), heading("Decisions", 2), paragraph("What we decided.")];

/** A Sealed Section wrapper exactly as the editor inserts it: empty config, no sectionId. */
function bareWrapper(body: any[]) {
  const T = getTarget("sentinel-vault-realm");
  const uuid = String(T.appId).replace(/^ari:cloud:ecosystem::app\//, "");
  const extensionKey = `${uuid}/${T.envId}/static/sentinel-vault-sealed-section`;
  return { type: "bodiedExtension", attrs: { extensionType: "com.atlassian.ecosystem", extensionKey, layout: "default", parameters: { extensionId: `ari:cloud:ecosystem::extension/${extensionKey}`, extensionTitle: "Sentinel Vault Sealed Section" } }, content: body };
}
const sectionIdOf = (n: any) => n?.attrs?.parameters?.guestParams?.sectionId || null;

test("SEC-4 (a): insert → publish seals the section to the publisher (the REAL page event); the wrapper is stamped; no marker + no seals → untouched; the view guard adopts once the marker is there", async () => {
  const bed = await setupWorkflowPage("sec4a-insert", { body: BODY });
  const P = bed.pageId;
  const sealed: string[] = [];
  try {
    // ── the macro's Insert: the marker ────────────────────────────────────────────────────────
    const intent = await call("section-insert-intent", { pageId: P }, MIHAI);
    expect(intent?.success, `the insert intent is recorded (${JSON.stringify(intent)})`).toBe(true);
    expect((await getKvs(`section-insert-pending-${P}`))?.by).toBe(MIHAI);
    // ── publish: the page carries a bare wrapper around "Risks". Confluence fires the page event
    //    for this write (authored by the harness user), and THAT event is what adopts. ──────────
    const p0 = await readPage(P);
    const adf = p0.adf;
    adf.content.splice(2, 0, bareWrapper([heading("Risks", 2), paragraph("The risks we accept.")]));
    await writeAdf(P, adf, { message: "insert a sealed section from the editor" });
    const v2 = (await readPage(P)).version;
    expect(v2).toBe(p0.version + 1);
    expect(sectionIdOf((await readPage(P)).adf.content[2]), "before the event: no id on the wrapper").toBeNull();
    // ── adopted by the event ─────────────────────────────────────────────────────────────────
    await expect.poll(async () => (await readPage(P)).version, { timeout: 240_000, intervals: [3000], message: "the page event wrote the stamped wrapper (v3)" }).toBe(v2 + 1);
    const p3 = await readPage(P);
    const wrap = (p3.adf.content || []).find((n: any) => n.type === "bodiedExtension");
    const sid = sectionIdOf(wrap);
    console.log("### stamped sectionId:", sid, "page v", p3.version, "author", p3.page?.version?.authorId?.slice(-6));
    expect(sid, "the wrapper carries the app-issued id now").toBeTruthy();
    sealed.push(sid);
    const rec = await getKvs(`section-protection-${sid}`);
    console.log("### record:", JSON.stringify({ lockedBy: rec?.lockedBy, sectionTitle: rec?.sectionTitle, expiresAt: rec?.expiresAt, adoptedOnInsert: rec?.adoptedOnInsert, lockDuration: rec?.lockDuration }));
    expect(rec?.lockedBy, "sealed to the person who published (the version's author)").toBe(MIHAI);
    expect(rec?.sectionTitle).toBe("Risks");
    expect(rec?.adoptedOnInsert).toBe(true);
    expect(rec?.lockDuration, "the space's default hold").toBeGreaterThan(0);
    expect(new Date(rec?.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect((await getKvs(`section-snapshot-${sid}`))?.hash, "the snapshot is the sealed body").toBe(rec.contentHash);
    if (rec.spaceId) expect(await getKvs(`space-section-protection-${rec.spaceId}-${sid}`), "the space index row").toBeTruthy();
    expect(await getKvs(`section-insert-pending-${P}`), "the marker is consumed").toBeNull();
    // exactly ONE record for the page (the event and the guard never both adopt)
    await new Promise((r) => setTimeout(r, 10_000));
    const rows = await call("enumerate-section-seals", { pageId: P }, MIHAI);
    expect((rows?.sections || []).map((r: any) => [r.sectionTitle, r.isMine]), "the panel row lists it as mine, once").toEqual([["Risks", true]]);
    expect((await readPage(P)).version, "one app write, no second adopter").toBe(v2 + 1);
    const act = await call("get-page-activity", { pageId: P, limit: 8 });
    const e = (act?.entries || []).find((x: any) => x.type === "section.sealed");
    expect(e?.details?.adoptedOnInsert, "the trail says it was sealed on insert").toBe(true);
    expect(e?.actor?.accountId).toBe(MIHAI);
    const status = await call("section-seal-status", { sectionId: sid }, MIHAI);
    expect(status?.sealed && status?.isMine, "the macro's badge would read Sealed by you").toBe(true);

    // ── timing: a wrapper published on a page with NO marker and NO seal is not touched ──────
    const bed2 = await setupWorkflowPage("sec4a-nomarker", { body: BODY });
    try {
      const q0 = await readPage(bed2.pageId);
      q0.adf.content.splice(2, 0, bareWrapper([heading("Loose", 2), paragraph("no marker, no seal")]));
      await writeAdf(bed2.pageId, q0.adf, { message: "a wrapper with no intent" });
      const qv = (await readPage(bed2.pageId)).version;
      const g0 = await inv("guardPageNow", { pageId: bed2.pageId });
      console.log("### guardPageNow (no marker):", JSON.stringify(g0.result));
      expect(g0.result?.adoptedOnPublish).toBeFalsy();
      const q1 = await readPage(bed2.pageId);
      expect(q1.version, "no app write").toBe(qv);
      expect(sectionIdOf(q1.adf.content[2]), "…and no id on the wrapper").toBeNull();
      expect((await call("enumerate-section-seals", { pageId: bed2.pageId }))?.sections?.length ?? 0).toBe(0);
      // ── the view-time guard adopts too, once the marker is there (a new version to judge) ────
      await call("section-insert-intent", { pageId: bed2.pageId }, GABI);
      const q1b = await readPage(bed2.pageId);
      q1b.adf.content.push(paragraph("published again"));
      await writeAdf(bed2.pageId, q1b.adf, { message: "publish" });
      const g = await inv("guardPageNow", { pageId: bed2.pageId });
      console.log("### guardPageNow (marker):", JSON.stringify(g.result));
      expect(g.result?.adoptedOnPublish, "the guard reports the adoption to the macro").toBe(true);
      const q2 = await readPage(bed2.pageId);
      const sid2 = sectionIdOf(q2.adf.content.find((n: any) => n.type === "bodiedExtension"));
      expect(sid2).toBeTruthy();
      expect((await getKvs(`section-protection-${sid2}`))?.lockedBy, "sealed to the live version's author (the harness user)").toBe(MIHAI);
      await call("unseal-section", { sectionId: sid2 }, MIHAI).catch(() => {});
    } finally {
      await delKvs(`section-insert-pending-${bed2.pageId}`).catch(() => {});
      await bed2.restore();
    }
  } finally {
    for (const id of sealed) await call("unseal-section", { sectionId: id, reason: "harness cleanup" }, MIHAI).catch(() => {});
    await delKvs(`section-insert-pending-${P}`).catch(() => {});
    await bed.restore();
  }
});
