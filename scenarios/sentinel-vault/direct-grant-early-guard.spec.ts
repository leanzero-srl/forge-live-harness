// Tester report 2026-09-17 (Gabriela, leanzero-demo): (1) a declined edit request was a 48-hour
// dead end — no re-request, and the sealer could not simply GIVE the permission; (2) text typed
// into a sealed section stayed for 20–25 minutes, then vanished with no word to the editor.
//
// This spec proves the three fixes on the deployed build with REAL identities (Mihai = the API
// actor and seal owner where an owner is needed; Gabriela = the real second person):
//   A. the cooldown is the site setting (default 1h, 0 = none), never 48h, and says WHEN;
//   B. grant-edit-access / grant-section-edit — and above all their REFUSALS;
//   C. guard-page-now restores a tampered sealed section WITHOUT waiting for the page event,
//      names the section, and the editor gets a comment that links the version with their text.
// @covers resolver:grant-edit-access resolver:grant-section-edit resolver:search-grantees resolver:guard-page-now
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, readPage, writeAdf, deletePage, getComments } from "../../data/confluence.mjs";
// @ts-ignore
import { buildBodiedExtensionNode, paragraph, heading, hashAdf } from "../../data/adf.mjs";
// @ts-ignore
import { request, post } from "../../data/jira.mjs";

const SENTINEL_APP = "ari:cloud:ecosystem::app/c30bf71e-4287-4872-954d-db49cc68f0ff";
const SENTINEL_ENV = process.env.SENTINEL_ENV_ID || "17516615-12ef-4790-8ce2-29151b7ee9ac";
const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const PRIV_SPACE = "SVSEC1P";
const PAGE = process.env.SV_PAGE_ID || "265912321";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";
const LZ = "712020:cecf4c53-ae66-45ff-b4b0-de6e2a18a71b";
const SYNTH = "sv-grant-synthetic-actor";

const call = async (key: string, actor: string, payload: Record<string, any> = {}) =>
  (await getTestState("sentinel-vault", { what: "invoke", fn: "invoke", key, actor, payload: JSON.stringify(payload) })).result;
const hookFn = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const sectionNode = (sectionId: string, body: any[]) =>
  buildBodiedExtensionNode(SENTINEL_APP, SENTINEL_ENV, "sentinel-vault-sealed-section", { params: { sectionId }, content: body as any });
const inDays = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();

test.describe.configure({ timeout: 300_000, retries: 1 });

// The global settings record is SHARED: read it, merge, and put the exact original back.
let originalGlobal: any = null;
const withGlobal = async (patch: Record<string, any>) => setKvs("admin-settings-global", { ...(originalGlobal || {}), ...patch });
test.beforeAll(async () => { originalGlobal = (await getKvs("admin-settings-global")) || null; });
test.afterAll(async () => {
  if (originalGlobal) await setKvs("admin-settings-global", originalGlobal); else await delKvs("admin-settings-global");
});

test("A+B: a declined request is not a dead end — shorter cooldown that says when, and the sealer can give access (refusals first)", async () => {
  const SEC = `sv-grant-sec-${Date.now()}`;
  const ATT = `att9${Date.now()}`; // no such attachment: these paths read the seal RECORD only
  const secSeal = `section-protection-${SEC}`, attSeal = `protection-${ATT}`;
  const keys = [secSeal, attSeal,
    ...[GABI, LZ, MIHAI, SYNTH].flatMap((a) => [`section-edit-request-${SEC}-${a}`, `section-edit-grant-${SEC}-${a}`, `edit-request-${ATT}-${a}`, `edit-grant-${ATT}-${a}`,
      `sectionreq-owner-${MIHAI}-${SEC}-${a}`, `editreq-owner-${MIHAI}-${ATT}-${a}`])];
  try {
    await withGlobal({ editRequestCooldownHours: undefined }); // the never-saved default is what ships
    await setKvs(secSeal, { sectionId: SEC, lockedBy: MIHAI, lockedByName: "Mihai", sectionTitle: "Grant Test Section", pageId: PAGE, spaceKey: SPACE, expiresAt: inDays(7) });
    await setKvs(attSeal, { attachmentId: ATT, lockedBy: MIHAI, lockedByName: "Mihai", attachmentName: "grant-test.pdf", contentId: PAGE, spaceKey: SPACE, expiresAt: inDays(7) });

    // ── A. decline → the wait is ONE hour by default and the refusal says when ──
    expect((await call("request-section-edit", GABI, { sectionId: SEC, reason: "need to add the Q3 numbers" })).success, "Gabriela's request is accepted").toBe(true);
    expect((await call("deny-section-edit", MIHAI, { sectionId: SEC, requesterAccountId: GABI })).success, "Mihai declines").toBe(true);
    const again = await call("request-section-edit", GABI, { sectionId: SEC });
    expect(again.success, "asking again at once is still refused").toBe(false);
    const waitMin = (new Date(again.retryAt).getTime() - Date.now()) / 60000;
    console.log(`### declined → retryAt in ${waitMin.toFixed(1)} min; reason: ${again.reason}`);
    expect(waitMin, "the wait is ~1 hour, NOT 48").toBeGreaterThan(55);
    expect(waitMin, "the wait is ~1 hour, NOT 48").toBeLessThan(61);
    // SEC-8 (2026-09-20): the server refusal never formats a clock (the lambda is UTC) — it carries
    // `retryAt` and the surfaces compose the time in the viewer's zone; the other way out stays named.
    expect(String(again.reason), "the refusal says declined and names the other way out").toMatch(/declined.*give you access directly/i);
    expect(again.retryAt, "…and carries retryAt for the surfaces to format").toBeTruthy();
    const chk = await call("check-section-edit", GABI, { sectionId: SEC });
    expect([chk.status, !!chk.retryAt], "the status read carries retryAt for the row hint").toEqual(["denied", true]);
    const summary = await hookFn("pageDetailsSummary", { pageId: PAGE, actor: GABI });
    const row = (summary.result?.seals || summary.result?.rows || []).find?.((r: any) => r.id === SEC);
    console.log(`### page-details row for Gabriela: ${JSON.stringify(row ? { s: row.myEditStatus, r: row.myRetryAt } : "not listed (seeded seal has no macro on the page)")}`);

    // the same rule on the attachment path
    expect((await call("request-edit-access", GABI, { attachmentId: ATT })).success).toBe(true);
    expect((await call("deny-edit-request", MIHAI, { attachmentId: ATT, requesterAccountId: GABI })).success).toBe(true);
    const attAgain = await call("request-edit-access", GABI, { attachmentId: ATT });
    expect([attAgain.success, !!attAgain.retryAt], "attachment path: refused, with retryAt").toEqual([false, true]);

    // a site that sets 0 lets the person ask again at once
    await withGlobal({ editRequestCooldownHours: 0 });
    expect((await call("request-section-edit", GABI, { sectionId: SEC, reason: "second try" })).success, "cooldown 0 → the re-request goes through").toBe(true);
    expect((await call("deny-section-edit", MIHAI, { sectionId: SEC, requesterAccountId: GABI })).success).toBe(true);
    await withGlobal({ editRequestCooldownHours: 48 }); // the OLD behaviour, as a setting: Gabriela is locked out again…
    expect((await call("request-section-edit", GABI, { sectionId: SEC })).success, "48h configured → refused").toBe(false);

    // ── B. …and the sealer gives the permission anyway. REFUSALS FIRST. ──
    // Every real account on this site that can open the page is ALSO a space admin of WFH (probed
    // 2026-09-17: check-user-role → steward for Gabriela and LeanZero SRL), and a space admin may
    // grant exactly as they may approve. The non-owner refusal is therefore manufactured the way
    // steward-force-unseal does it: with "Allow space admins to force-unseal" OFF a space admin has
    // no authority over someone else's seal, so the SAME real person on the SAME seal is refused.
    await withGlobal({ editRequestCooldownHours: 48, allowAdminOverride: false });
    const refusals: [string, any][] = [
      ["the requester cannot grant herself", await call("grant-section-edit", GABI, { sectionId: SEC, editorAccountId: GABI })],
      ["a third person who is neither owner nor admin cannot grant", await call("grant-section-edit", LZ, { sectionId: SEC, editorAccountId: GABI })],
      ["an unresolvable account cannot be the grantee", await call("grant-section-edit", MIHAI, { sectionId: SEC, editorAccountId: SYNTH })],
      ["the owner is not a grantee", await call("grant-section-edit", MIHAI, { sectionId: SEC, editorAccountId: MIHAI })],
      ["no editor named", await call("grant-section-edit", MIHAI, { sectionId: SEC })],
      ["attachment: the requester cannot grant herself", await call("grant-edit-access", GABI, { attachmentId: ATT, editorAccountId: GABI })],
      ["attachment: unknown seal", await call("grant-edit-access", MIHAI, { attachmentId: "att000", editorAccountId: GABI })],
    ];
    for (const [name, r] of refusals) { console.log(`### refused — ${name}: ${r?.reason}`); expect(r?.success, name).toBe(false); }
    expect(await getKvs(`section-edit-grant-${SEC}-${GABI}`), "no refusal left a grant behind").toBeFalsy();
    expect(await getKvs(`section-edit-grant-${SEC}-${SYNTH}`), "no refusal left a grant behind (synthetic)").toBeFalsy();

    // search is the owner's, not the requester's
    const found = await call("search-grantees", MIHAI, { sectionId: SEC, query: "Gabriela" });
    console.log(`### search-grantees(Mihai,"Gabriela") → ${JSON.stringify((found.users || []).map((u: any) => u.displayName))}`);
    expect((found.users || []).some((u: any) => u.accountId === GABI), "the owner finds Gabriela by name").toBe(true);
    expect((found.users || []).some((u: any) => u.accountId === MIHAI), "the owner is never offered as a grantee").toBe(false);
    const notMine = await call("search-grantees", GABI, { sectionId: SEC, query: "Mihai" });
    expect([notMine.users?.length || 0, notMine.reason], "a non-owner gets no people list").toEqual([0, "Not authorized"]);

    // …and with the override back ON a space admin MAY give access on someone else's seal
    // (the same authority that lets them approve, revoke and force-release).
    await withGlobal({ editRequestCooldownHours: 48, allowAdminOverride: true });
    const byAdmin = await call("grant-section-edit", LZ, { sectionId: SEC, editorAccountId: GABI });
    expect(byAdmin.success, `a space admin gives access on Mihai's seal (${byAdmin.reason || "ok"})`).toBe(true);
    expect((await getKvs(`section-edit-grant-${SEC}-${GABI}`))?.grantedBy, "and the grant records WHO gave it").toBe(LZ);
    expect((await call("revoke-section-edit-grant", MIHAI, { sectionId: SEC, editorAccountId: GABI })).success).toBe(true);
    // put Gabriela back into the declined state the owner's grant below starts from
    await setKvs(`section-edit-request-${SEC}-${GABI}`, { sectionId: SEC, requesterAccountId: GABI, requesterName: "Gabriela Perdum", ownerAccountId: MIHAI, contentId: PAGE, spaceKey: SPACE, status: "denied", deniedAt: new Date().toISOString() });

    // the grant itself — while Gabriela's request stands DECLINED under a 48h cooldown
    const g = await call("grant-section-edit", MIHAI, { sectionId: SEC, editorAccountId: GABI });
    expect(g.success, `the owner gives Gabriela access (${g.reason || "ok"})`).toBe(true);
    const grant = await getKvs(`section-edit-grant-${SEC}-${GABI}`);
    expect([grant?.editorAccountId, grant?.grantedBy, grant?.direct, grant?.expiresAt === (await getKvs(secSeal)).expiresAt], "grant record: who, by whom, direct, ends with the seal").toEqual([GABI, MIHAI, true, true]);
    expect(grant?.editorName, "the grant names the person (not 'User')").toMatch(/Gabriela/i);
    expect(await getKvs(`section-edit-request-${SEC}-${GABI}`), "the declined request is consumed by the grant").toBeFalsy();
    expect((await call("check-section-edit", GABI, { sectionId: SEC })).status, "Gabriela now reads 'granted'").toBe("granted");
    expect((await call("revoke-section-edit-grant", MIHAI, { sectionId: SEC, editorAccountId: GABI })).success, "and it can be taken back").toBe(true);
    expect((await call("check-section-edit", GABI, { sectionId: SEC })).status, "after the revoke she is back to 'none' — free to ask again").toBe("none");

    const ga = await call("grant-edit-access", MIHAI, { attachmentId: ATT, editorAccountId: GABI });
    expect(ga.success, `attachment: the owner gives Gabriela access (${ga.reason || "ok"})`).toBe(true);
    expect((await call("check-edit-request", GABI, { attachmentId: ATT })).status).toBe("granted");

    // an expired seal: the grant would be born dead
    await setKvs(secSeal, { ...(await getKvs(secSeal)), expiresAt: new Date(Date.now() - 60_000).toISOString() });
    const dead = await call("grant-section-edit", MIHAI, { sectionId: SEC, editorAccountId: LZ });
    expect([dead.success, /lapsed/.test(String(dead.reason))], "expired seal → refused, told to extend").toEqual([false, true]);
  } finally {
    for (const k of keys) await delKvs(k).catch(() => {});
  }
});

test("B (the refusal that matters): nobody is given edit access on a page they cannot open", async () => {
  let privSpaceId = await spaceIdByKey(PRIV_SPACE);
  if (!privSpaceId) {
    await post("/wiki/rest/api/space/_private", { key: PRIV_SPACE, name: "SV-SEC-1 authz probe", description: { plain: { value: "Harness-owned. Private on purpose.", representation: "plain" } } });
    privSpaceId = await spaceIdByKey(PRIV_SPACE);
  }
  const page = await createPage({ spaceId: privSpaceId, title: `HARNESS grant priv ${Date.now()}`, adf: doc(paragraph("private")) });
  const SEC = `sv-grant-priv-${Date.now()}`;
  try {
    await setKvs(`section-protection-${SEC}`, { sectionId: SEC, lockedBy: MIHAI, sectionTitle: "Private", pageId: page.id, spaceKey: PRIV_SPACE, expiresAt: inDays(1) });
    // positive control ON THE SAME OBJECT: the gate can see this page for someone who has access
    const okMihaiReads = await call("section-seal-status", MIHAI, { sectionId: SEC });
    expect(okMihaiReads.sealed, "control: Mihai can read this seal on this page").toBe(true);
    const r = await call("grant-section-edit", MIHAI, { sectionId: SEC, editorAccountId: GABI });
    console.log(`### grant on a private-space page for Gabriela → ${JSON.stringify(r)}`);
    expect(r.success, "Gabriela has no access to SVSEC1P → the grant is REFUSED").toBe(false);
    expect(String(r.reason)).toMatch(/cannot open this page/i);
    expect(await getKvs(`section-edit-grant-${SEC}-${GABI}`), "and nothing was written").toBeFalsy();
  } finally {
    await delKvs(`section-protection-${SEC}`).catch(() => {});
    await delKvs(`section-edit-grant-${SEC}-${GABI}`).catch(() => {});
    await deletePage(page.id).catch(() => {});
  }
});

test("C: a tampered sealed section is put back on VIEW (no waiting for the page event), the section is named, the editor is told where their text is", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  // The editor notice is the carve-out: comments master OFF, its own switch at the default (ON).
  await withGlobal({ enableEmailDispatches: false, enableConfluenceDispatches: false, notifyEditorOnRevert: undefined, enableContentProtection: true });
  const OWNER = GABI; // Gabriela owns the seal, so MY (Mihai's) REST edit is the tamper
  let won = false;
  for (let attempt = 1; attempt <= 3 && !won; attempt++) {
    const sectionId = `harness-guard-${Date.now().toString(36)}`;
    const ORIGINAL = [paragraph("ORIGINAL SEALED BODY")];
    const contentHash = hashAdf(ORIGINAL);
    const wrapper = sectionNode(sectionId, ORIGINAL);
    const page = await createPage({ spaceId, title: `HARNESS early-guard ${Date.now()}`, adf: doc(heading("Doc", 2), wrapper, paragraph("footer")) });
    try {
      await setKvs(`section-protection-${sectionId}`, { sectionId, pageId: page.id, spaceKey: SPACE, lockedBy: OWNER, lockedByName: "Gabriela", contentHash, originalIndex: 1, sealedVersion: 1, sectionTitle: "Guarded", expiresAt: null });
      await setKvs(`section-snapshot-${sectionId}`, { wrapperNode: wrapper, bodyContent: ORIGINAL, hash: contentHash, version: 1, originalIndex: 1 });
      await request("POST", `/wiki/api/v2/pages/${page.id}/properties`, { raw: true, body: { key: "section-protection-", value: [{ sectionId, lockedBy: OWNER, expiresAt: null }] } });
      // Judge v1 first (the created-page event may or may not have come): the marker then sits at v1.
      const first = await call("guard-page-now", MIHAI, { pageId: page.id });
      console.log(`### attempt ${attempt}: clean page judged → ${JSON.stringify(first)}`);
      expect(first.restored, "a clean page is never 'restored'").toBe(false);

      await writeAdf(page.id, doc(heading("Doc", 2), sectionNode(sectionId, [paragraph("TEXT I TYPED INTO THE SEALED SECTION")]), paragraph("footer")));
      const tamperV = (await readPage(page.id)).version;
      const t0 = Date.now();
      const g = await call("guard-page-now", MIHAI, { pageId: page.id }); // what the macro / ribbon call on view
      const ms = Date.now() - t0;
      console.log(`### attempt ${attempt}: guard-page-now after the tamper (v${tamperV}) → ${JSON.stringify(g)} in ${ms} ms`);
      if (!g.restored) { console.log("### the real page event beat the guard this time — trying again with a fresh page"); continue; }
      won = true;

      expect(g.mine, "it was MY version that was undone").toBe(true);
      expect(g.revertedVersion, "the version holding my text is named").toBe(tamperV);
      expect(g.sectionIds, "the section that was put back is named").toContain(sectionId);
      expect(ms, "restored inside one resolver call, not 20 minutes later").toBeLessThan(25_000);
      const after = await readPage(page.id);
      const text = JSON.stringify(after.adf);
      expect([after.version, text.includes("ORIGINAL SEALED BODY"), text.includes("TEXT I TYPED")], "page: next version, sealed body back, my text gone").toEqual([tamperV + 1, true, false]);
      const mine = await readPage(page.id); void mine;
      const old = await request("GET", `/wiki/api/v2/pages/${page.id}?version=${tamperV}&body-format=atlas_doc_format`, { raw: true }).catch(() => null);
      console.log(`### version ${tamperV} still readable: ${old ? "yes" : "n/a"}`);

      // a sibling macro on the same page (second caller) is told the same thing, once
      const echo = await call("guard-page-now", GABI, { pageId: page.id });
      expect([echo.restored, echo.mine, echo.sectionIds?.includes(sectionId)], "second caller: told what was restored, and that it was not THEIR edit").toEqual([true, false, true]);

      // the ribbon record carries the version for 'See my version'
      const recent = await getKvs("recent-notifications");
      const ev = (recent?.events || []).find((e: any) => e.sectionId === sectionId);
      expect([ev?.type, ev?.editorAccountId, ev?.ownerAccountId, ev?.revertedVersion], "dispatch: section-reverted, editor, owner, my version").toEqual(["section-reverted", MIHAI, OWNER, tamperV]);

      // the editor's own comment, with the master switch OFF
      let comment = "";
      for (let i = 0; i < 10 && !comment; i++) {
        const cs = await getComments(page.id);
        comment = (cs || []).map((c: any) => JSON.stringify(c)).find((c: string) => /Your change was undone/.test(c)) || "";
        if (!comment) await new Promise((r) => setTimeout(r, 2000));
      }
      console.log(`### editor comment: ${comment.slice(0, 700)}`);
      expect(comment, "the editor was told, although page comments are switched off site-wide").toBeTruthy();
      expect(comment, "addressed to the editor").toContain(MIHAI);
      expect(comment, "links the exact version with their text").toContain(`pageVersion=${tamperV}`);
      expect(comment, "says how to get access").toMatch(/Request edit/);

      // the late real event must now be a no-op: nothing moves in the next 40 s
      await new Promise((r) => setTimeout(r, 40_000));
      const settled = await readPage(page.id);
      expect([settled.version, JSON.stringify(settled.adf).includes("ORIGINAL SEALED BODY")], "no second restore / no version churn when the real event lands").toEqual([tamperV + 1, true]);
      const cs2 = ((await getComments(page.id)) || []).filter((c: any) => /Your change was undone/.test(JSON.stringify(c)));
      expect(cs2.length, "exactly ONE editor comment").toBe(1);
    } finally {
      await delKvs(`section-protection-${sectionId}`).catch(() => {});
      await delKvs(`section-snapshot-${sectionId}`).catch(() => {});
      await delKvs(`page-guard-${page.id}`).catch(() => {});
      await deletePage(page.id).catch(() => {});
    }
  }
  expect(won, "in three tries the guard restored the page before its event at least once").toBe(true);
});

test("C (its switch): notifyEditorOnRevert OFF → restored all the same, and NO comment", async () => {
  const spaceId = await spaceIdByKey(SPACE);
  await withGlobal({ enableEmailDispatches: false, enableConfluenceDispatches: false, notifyEditorOnRevert: false, enableContentProtection: true });
  const sectionId = `harness-guard-off-${Date.now().toString(36)}`;
  const ORIGINAL = [paragraph("ORIGINAL SEALED BODY")];
  const wrapper = sectionNode(sectionId, ORIGINAL);
  const page = await createPage({ spaceId, title: `HARNESS early-guard quiet ${Date.now()}`, adf: doc(heading("Doc", 2), wrapper, paragraph("footer")) });
  try {
    await setKvs(`section-protection-${sectionId}`, { sectionId, pageId: page.id, spaceKey: SPACE, lockedBy: GABI, contentHash: hashAdf(ORIGINAL), originalIndex: 1, sealedVersion: 1, sectionTitle: "Guarded", expiresAt: null });
    await setKvs(`section-snapshot-${sectionId}`, { wrapperNode: wrapper, bodyContent: ORIGINAL, hash: hashAdf(ORIGINAL), version: 1, originalIndex: 1 });
    await request("POST", `/wiki/api/v2/pages/${page.id}/properties`, { raw: true, body: { key: "section-protection-", value: [{ sectionId, lockedBy: GABI, expiresAt: null }] } });
    await writeAdf(page.id, doc(heading("Doc", 2), sectionNode(sectionId, [paragraph("TAMPER")]), paragraph("footer")));
    // the SWEEP this time (what runs every five minutes when nobody opens the page)
    const sweep = await hookFn("pageGuardSweep");
    console.log(`### pageGuardSweep → ${JSON.stringify(sweep.result)}`);
    let ok = false;
    for (let i = 0; i < 20 && !ok; i++) {
      const p = await readPage(page.id);
      ok = JSON.stringify(p.adf).includes("ORIGINAL SEALED BODY") && !JSON.stringify(p.adf).includes("TAMPER");
      if (!ok) { await new Promise((r) => setTimeout(r, 3000)); if (i === 6) await hookFn("guardPageNow", { pageId: page.id }); }
    }
    expect(ok, "the page is restored").toBe(true);
    await new Promise((r) => setTimeout(r, 8000));
    const cs = ((await getComments(page.id)) || []).filter((c: any) => /Sentinel Vault/.test(JSON.stringify(c)));
    expect(cs.length, "its switch is OFF and the master is OFF → the app posted nothing").toBe(0);
  } finally {
    await delKvs(`section-protection-${sectionId}`).catch(() => {});
    await delKvs(`section-snapshot-${sectionId}`).catch(() => {});
    await delKvs(`page-guard-${page.id}`).catch(() => {});
    await deletePage(page.id).catch(() => {});
  }
});
