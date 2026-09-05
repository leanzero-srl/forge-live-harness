// B3 (ledger #59) — signed approval decisions. Forge has no re-authentication API, so the app
// enrols a TOTP device per approver and a space can require the current code on every decision.
// Proves through the seams, computing codes the way an authenticator would from the secret the
// enrolment hands out exactly once: enrol → confirm; unsigned decision refused when required;
// a wrong code refused; the right code accepted and the record marked signed; the SAME code
// refused a second time (replay); revoke → back to "set up first".
// @covers resolver:signature-status resolver:enroll-signature resolver:confirm-signature-enrollment resolver:revoke-signature resolver:decide-approval
import { test, expect } from "@playwright/test";
import { createHmac } from "node:crypto";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage, purgePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const SETTINGS_KEY = `workflow-settings-${SPACE}`;
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const REQUESTER = "sv-aql-sign-req";
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const setKvs = (key: string, val: any) => getTestState("sentinel-vault", { what: "set", key, value: JSON.stringify(val) });
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });
const clearDevice = async () => { for (const k of [`sig-secret-${MIHAI}`, `sig-enroll-${MIHAI}`, `sig-last-${MIHAI}`, `sig-fail-${MIHAI}`]) await delKvs(k).catch(() => {}); };

// An authenticator: RFC 6238 over HMAC-SHA1, 30 s steps, 6 digits.
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32(s: string): Buffer { let bits = 0, v = 0; const out: number[] = []; for (const ch of s.toUpperCase().replace(/[^A-Z2-7]/g, "")) { v = (v << 5) | B32.indexOf(ch); bits += 5; if (bits >= 8) { out.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
function totp(secret: string, stepOffset = 0): string {
  const step = Math.floor(Date.now() / 30000) + stepOffset;
  const msg = Buffer.alloc(8); let c = BigInt(step); for (let i = 7; i >= 0; i--) { msg[i] = Number(c & 0xffn); c >>= 8n; }
  const h = createHmac("sha1", b32(secret)).update(msg).digest(); const o = h[h.length - 1] & 15;
  const bin = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(bin % 1e6).padStart(6, "0");
}

test.describe.configure({ timeout: 300_000, retries: 1 });

test("enrol, sign a decision, refuse replay and unsigned decisions, revoke", async () => {
  const prior = await getKvs(SETTINGS_KEY);
  const spaceId = await spaceIdByKey(SPACE);
  const p = await createPage({ spaceId, title: `HARNESS sv-esign ${Date.now()}`, adf: doc(heading("Sign", 2), paragraph("signed approval")) });
  await clearDevice(); // a clean device state for Mihai (revoke needs the device code; the hook deletes the keys)
  try {
    await setKvs(SETTINGS_KEY, { ...(prior || { workflowId: "default", autoAssignNew: false }), enabled: true, requireSignature: true });
    await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: REQUESTER });
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: REQUESTER });
    const ra = await inv("requestApproval", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, mode: "any", actor: REQUESTER });
    expect(ra.result?.pending, `approval requested (got ${JSON.stringify(ra.result)})`).toBe(true);

    // Not enrolled → a decision is refused and says what to do.
    const s0 = (await inv("signatureStatus", { actor: MIHAI })).result;
    expect(s0?.enrolled, "Mihai has no signature").toBe(false);
    const d0 = (await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "approved" })).result;
    expect(d0?.success, "an unsigned decision is refused when the space requires a signature").toBe(false);
    expect(String(d0?.reason), "…and the refusal points at the setup").toMatch(/signature/i);
    expect((await getKvs(`workflow-approval-${p.id}-approved-approval-${MIHAI}`))?.status, "nothing was recorded").toBe("pending");

    // Enrol: the secret leaves the app once; confirming needs a real code.
    const en = (await inv("enrollSignature", { actor: MIHAI })).result;
    expect(en?.success && /^[A-Z2-7]{32}$/.test(en.secret), `enrolment hands out a base32 secret (got ${JSON.stringify(en)})`).toBe(true);
    expect(String(en.uri), "an otpauth URI for the authenticator").toMatch(/^otpauth:\/\/totp\/.*secret=/);
    const bad = (await inv("confirmSignatureEnrollment", { actor: MIHAI, code: "000000" })).result;
    expect(bad?.success, "a wrong first code does not enrol").toBe(bad?.success === true && totp(en.secret) === "000000" ? true : false);
    const ok = (await inv("confirmSignatureEnrollment", { actor: MIHAI, code: totp(en.secret) })).result;
    expect(ok?.success, `the real code enrols (got ${JSON.stringify(ok)})`).toBe(true);
    expect((await inv("signatureStatus", { actor: MIHAI })).result?.enrolled, "status: enrolled").toBe(true);
    console.log("### enrolled ✓ (unsigned refused, wrong code refused, real code accepted)");

    // The enrolment's own code was consumed — use the NEXT step for the decision (replay guard).
    const wrong = (await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "approved", code: "123456" })).result;
    expect(wrong?.success, "a wrong code is refused").toBe(wrong?.success === true && totp(en.secret, 1) === "123456" ? true : false);
    const code = totp(en.secret, 1);
    const d1 = (await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "approved", code })).result;
    expect(d1?.success && d1?.outcome === "approved", `the signed decision completes (got ${JSON.stringify(d1)})`).toBe(true);
    const wf = (await inv("getWorkflow", { pageId: p.id, spaceKey: SPACE, actor: MIHAI })).result;
    expect(wf?.record?.stateId, "page is Approved").toBe("approved");
    expect(wf?.record?.approvalRecord?.decisions?.[0]?.signed, "the approval record marks the decision SIGNED").toBe(true);
    console.log("### signed decision ✓ (record.decisions[0].signed = true)");

    // Replay: the same code again on a fresh request is refused.
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "draft", actor: MIHAI });
    await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: REQUESTER });
    await inv("requestApproval", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, mode: "any", actor: REQUESTER });
    const replay = (await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "approved", code })).result;
    expect(replay?.success, "the SAME code is refused a second time").toBe(false);
    console.log("### replay refused ✓");

    // Replacing or removing the device needs ITS code (review finding 2): a stolen session alone
    // cannot swap the second factor.
    const swap = (await inv("enrollSignature", { actor: MIHAI })).result;
    expect(swap?.success, "starting a NEW enrolment without the current code is refused").toBe(false);
    expect(swap?.codeRequired, "…and says a code is needed").toBe(true);
    const rv0 = (await inv("revokeSignature", { actor: MIHAI })).result;
    expect(rv0?.success, "revoking without the current code is refused").toBe(false);
    // Lockout (review finding 3): five wrong codes → refused for 15 minutes, whatever the code.
    for (let i = 0; i < 5; i++) await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "approved", code: String(100000 + i) });
    const locked = (await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "approved", code: totp(en.secret, 2) })).result;
    expect(locked?.success, "after five wrong codes even a valid code is refused").toBe(false);
    expect(String(locked?.reason), "…with a lockout message").toMatch(/Too many wrong codes/);
    console.log("### device swap/revoke need a code ✓; lockout after five wrong codes ✓");
    await delKvs(`sig-fail-${MIHAI}`); // lift the lockout for the rest of the proof
    // Revoke WITH the code → back to "set up first".
    expect((await inv("revokeSignature", { actor: MIHAI, code: totp(en.secret, 2) })).result?.success, "revoke with the device's code").toBe(true);
    expect((await inv("signatureStatus", { actor: MIHAI })).result?.enrolled, "revoked").toBe(false);
    const after = (await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "denied", code: totp(en.secret, 2) })).result;
    expect(after?.success, "after revoking, even a valid code is refused").toBe(false);
    // Space no longer requires a signature → a plain decision works again.
    await setKvs(SETTINGS_KEY, { ...(prior || { workflowId: "default", autoAssignNew: false }), enabled: true, requireSignature: false });
    const plain = (await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "denied", reason: "unsigned is fine here" })).result;
    expect(plain?.success, "with the requirement off, an unsigned decision works").toBe(true);
    console.log("### revoke + requirement off ✓");
  } finally {
    await clearDevice();
    if (prior) await setKvs(SETTINGS_KEY, prior); else await delKvs(SETTINGS_KEY).catch(() => {});
    for (const k of [`workflow-state-${p.id}`, `workflow-pending-${p.id}`, `workflow-autoassigned-${p.id}`, `workflow-inbox-${MIHAI}-${p.id}`, `workflow-approval-${p.id}-approved-approval-${MIHAI}`,
      `workflow-idx-${SPACE}-draft-${p.id}`, `workflow-idx-${SPACE}-in_review-${p.id}`, `workflow-idx-${SPACE}-approved-${p.id}`]) await delKvs(k).catch(() => {});
    for (const prefix of [`workflow-log-${p.id}-`, `workflow-approval-${p.id}-`, `activity-page-${p.id}-`]) for (const k of await queryKvs(prefix).catch(() => [] as string[])) await delKvs(k).catch(() => {});
    await deletePage(p.id).catch(() => {}); await purgePage(p.id).catch(() => {});
  }
});
