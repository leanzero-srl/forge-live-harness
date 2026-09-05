// Coverage gap (2026-09-05) — the REQUESTER side of the attachment edit-access loop, which no spec
// could reach: the inline-panel "Request edit access" control only renders for a file sealed by
// someone ELSE, and the harness user owns the fixture seal. So a real non-owner (Gabriela) drives
// the resolvers through the dev testhook against the REAL fixture seal (att265945089, owned by
// Mihai): request → check (pending) → the owner's inbox lists it → deny → check (denied, 48h
// cooldown) → a re-request inside the cooldown is refused. The NEGATIVE is the SV-SEC-1 gate:
// request-edit-access answers a caller who cannot read the seal's page with the same vague
// "not sealed" it gives for a file that has no seal — proven with a seeded seal on a page in the
// private SVSEC1P space, where the OWNER's answer ("You own this seal") shows the record was found.
// Side effect to know about: with native notices on, request + deny each post a notice comment on
// the fixture page (the resolver's own behaviour; comments never bump the page version).
// Self-cleaning: the request key is deleted; the private-space page + seal record are deleted.
// @covers resolver:request-edit-access resolver:check-edit-request resolver:list-my-edit-requests resolver:deny-edit-request
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, uploadAttachment } from "../../data/confluence.mjs";
// @ts-ignore
import { post } from "../../data/jira.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const ATT = process.env.SV_ATTACHMENT_ID || "att265945089"; // the seeded fixture attachment
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086"; // owns the fixture seal
const GABI = "712020:2b9d007d-db0d-47c9-b4ae-953f55501f55";  // real; can read WFH, NOT SVSEC1P
const PRIV_SPACE = "SVSEC1P"; // see authz-content-gate.spec.ts — created on demand, left in place
const REQ_KEY = `edit-request-${ATT}-${GABI}`;
const GRANT_KEY = `edit-grant-${ATT}-${GABI}`;

const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

async function ensurePrivateSpace(): Promise<string> {
  const existing = await spaceIdByKey(PRIV_SPACE);
  if (existing) return existing;
  await post("/wiki/rest/api/space/_private", {
    key: PRIV_SPACE,
    name: "SV-SEC-1 authz probe",
    description: { plain: { value: "Harness-owned. Private on purpose — see authz-content-gate.spec.ts", representation: "plain" } },
  });
  const id = await spaceIdByKey(PRIV_SPACE);
  if (!id) throw new Error(`could not create or find the private probe space ${PRIV_SPACE}`);
  return id;
}

test.describe.configure({ timeout: 180_000, retries: 1 });

test.describe("edit-access request lifecycle (requester side)", () => {
  test.beforeAll(async () => {
    const seal = await getKvs(`protection-${ATT}`);
    expect(seal?.lockedBy, `fixture seal protection-${ATT} exists (run npm run ensure-fixture)`).toBe(MIHAI);
    expect(new Date(seal.expiresAt).getTime(), "fixture seal is live").toBeGreaterThan(Date.now());
    expect(seal.contentId, "fixture seal names its page (the read gate anchors on it)").toBeTruthy();
  });
  test.afterAll(async () => {
    await delKvs(REQ_KEY).catch(() => {});
    await delKvs(GRANT_KEY).catch(() => {});
  });

  test("request → pending → owner inbox → deny → cooldown refuses a re-request", async () => {
    await delKvs(REQ_KEY); await delKvs(GRANT_KEY); // retry-safe
    const none = await inv("checkEditRequest", { att: ATT, actor: GABI });
    expect(none.result?.status, "no request yet").toBe("none");

    // The owner cannot request their own seal — self-knowledge, answered before any gate.
    const own = await inv("requestEditAccess", { att: ATT, actor: MIHAI, reason: "x" });
    expect(own.result?.success).toBe(false);
    expect(own.result?.reason, "the owner is told they own it").toMatch(/own this seal/i);

    const req = await inv("requestEditAccess", { att: ATT, actor: GABI, reason: "need to fix the caption" });
    expect(req.result?.success, `a real non-owner who can read the page may request (got: ${req.result?.reason})`).toBe(true);
    const rec = await getKvs(REQ_KEY);
    expect(rec?.status, "request stored pending").toBe("pending");
    expect(rec?.reason, "…with the reason").toBe("need to fix the caption");
    expect(rec?.ownerAccountId, "…addressed to the seal owner").toBe(MIHAI);
    expect(rec?.requesterAccountId).toBe(GABI);
    expect(rec?.artifactId).toBe(ATT);
    expect(rec?.requesterName, "the requester's display name was resolved (not the fallback)").not.toBe("Unknown User");

    const pending = await inv("checkEditRequest", { att: ATT, actor: GABI });
    expect(pending.result?.status, "the requester's own check reports pending").toBe("pending");

    const dup = await inv("requestEditAccess", { att: ATT, actor: GABI, reason: "again" });
    expect(dup.result?.success).toBe(false);
    expect(dup.result?.reason, "a duplicate is refused").toMatch(/already pending/i);
    console.log("### request ✓ (pending record with reason, owner refused, duplicate refused)");

    // The owner's inbox is kvs.query-backed (eventually consistent) → poll.
    let mine: any[] = [];
    for (let i = 0; i < 10; i++) {
      const l = await inv("listMyEditRequests", { actor: MIHAI });
      mine = l.result?.requests || [];
      if (mine.some((r: any) => r.artifactId === ATT && r.requesterAccountId === GABI)) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    const row = mine.find((r: any) => r.artifactId === ATT && r.requesterAccountId === GABI);
    expect(row, "the OWNER's inbox lists the pending request").toBeTruthy();
    expect(row.reason).toBe("need to fix the caption");
    const notMine = await inv("listMyEditRequests", { actor: GABI });
    expect((notMine.result?.requests || []).some((r: any) => r.artifactId === ATT && r.requesterAccountId === GABI),
      "the inbox is scoped to the OWNER — the requester does not see it in theirs").toBe(false);
    console.log("### owner inbox ✓ (listed for Mihai, not for Gabriela)");

    const deny = await inv("denyEditRequest", { att: ATT, actor: MIHAI, requester: GABI });
    expect(deny.result?.success, "the owner denies").toBe(true);
    const denied = await inv("checkEditRequest", { att: ATT, actor: GABI });
    expect(denied.result?.status, "the requester's check reports denied").toBe("denied");
    expect(denied.result?.deniedAt, "…with the denial timestamp the cooldown counts from").toBeTruthy();
    expect((await getKvs(REQ_KEY))?.status, "the record is kept as denied (cooldown tracking)").toBe("denied");

    const cool = await inv("requestEditAccess", { att: ATT, actor: GABI, reason: "please?" });
    expect(cool.result?.success).toBe(false);
    expect(cool.result?.reason, "48h cooldown refuses an immediate re-request").toMatch(/declined|try again later/i);
    expect(await getKvs(GRANT_KEY), "nothing here minted a grant").toBeFalsy();
    console.log("### deny ✓ (denied + deniedAt, cooldown blocks re-request)");
  });

  test("SV-SEC-1: a caller who cannot read the seal's page is refused as if the file were unsealed", async () => {
    const privSpaceId = await ensurePrivateSpace();
    const privPage = await createPage({ spaceId: privSpaceId, title: `HARNESS sv-editreq priv ${Date.now()}`, adf: doc(heading("PRIVATE", 2), paragraph("private body")) });
    let privAtt: any = null;
    try {
      privAtt = await uploadAttachment(privPage.id, `sv-editreq-priv-${Date.now()}.txt`, "private sealed file");
      // A seal owned by Mihai on the private page — the shape the request gate reads.
      await setKvs(`protection-${privAtt.attachmentId}`, {
        attachmentId: privAtt.attachmentId, lockedBy: MIHAI, lockedByName: "Mihai",
        contentId: privPage.id, spaceKey: PRIV_SPACE, attachmentName: "private sealed file",
        timestamp: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      });
      // Control: the record IS there and IS read — the owner gets the owner answer.
      const own = await inv("requestEditAccess", { att: privAtt.attachmentId, actor: MIHAI, reason: "x" });
      expect(own.result?.reason, "the seeded seal is found (owner answer)").toMatch(/own this seal/i);

      // THE NEGATIVE. Gabriela cannot read the page → refused with the deliberately vague reason.
      const denied = await inv("requestEditAccess", { att: privAtt.attachmentId, actor: GABI, reason: "let me in" });
      expect(denied.result?.success, "a real user with no access to the page is REFUSED").toBe(false);
      expect(denied.result?.reason, "…and the refusal discloses nothing (same wording as 'no seal')").toMatch(/not sealed/i);
      expect(await getKvs(`edit-request-${privAtt.attachmentId}-${GABI}`), "no request record was written").toBeFalsy();
      const chk = await inv("checkEditRequest", { att: privAtt.attachmentId, actor: GABI });
      expect(chk.result?.status, "…and her own check still says none").toBe("none");
      console.log("### SV-SEC-1 request gate ✓ (owner sees the record, unentitled caller refused, nothing written)");
    } finally {
      if (privAtt) {
        await delKvs(`protection-${privAtt.attachmentId}`).catch(() => {});
        await delKvs(`edit-request-${privAtt.attachmentId}-${GABI}`).catch(() => {});
      }
      await deletePage(privPage.id).catch(() => {});
    }
  });
});
