// SV-SEC-1 — LIVE-HARNESS authorization coverage for `sealSection`. Checklist box 3.
//
// The defect was NOT "sealing is broken". It was that `sealSection` took a CALLER-SUPPLIED pageId
// and then wrote to that page with the app's elevated authority (writeDocBody -> asApp), with no
// check that the caller was entitled to the target page. So the only test that means anything here
// is the NEGATIVE one: an unentitled caller must be REFUSED, and nothing must be written.
//
// Identity mechanism — REUSED, not invented. There is no second browser login and no second
// storageState in this harness. Every negative-permission spec here (destructive-actions-perm,
// realm-plainuser-gate, steward-force-unseal, page-editrequest-*) drives the resolver through the
// dev `_testState` webtrigger, whose `actor` query param becomes `req.context.accountId` verbatim.
// This spec does the same. No browser is opened; `npm run auth` is not required. It needs the
// testhook (SENTINEL_TESTHOOK_URL + HARNESS_SECRET) and REST creds (JIRA_API_TOKEN).
//
// Run: npx playwright test --project=chromium scenarios/sentinel-vault/page-section-seal-authz.spec.ts
//
// ── WHAT MAKES THIS SPEC ABLE TO GO RED ──────────────────────────────────────────────────────────
// Test A goes red if `sealSection` accepts a caller Confluence does not know (the pre-fix
//   behaviour: it returned success:true and PUT the page — that is precisely SV-SEC-1), or if it
//   refuses for a reason OTHER than entitlement (input validation, an unresolvable realm, an
//   indeterminate probe). A gate that fails closed for everybody fails test A's step 5.
// Test B goes red if a REAL, licensed account that Confluence itself says CANNOT update the page
//   is nonetheless allowed to seal it — or, in the other direction, if a real account that
//   Confluence says CAN update the page is refused (over-tightening).
// Neither negative is trivially true: each is bracketed by a positive control taken on the SAME
// page through the SAME code path, so a broken testhook, a wrong pageId or a gate that denies
// everyone cannot masquerade as a pass.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore - plain ESM JS helper
import { spaceIdByKey, createPage, readPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore - plain ESM JS helper
import { request, sleep } from "../../data/jira.mjs";
// @ts-ignore - plain ESM JS helper
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";

// A REAL account with edit rights on SPACE. This is the harness's own admin identity
// (JIRA_ADMIN_EMAIL), so the REST teardown can always delete the pages it creates.
const ENTITLED = process.env.SENTINEL_TEST_ACCOUNT_ID || "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";

// Syntactically valid, belongs to nobody on this tenant. Confluence answers 404 "No user with id"
// for it — verified live against /wiki/rest/api/content/{id}/permission/check on 2026-08-27.
// That is a NON-ANSWER about entitlement, and page-access.js deliberately keeps it distinct from a
// denial (PROBE_NO_SUBJECT) while still refusing. See the honesty note on test B: this actor proves
// the ungated privileged write is closed, it does NOT prove the gate discriminates between real
// accounts. Test B is the one that proves that.
const UNKNOWN_SUBJECT = "712020:00000000-0000-0000-0000-0000deadbeef";

// Optional: a REAL account on the tenant for the strong negative. If unset, test B discovers one.
const SUPPLIED_UNENTITLED = process.env.SENTINEL_TEST_UNENTITLED_ACCOUNT_ID || "";

const inv = (fn: string, p: Record<string, string>) =>
  getTestState("sentinel-vault", { what: "invoke", fn, ...p });
const getKvs = async (k: string) => (await getTestState("sentinel-vault", { what: "kvs", key: k })).value;
const setKvs = (k: string, v: any) => getTestState("sentinel-vault", { what: "set", key: k, value: JSON.stringify(v) });
const delKvs = (k: string) => getTestState("sentinel-vault", { what: "delete", key: k });

// The testhook's `query` seam returns { prefix, keys } — KEYS ONLY, no values. Filtering
// `results[].value.pageId` here would filter an always-empty array and pass vacuously.
// It is also EVENTUALLY CONSISTENT (the seam says so), which is why it is only ever used as a
// SUPPLEMENTARY check below: the load-bearing proof that nothing was written is the page ADF and
// version, both of which are immediately consistent.
const sealKeys = async (): Promise<string[]> =>
  (await getTestState("sentinel-vault", { what: "query", prefix: "section-protection-" })).keys || [];

const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const isSealedWrap = (n: any) =>
  n.type === "bodiedExtension" && /sealed-section/i.test(String(n.attrs?.extensionKey || ""));

// The gate's own denial string (shared/page-access.js -> guardPageWrite).
const DENIED_RE = /you do not have permission to edit this page/i;
// Every OTHER refusal `sealSection` can emit. A test that accepted any of these would be green
// while the entitlement gate was never reached — the classic false negative.
const WRONG_REASON_RE =
  /missing pageid|invalid headingindex|invalid pageid|could not identify you|could not verify|page mismatch|section not found|page changed|already sealed|write failed|version conflict|section macro key/i;

/** Assert a refusal is an ENTITLEMENT refusal, not any of the other ways sealSection can say no. */
function expectEntitlementRefusal(result: any, label: string) {
  expect(result?.success, `${label}: refused (got success=${result?.success}, reason=${result?.reason})`).toBe(false);
  expect(String(result?.reason), `${label}: refused by the ENTITLEMENT gate`).toMatch(DENIED_RE);
  expect(String(result?.reason), `${label}: NOT refused for some unrelated reason`).not.toMatch(WRONG_REASON_RE);
  expect(result?.sectionId, `${label}: no sectionId handed out`).toBeFalsy();
}

/** Admin-authenticated (NOT asApp) content-permission probe — an INDEPENDENT authority on whether
 *  an account may update a page. Used to source ground truth for test B, never to test the app. */
async function adminMayUpdate(pageId: string, accountId: string): Promise<{ status: number; hasPermission: boolean | null }> {
  const res = await request("POST", `/wiki/rest/api/content/${pageId}/permission/check`, {
    raw: true,
    body: { subject: { type: "user", identifier: accountId }, operation: "update" },
  });
  if (res.status !== 200) return { status: res.status, hasPermission: null };
  let d: any = null;
  try { d = JSON.parse(res.text); } catch { return { status: res.status, hasPermission: null }; }
  return { status: 200, hasPermission: typeof d?.hasPermission === "boolean" ? d.hasPermission : null };
}

/** Newest version's authorId — how we learn which account actually performed the app's page write. */
async function latestVersionAuthor(pageId: string): Promise<string | null> {
  const res = await request("GET", `/wiki/api/v2/pages/${pageId}/versions?limit=10`, { raw: true });
  if (res.status !== 200) return null;
  try {
    const rows = JSON.parse(res.text)?.results || [];
    if (!rows.length) return null;
    return rows.reduce((a: any, b: any) => (b.number > a.number ? b : a)).authorId || null;
  } catch { return null; }
}

/** Restrict `update` on a page to an explicit user allow-list. Verified by reading it back. */
async function restrictUpdateTo(pageId: string, accountIds: string[]): Promise<string[]> {
  for (const id of accountIds) {
    await request("PUT", `/wiki/rest/api/content/${pageId}/restriction/byOperation/update/user?accountId=${encodeURIComponent(id)}`, { raw: true });
  }
  const res = await request("GET", `/wiki/rest/api/content/${pageId}/restriction/byOperation/update?expand=restrictions.user`, { raw: true });
  if (res.status !== 200) return [];
  try {
    return (JSON.parse(res.text)?.restrictions?.user?.results || []).map((u: any) => u.accountId).filter(Boolean);
  } catch { return []; }
}

/** The tenant's human (non-app) accounts that are NOT site admins — a site admin is not usefully
 *  "unentitled" to anything. Read-only. */
async function findNonAdminHumans(): Promise<Array<{ accountId: string; displayName: string }>> {
  const out: Array<{ accountId: string; displayName: string }> = [];
  for (let start = 0; start < 300; start += 50) {
    const res = await request("GET", `/wiki/rest/api/search/user?cql=${encodeURIComponent("type=user")}&limit=50&start=${start}`, { raw: true });
    if (res.status !== 200) break;
    let rows: any[] = [];
    try { rows = JSON.parse(res.text)?.results || []; } catch { break; }
    for (const r of rows) {
      const u = r.user || {};
      if (u.accountType === "app" || !u.accountId) continue;
      const d = await request("GET", `/wiki/rest/api/user?accountId=${encodeURIComponent(u.accountId)}&expand=operations`, { raw: true });
      let siteAdmin = false;
      try {
        siteAdmin = (JSON.parse(d.text)?.operations || [])
          .some((o: any) => o.operation === "administer" && o.targetType === "application");
      } catch { /* treat as unknown -> not excluded */ }
      if (!siteAdmin) out.push({ accountId: u.accountId, displayName: u.displayName || "" });
    }
    if (rows.length < 50) break;
  }
  return out;
}

const mkPage = async (tag: string) => {
  const spaceId = await spaceIdByKey(SPACE);
  expect(spaceId, `space ${SPACE} resolves`).toBeTruthy();
  return createPage({
    spaceId,
    title: `HARNESS sv-sec-1 ${tag} ${Date.now()}`,
    adf: doc(
      heading("SECTION ALPHA", 2), paragraph("alpha body content"),
      heading("SECTION BETA", 2), paragraph("beta body content"),
    ),
  });
};

const alphaIndex = async (pageId: string) => {
  const lh = await inv("listPageHeadings", { pageId, actor: ENTITLED });
  const h = (lh.result?.headings || []).find((x: any) => x.text === "SECTION ALPHA");
  expect(h, "the heading picker resolved SECTION ALPHA (proves the testhook seam works at all)").toBeTruthy();
  return String(h.index);
};

const purgeSeal = async (sectionId: string) => {
  const rec = await getKvs(`section-protection-${sectionId}`).catch(() => null);
  await delKvs(`section-protection-${sectionId}`).catch(() => {});
  await delKvs(`section-snapshot-${sectionId}`).catch(() => {});
  // sealSection also writes this one; the existing B6 spec forgets it.
  if (rec?.spaceId) await delKvs(`space-section-protection-${rec.spaceId}-${sectionId}`).catch(() => {});
};

// retries: 0 deliberately. A security negative that only passes on the second attempt is not a
// pass — it is a signal, and a retry would swallow it.
test.describe.configure({ timeout: 300_000, retries: 0 });

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// TEST A — always runs. An UNKNOWN subject cannot seal a page it can merely name.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
test("SV-SEC-1 A: a caller Confluence does not recognise cannot seal a section on any page they can name", async () => {
  const page = await mkPage("A");
  let sectionId: string | null = null;
  try {
    const hi = await alphaIndex(page.id);

    const before = await readPage(page.id);
    const beforeAdf = JSON.stringify(before.adf);
    const keysBefore = await sealKeys();
    expect(typeof before.version, "readPage returns version as a NUMBER (not {number}) — asserting .number would compare undefined to undefined").toBe("number");

    // 1. THE NEGATIVE. Pre-fix this returned { success: true } and PUT the page.
    const bad = await inv("sealSection", { pageId: page.id, hi, htext: "SECTION ALPHA", actor: UNKNOWN_SUBJECT });
    expectEntitlementRefusal(bad.result, "unknown subject");

    // 2. THE REFUSAL MUST BE INERT. A returned {success:false} is a CLAIM; the page is the evidence.
    //    This is the load-bearing proof that writeDocBody -> asApp never ran.
    const after = await readPage(page.id);
    expect((after.adf.content || []).some(isSealedWrap), "no sealed-section wrapper was written").toBe(false);
    expect(JSON.stringify(after.adf), "page ADF byte-identical after the refusal").toBe(beforeAdf);
    expect(after.version, "page version did not advance").toBe(before.version);

    // 3. Supplementary: no seal record surfaced. The KVS prefix query is eventually consistent, so
    //    it is given time and is NOT relied on alone — step 2 already proves nothing was written,
    //    because the record is only written AFTER a successful page PUT.
    await sleep(2000);
    const newKeys = (await sealKeys()).filter((k) => !keysBefore.includes(k));
    expect(newKeys, `the refused seal left no section-protection record (${newKeys.join(",")})`).toEqual([]);
    console.log("### A: unknown subject refused, page untouched ✓");

    // 4. PROVE THE ASSERTION DISCRIMINATES. `sealSection` has nine other ways to say no; a spec
    //    that matched any refusal would be green against a gate that was never reached. A bad
    //    headingIndex is rejected by payload validation BEFORE the gate and touches nothing, so it
    //    is a free, inert sample of "refused, but not by the entitlement gate".
    const notAGate = await inv("sealSection", { pageId: page.id, hi: "-1", htext: "SECTION ALPHA", actor: UNKNOWN_SUBJECT });
    expect(notAGate.result?.success, "a malformed headingIndex is refused").toBe(false);
    expect(String(notAGate.result?.reason), "…and refused with a DIFFERENT reason than the gate's").not.toMatch(DENIED_RE);
    expect(String(notAGate.result?.reason), "…which WRONG_REASON_RE does catch — so step 1's assertion is not matching any refusal").toMatch(WRONG_REASON_RE);
    console.log("### A: refusal-reason matching discriminates (gate vs. validation) ✓");

    // 5. ANTI-OVER-TIGHTEN. The same call, the same page, an ENTITLED caller → must succeed.
    //    Without this the whole spec would pass against a gate that refuses everybody.
    const good = await inv("sealSection", { pageId: page.id, hi, htext: "SECTION ALPHA", actor: ENTITLED });
    expect(good.result?.success, `entitled caller still seals (got: ${good.result?.reason})`).toBe(true);
    sectionId = good.result?.sectionId;
    expect(sectionId, "a sectionId was issued").toBeTruthy();
    const sealed = await readPage(page.id);
    expect((sealed.adf.content || []).some(isSealedWrap), "the entitled seal DID write the wrapper").toBe(true);
    expect(sealed.version, "the entitled seal DID advance the page version").toBeGreaterThan(before.version);

    // 6. The record carries the PAGE's realm, resolved from the pageId — never a caller-supplied
    //    space. unsealSection consults record.spaceKey to decide who may unseal.
    const rec = await getKvs(`section-protection-${sectionId}`);
    expect(rec?.spaceKey, "the record stores the page's REAL space key").toBe(SPACE);
    expect(String(rec?.pageId), "the record stores the real pageId").toBe(String(page.id));
    expect(rec?.lockedBy, "the record is owned by the sealing caller").toBe(ENTITLED);
    console.log("### A: entitled caller still seals; record stamped with the page's own realm ✓");
  } finally {
    if (sectionId) await purgeSeal(sectionId);
    await deletePage(page.id).catch(() => {});
  }
});

// ═════════════════════════════════════════════════════════════════════════════════════════════════
// TEST B — the STRONG negative: a REAL, licensed account that Confluence itself says cannot update
// this page. Test A's actor is refused because Confluence has never heard of it (404 "No user with
// id"), which folds to a refusal but is NOT evidence that the gate distinguishes between real
// accounts. This test supplies that evidence, and it is also the only thing in the harness that can
// answer the open question flagged in the SV-SEC-1 repair pass: does the app principal get a
// PER-SUBJECT answer from the content-permission endpoint, or is that arm inert?
//
// It manufactures the unentitled state honestly, on a disposable page it owns: an `update` content
// restriction that admits the entitled caller and the app, and nobody else. Every premise is then
// VERIFIED against an independent authority (admin-authenticated REST) before the negative is
// asserted — if any premise cannot be established, the test SKIPS with a named reason rather than
// asserting something it has not earned.
// ═════════════════════════════════════════════════════════════════════════════════════════════════
test("SV-SEC-1 B: a real account Confluence says cannot update the page is refused, while one that can still seals", async () => {
  // ── B1. Find a real, non-site-admin human account. ────────────────────────────────────────────
  let candidate = SUPPLIED_UNENTITLED;
  let candidateLabel = "SENTINEL_TEST_UNENTITLED_ACCOUNT_ID";
  if (!candidate) {
    const humans = (await findNonAdminHumans()).filter((h) => h.accountId !== ENTITLED);
    if (!humans.length) {
      test.skip(true,
        "NO SECOND REAL IDENTITY AVAILABLE. Every human account on this tenant is a site admin, so " +
        "none can be made unentitled to a page. A human must supply one: create (or licence) a " +
        "plain Confluence user with NO site-admin and NO space-admin rights on " + SPACE + ", then set " +
        "SENTINEL_TEST_UNENTITLED_ACCOUNT_ID in the harness .env. Test A still runs and still covers " +
        "the ungated-write defect; this test covers real-account discrimination and is UNMET without it.");
      return;
    }
    candidate = humans[0].accountId;
    candidateLabel = `auto-discovered non-site-admin (${humans[0].displayName})`;
  }
  console.log(`### B: candidate unentitled identity = ${candidate} [${candidateLabel}]`);

  const page = await mkPage("B");
  let sectionId: string | null = null;
  let spaceCfgOriginal: any = undefined;
  let globalCfgOriginal: any = undefined;
  const SPACE_CFG = `admin-settings-space-${SPACE}`;
  const GLOBAL_CFG = "admin-settings-global";

  try {
    const hi = await alphaIndex(page.id);

    // ── B2. The candidate must NOT be a steward, or L2c grants it and this test proves nothing. ──
    //    Under the webtrigger, authorizeSteward's asUser arms cannot evaluate, so the steward
    //    decision reduces to the KVS adminUsers list. Preserve-and-restore it, exactly as
    //    destructive-actions-perm.spec.ts does with the gating toggles.
    const stripSteward = async (key: string) => {
      const cfg = await getKvs(key);
      if (!cfg?.adminUsers?.length) return undefined;
      const listed = cfg.adminUsers.some((o: any) => (typeof o === "string" ? o : o?.accountId) === candidate);
      if (!listed) return undefined;
      const next = { ...cfg, adminUsers: cfg.adminUsers.filter((o: any) => (typeof o === "string" ? o : o?.accountId) !== candidate) };
      await setKvs(key, next);
      console.log(`### B: candidate was listed as a steward in ${key} — temporarily removed (restored in teardown)`);
      return cfg;
    };
    spaceCfgOriginal = await stripSteward(SPACE_CFG);
    globalCfgOriginal = await stripSteward(GLOBAL_CFG);

    // ── B3. Ground truth, from an independent authority: the candidate CAN update this page now. ─
    //    This is what makes the later denial meaningful, and it proves the probe endpoint is
    //    capable of answering YES — a check that can only say no is not a check.
    const pre = await adminMayUpdate(page.id, candidate);
    if (pre.status !== 200 || pre.hasPermission !== true) {
      test.skip(true,
        `Could not establish the candidate ${candidate} as ENTITLED on the fresh page ` +
        `(permission/check -> ${pre.status}, hasPermission=${pre.hasPermission}). Without a proven ` +
        "before-state the after-state proves nothing. A human must supply a licensed Confluence user " +
        "with edit rights on " + SPACE + " via SENTINEL_TEST_UNENTITLED_ACCOUNT_ID.");
      return;
    }

    // ── B4. THE L2a DIAGNOSTIC, and the anti-over-tighten control for real users. ─────────────────
    //    The candidate is a real user who is NOT a steward, has no asUser context here, and whom
    //    Confluence says may update this page. The ONLY arm that can allow it is the asApp
    //    content-permission check. So: success here proves that arm returns a per-subject answer
    //    for the app principal; refusal here proves the arm is INERT and the gate is resting on the
    //    steward arm alone — which would deny every ordinary user in production.
    const asCandidate = await inv("sealSection", { pageId: page.id, hi, htext: "SECTION ALPHA", actor: candidate });
    expect(asCandidate.result?.success,
      "L2a: a real, entitled, NON-steward user must be able to seal. A refusal here means the asApp " +
      "content-permission arm returned no per-subject answer and the gate is over-tightened to " +
      `stewards only (reason: ${asCandidate.result?.reason})`).toBe(true);
    const candidateSection = asCandidate.result?.sectionId;
    expect(candidateSection, "the entitled non-steward got a sectionId").toBeTruthy();
    console.log("### B: entitled NON-steward real user CAN seal → the asApp per-subject arm is live ✓");
    // Unwrap so the range is sealable again. The owner may unseal their own seal.
    const undo = await inv("unsealSection", { section: candidateSection, actor: candidate });
    expect(undo.result?.success, `the candidate can unseal their own seal (got: ${undo.result?.reason})`).toBe(true);
    await purgeSeal(candidateSection);

    // ── B5. Learn which account actually performs the app's page write. ───────────────────────────
    //    sealSection writes asApp deliberately (the page-content trigger's loop-guard keys on it),
    //    so the app user must stay inside the update restriction — otherwise the restriction, not
    //    the gate, would block the write and the negative below would pass for the wrong reason.
    //    If the newest version author is the page CREATOR rather than a third principal, the app's
    //    write did not happen the way this test assumes and the restriction below would be aimed
    //    at the wrong account — skip rather than assert on a false premise.
    const appAuthor = await latestVersionAuthor(page.id);
    if (!appAuthor || appAuthor === candidate || appAuthor === ENTITLED) {
      test.skip(true, `Could not identify the app's page-write principal from the version history (got ${appAuthor}). ` +
        "Without it the update restriction would also block the app, and the refusal in step B8 could " +
        "not be attributed to the entitlement gate.");
      return;
    }
    console.log(`### B: app page-write principal = ${appAuthor}`);

    // ── B6. Manufacture the unentitled state, then VERIFY it against the independent authority. ───
    const allow = await restrictUpdateTo(page.id, [ENTITLED, appAuthor]);
    expect(allow, "the update restriction was actually written back").toEqual(expect.arrayContaining([ENTITLED, appAuthor]));
    expect(allow, "the candidate is NOT on the update allow-list").not.toContain(candidate);

    const post = await adminMayUpdate(page.id, candidate);
    if (post.status !== 200 || post.hasPermission !== false) {
      test.skip(true,
        `The update restriction did not deny ${candidate} (permission/check -> ${post.status}, ` +
        `hasPermission=${post.hasPermission}). This account cannot be made unentitled — it is most ` +
        "likely a space admin on " + SPACE + ". A human must supply an account with no admin rights " +
        "on the space via SENTINEL_TEST_UNENTITLED_ACCOUNT_ID.");
      return;
    }
    // A 200 carrying hasPermission:false is the ONLY outcome proving the endpoint weighed this
    // subject against this page and said no — the distinction page-access.js's control probe rests
    // on (PROBE_DENY, not PROBE_NO_SUBJECT).
    console.log("### B: candidate is now DEFINITIVELY denied update by Confluence (200 + hasPermission:false) ✓");

    // ── B7. POSITIVE CONTROL, ON THE RESTRICTED PAGE. Proves the restriction did not break the ────
    //    app's write path. Anything that fails after this can only be about the CALLER.
    const good = await inv("sealSection", { pageId: page.id, hi, htext: "SECTION ALPHA", actor: ENTITLED });
    expect(good.result?.success,
      `an ENTITLED caller still seals the restricted page — so the restriction itself is not what ` +
      `blocks anything (got: ${good.result?.reason})`).toBe(true);
    sectionId = good.result?.sectionId;
    const undo2 = await inv("unsealSection", { section: sectionId!, actor: ENTITLED });
    expect(undo2.result?.success, `unsealed the control seal (got: ${undo2.result?.reason})`).toBe(true);
    await purgeSeal(sectionId!);
    sectionId = null;
    console.log("### B: entitled caller seals the RESTRICTED page → the app write path is intact ✓");

    // ── B8. THE STRONG NEGATIVE. ──────────────────────────────────────────────────────────────────
    const before = await readPage(page.id);
    const beforeAdf = JSON.stringify(before.adf);
    const keysBefore = await sealKeys();

    const bad = await inv("sealSection", { pageId: page.id, hi, htext: "SECTION ALPHA", actor: candidate });
    expectEntitlementRefusal(bad.result, "real unentitled account");

    const after = await readPage(page.id);
    expect((after.adf.content || []).some(isSealedWrap), "no sealed-section wrapper was written").toBe(false);
    expect(JSON.stringify(after.adf), "page ADF byte-identical after the refusal").toBe(beforeAdf);
    expect(after.version, "page version did not advance").toBe(before.version);
    await sleep(2000); // eventual consistency — supplementary only; the ADF check above is the proof
    const newKeys = (await sealKeys()).filter((k) => !keysBefore.includes(k));
    expect(newKeys, `the refused seal left no section-protection record (${newKeys.join(",")})`).toEqual([]);
    console.log("### B: REAL unentitled account refused, page untouched ✓ — SV-SEC-1 negative case closed");
  } finally {
    if (sectionId) await purgeSeal(sectionId);
    if (spaceCfgOriginal !== undefined) await setKvs(SPACE_CFG, spaceCfgOriginal).catch(() => {});
    if (globalCfgOriginal !== undefined) await setKvs(GLOBAL_CFG, globalCfgOriginal).catch(() => {});
    // Deleting the page removes the restriction with it; no tenant state survives this test.
    await deletePage(page.id).catch(() => {});
  }
});
