// A4 (ledger #50) — the approval record survives the approval. Before A4 the per-approver
// decision records were DELETED the moment an approval completed, so the page could say
// "Approved" but never who, when, with what reason, or for which version. Now finalize and
// denial snapshot the decisions into `record.approvalRecord` (approved) / the workflow log
// (denied) before clearing, and leaving the enforce state clears the record again.
// Hook-driven (the engine seams take explicit actors); throwaway pages; self-cleaning.
// @covers resolver:get-page-workflow resolver:decide-approval resolver:get-workflow-log
import { test, expect } from "@playwright/test";
import { getTestState } from "../../testhook/client";
// @ts-ignore
import { spaceIdByKey, createPage, deletePage } from "../../data/confluence.mjs";
// @ts-ignore
import { heading, paragraph } from "../../data/adf.mjs";

const SPACE = process.env.SENTINEL_SPACE_KEY || "WFH";
const MIHAI = "712020:937bc860-eec2-4294-a65d-8e0fe7c45086";
const REQUESTER = "sv-aql-evidence"; // synthetic: the engine seams never touch content for the requester
const inv = (fn: string, params: Record<string, string> = {}) => getTestState("sentinel-vault", { what: "invoke", fn, ...params });
const getKvs = async (key: string) => (await getTestState("sentinel-vault", { what: "kvs", key })).value;
const delKvs = (key: string) => getTestState("sentinel-vault", { what: "delete", key });
const queryKvs = async (prefix: string): Promise<string[]> => (await getTestState("sentinel-vault", { what: "query", prefix })).keys || [];
const doc = (...n: any[]) => ({ version: 1, type: "doc", content: n });

test.describe.configure({ timeout: 240_000, retries: 1 });

async function cleanup(pageId: string) {
  for (const k of [
    `workflow-state-${pageId}`, `workflow-pending-${pageId}`, `workflow-autoassigned-${pageId}`,
    `workflow-approval-${pageId}-approved-approval-${MIHAI}`, `workflow-inbox-${MIHAI}-${pageId}`,
    `workflow-idx-${SPACE}-draft-${pageId}`, `workflow-idx-${SPACE}-in_review-${pageId}`, `workflow-idx-${SPACE}-approved-${pageId}`,
  ]) await delKvs(k).catch(() => {});
  for (const prefix of [`workflow-log-${pageId}-`, `workflow-approval-${pageId}-`, `activity-page-${pageId}-`]) {
    const keys = await queryKvs(prefix).catch(() => [] as string[]);
    for (const k of keys) await delKvs(k).catch(() => {});
  }
  await deletePage(pageId).catch(() => {});
}

async function seedInReview(title: string) {
  const spaceId = await spaceIdByKey(SPACE);
  const p = await createPage({ spaceId, title, adf: doc(heading("Evidence", 2), paragraph("approval evidence seed")) });
  const asg = await inv("assignWorkflow", { pageId: p.id, spaceKey: SPACE, workflowId: "default", actor: REQUESTER });
  expect(asg.result, "workflow assigned").toBeTruthy();
  await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "in_review", actor: REQUESTER });
  expect((await getKvs(`workflow-state-${p.id}`))?.stateId).toBe("in_review");
  return p;
}

test("an approved transition keeps who decided, when, why and for which version", async () => {
  const p = await seedInReview(`HARNESS sv-evidence approve ${Date.now()}`);
  try {
    const ra = await inv("requestApproval", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, mode: "any", actor: REQUESTER });
    expect(ra.result?.pending, `approval requested (got ${JSON.stringify(ra.result)})`).toBe(true);
    const pending = await getKvs(`workflow-pending-${p.id}`);
    const pinned = pending?.pinnedVersion;
    expect(typeof pinned === "number" || pinned === null, "the pending record pins a version (or null on a page the seam could not read)").toBe(true);

    const dec = await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "approved", reason: "Looks complete and accurate" });
    expect(dec.result?.outcome, `approve completes (got ${JSON.stringify(dec.result)})`).toBe("approved");
    expect(dec.result?.transitioned, "…and the page moved").toBe(true);

    const wf = (await inv("getWorkflow", { pageId: p.id, spaceKey: SPACE, withLog: "1", actor: MIHAI })).result;
    expect(wf?.record?.stateId, "page is Approved").toBe("approved");
    const rec = wf.record.approvalRecord;
    expect(rec, "the approval record is kept on the state record").toBeTruthy();
    expect(rec.outcome).toBe("approved");
    expect(rec.mode).toBe("any");
    expect(rec.completedBy, "who completed it").toBe(MIHAI);
    expect(rec.completedAt && Number.isFinite(Date.parse(rec.completedAt)), "when").toBe(true);
    expect(Array.isArray(rec.decisions) && rec.decisions.length, "one decision per approver").toBe(1);
    const d = rec.decisions[0];
    expect(d.accountId).toBe(MIHAI);
    expect(d.decision).toBe("approved");
    expect(d.reason, "the reason given is kept").toBe("Looks complete and accurate");
    expect(d.decidedAt && Number.isFinite(Date.parse(d.decidedAt)), "decision time").toBe(true);
    if (pinned != null) {
      expect(d.versionAtDecision, "the version the approver reviewed").toBe(pinned);
      expect(rec.pinnedVersion).toBe(pinned);
      expect(wf.record.approvedVersion, "approvedVersion anchors on the pinned version").toBe(pinned);
    }
    expect(typeof wf.liveVersion === "number" || wf.liveVersion === null, "get-page-workflow reports the live version for the stale line").toBe(true);

    // The log's transition entry carries the same record.
    const log: any[] = wf.log || [];
    const entry = [...log].reverse().find((e) => e.to === "approved");
    expect(entry, "the transition to Approved is logged").toBeTruthy();
    expect(entry.details?.approvalRecord?.decisions?.[0]?.reason, "…with the approval record").toBe("Looks complete and accurate");
    console.log(`### approval record ✓ (${d.decision} by ${MIHAI.slice(-6)} v${d.versionAtDecision ?? "?"}, reason kept)`);

    // Leaving the enforce state clears it — the record belongs to THAT approval.
    const back = await inv("transitionWorkflow", { pageId: p.id, spaceKey: SPACE, to: "draft", actor: MIHAI });
    expect(back.result?.success, `steward moves the page back to Draft (got ${JSON.stringify(back.result)})`).toBe(true);
    const after = (await inv("getWorkflow", { pageId: p.id, spaceKey: SPACE, actor: MIHAI })).result;
    expect(after?.record?.approvalRecord ?? null, "leaving Approved clears the approval record").toBeNull();
    console.log("### record cleared on leaving the enforce state ✓");
  } finally {
    await cleanup(p.id);
  }
});

test("a denied approval leaves a durable trace with the reason", async () => {
  const p = await seedInReview(`HARNESS sv-evidence deny ${Date.now()}`);
  try {
    await inv("requestApproval", { pageId: p.id, spaceKey: SPACE, to: "approved", toName: "Approved", approvers: MIHAI, mode: "any", actor: REQUESTER });
    const dec = await inv("decideApproval", { pageId: p.id, approver: MIHAI, decision: "denied", reason: "Budget table is missing" });
    expect(dec.result?.outcome, `deny resolves (got ${JSON.stringify(dec.result)})`).toBe("denied");
    expect(await getKvs(`workflow-pending-${p.id}`), "pending cleared on denial").toBeFalsy();

    const wf = (await inv("getWorkflow", { pageId: p.id, spaceKey: SPACE, withLog: "1", actor: MIHAI })).result;
    expect(wf?.record?.stateId, "the page stays In Review").toBe("in_review");
    const log: any[] = wf.log || [];
    const denied = [...log].reverse().find((e) => e.kind === "approval-denied" || e.details?.approvalRecord?.outcome === "denied");
    expect(denied, "the denial is logged").toBeTruthy();
    const rec = denied.details?.approvalRecord;
    expect(rec?.outcome).toBe("denied");
    expect(rec?.decisions?.[0]?.decision).toBe("denied");
    expect(rec?.decisions?.[0]?.reason, "the denial reason is kept").toBe("Budget table is missing");
    console.log("### denial trace ✓");
  } finally {
    await cleanup(p.id);
  }
});
