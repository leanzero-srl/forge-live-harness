// #6 (worklist) — SECTION edit-access owner decision loop, the untested sibling of the page-level
// edit-request flow. Drives the request/approve/deny/check/list resolvers via the dev testhook with
// SYNTHETIC actors (owner / two requesters — a single REST user can't play both sides). Asserts every
// guard (not-sealed, owner-can't-request, duplicate-pending, existing-grant, non-owner-approve,
// deny→48h cooldown) + the durable grant/request records. Seeds a synthetic section-protection seal;
// self-cleans. Hook-driven (no browser session needed). Retry-safe (pre-cleans the actor keys).
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";

const PAGE = process.env.SV_PAGE_ID || "265912321";
const SPACE = process.env.SENTINEL_TEST_SPACE || "WFH";
const OWNER = "sv-aql-secowner";
const REQ = "sv-aql-secreq1";
const REQ2 = "sv-aql-secreq2";
const SECTION = `sv-aql-sec-${Date.now()}`;
const SEAL_KEY = `section-protection-${SECTION}`;
const reqKey = (a: string) => `section-edit-request-${SECTION}-${a}`;
const grantKey = (a: string) => `section-edit-grant-${SECTION}-${a}`;

const inv = (fn: string, params: Record<string, string>) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });

test.describe.configure({ timeout: 120_000, retries: 1 });

test.describe("#6 section edit-access request/approve/deny loop", () => {
  test.beforeAll(async () => {
    await setKvs(SEAL_KEY, {
      sectionId: SECTION, lockedBy: OWNER, sectionTitle: "AQL Test Section",
      pageId: PAGE, spaceKey: SPACE,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    });
  });
  test.afterAll(async () => {
    await delKvs(SEAL_KEY);
    for (const a of [OWNER, REQ, REQ2]) { await delKvs(reqKey(a)); await delKvs(grantKey(a)); }
  });

  test("request → guards → approve (grant) → deny (cooldown), all authz enforced", async () => {
    // retry-safe: start each run from a clean actor state (the seeded seal persists).
    for (const a of [REQ, REQ2]) { await delKvs(reqKey(a)); await delKvs(grantKey(a)); }

    // ── REQUEST guards ──────────────────────────────────────────────────────
    const notSealed = await inv("requestSectionEdit", { section: `sv-aql-nope-${Date.now()}`, actor: REQ });
    expect(notSealed.result?.reason, "request on an unsealed section is rejected").toMatch(/not sealed/i);

    const asOwner = await inv("requestSectionEdit", { section: SECTION, actor: OWNER });
    expect(asOwner.result?.reason, "the section owner cannot request their own section").toMatch(/own this section/i);

    const ok = await inv("requestSectionEdit", { section: SECTION, actor: REQ, reason: "need to fix a typo" });
    expect(ok.result?.success, "a valid request is accepted").toBe(true);
    const rec = await getKvs(reqKey(REQ));
    expect(rec?.status, "request stored as pending").toBe("pending");
    expect(rec?.ownerAccountId, "request carries the section owner").toBe(OWNER);
    expect(rec?.reason, "request carries the reason").toMatch(/typo/i);

    const dup = await inv("requestSectionEdit", { section: SECTION, actor: REQ });
    expect(dup.result?.reason, "a duplicate pending request is rejected").toMatch(/already pending/i);
    console.log("### request + guards ✓ (not-sealed, owner, duplicate)");

    // owner's pending list (kvs.query is eventually consistent → poll)
    let listed = false;
    for (let i = 0; i < 6 && !listed; i++) {
      const list = await inv("listSectionEditRequests", { section: SECTION, actor: OWNER });
      listed = (list.result?.requests || []).some((x: any) => x.requesterAccountId === REQ);
      if (!listed) await new Promise((r) => setTimeout(r, 1500));
    }
    expect(listed, "the owner sees the pending request in the list").toBe(true);
    const reqCheck = await inv("checkSectionEdit", { section: SECTION, actor: REQ });
    expect(reqCheck.result?.status, "the requester's own check reports pending").toBe("pending");

    // ── APPROVE (authz + grant) ─────────────────────────────────────────────
    const notOwnerApprove = await inv("approveSectionEdit", { section: SECTION, actor: REQ, requester: REQ });
    expect(notOwnerApprove.result?.reason, "a non-owner cannot approve").toMatch(/not the section owner/i);

    const approve = await inv("approveSectionEdit", { section: SECTION, actor: OWNER, requester: REQ });
    expect(approve.result?.success, "the owner approves").toBe(true);
    const grant = await getKvs(grantKey(REQ));
    expect(grant?.editorAccountId, "a section-edit-grant is written for the requester").toBe(REQ);
    expect(grant?.grantedBy, "the grant records the granting owner").toBe(OWNER);
    expect(grant?.expiresAt, "the grant is scoped to the seal's expiry").toBeTruthy();
    expect(await getKvs(reqKey(REQ)), "the pending request is cleared on approve").toBeFalsy();
    const grantedCheck = await inv("checkSectionEdit", { section: SECTION, actor: REQ });
    expect(grantedCheck.result?.status, "the requester's check now reports granted").toBe("granted");

    const reReq = await inv("requestSectionEdit", { section: SECTION, actor: REQ });
    expect(reReq.result?.reason, "a granted editor re-requesting is told they already have access").toMatch(/already have edit access/i);
    console.log("### approve ✓ (authz, grant scoped to expiry, request cleared, existing-grant guard)");

    // ── DENY (+ 48h cooldown) ───────────────────────────────────────────────
    const req2 = await inv("requestSectionEdit", { section: SECTION, actor: REQ2, reason: "me too" });
    expect(req2.result?.success, "a second requester's request is accepted").toBe(true);
    const deny = await inv("denySectionEdit", { section: SECTION, actor: OWNER, requester: REQ2 });
    expect(deny.result?.success, "the owner denies").toBe(true);
    const denied = await getKvs(reqKey(REQ2));
    expect(denied?.status, "the denied request is marked denied (NOT deleted → cooldown tracking)").toBe("denied");
    expect(denied?.deniedAt, "deniedAt timestamp is set (48h cooldown)").toBeTruthy();
    const deniedCheck = await inv("checkSectionEdit", { section: SECTION, actor: REQ2 });
    expect(deniedCheck.result?.status, "the requester's check reports denied").toBe("denied");
    const cooldown = await inv("requestSectionEdit", { section: SECTION, actor: REQ2 });
    expect(cooldown.result?.reason, "the 48h cooldown blocks an immediate re-request").toMatch(/declined|try again later/i);
    console.log("### deny ✓ (denied status, deniedAt, cooldown blocks re-request)");
  });
});
