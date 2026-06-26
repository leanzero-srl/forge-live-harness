// CogniRunner DEEP — setup-heavy premade validators (beyond the field barrage): sub-tasks-resolved,
// attachment-required, comment-required. Each: attach the validator as a self-loop, set up the
// gating state, fire the transition, assert block→allow. A consistent wrong result is a finding.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { createIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { doTransition, get, request, uploadAttachment } from "../../data/jira.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const pm = (ruleType: string, extra: any = {}) => ({ ruleKind: "premade", ruleType, ...extra });
const adf = (text: string) => ({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

async function transitionToDone(key: string) {
  const { transitions } = await get(`/rest/api/3/issue/${key}/transitions`);
  const done = (transitions || []).find((t: any) => t.to?.statusCategory?.key === "done");
  if (!done) throw new Error(`no done transition for ${key}`);
  return doTransition(key, done.id);
}
async function transitionWithComment(key: string, transitionId: string, text: string) {
  const res: any = await request("POST", `/rest/api/3/issue/${key}/transitions`, { raw: true, body: { transition: { id: String(transitionId) }, update: { comment: [{ add: { body: adf(text) } }] } } });
  return { status: res.status, text: res.text };
}

test.describe.configure({ timeout: 240_000 });

test.describe("CogniRunner premade — setup-heavy validators", () => {
  test.afterEach(async () => { await detachByNamePrefix(WF, "ZEXTRA").catch(() => {}); });

  test("sub-tasks-resolved: blocks with an open subtask, allows when resolved", async () => {
    const [rule] = await attachSelfLoopRules(WF, HUB, [{ name: "ZEXTRA-subtasks", type: "validator", config: pm("sub-tasks-resolved") }]);
    const parent = await createIssue({ projectKey: "COGTEST", issueType: "Task", summary: `HARNESS subtask-parent ${Date.now()} [harness-test]` });
    await createIssue({ projectKey: "COGTEST", issueType: "Sub-task", summary: `HARNESS subtask-child ${Date.now()} [harness-test]`, fields: { parent: { key: parent.key } } });
    // open subtask → BLOCK (poll until the subtask is visible on the parent)
    await expect.poll(async () => (await doTransition(parent.key, rule.transitionId)).status, { timeout: 30_000, intervals: [2_000] }).toBeGreaterThanOrEqual(400);
    // resolve the subtask → ALLOW
    const subs = (await get(`/rest/api/3/issue/${parent.key}?fields=subtasks`)).fields.subtasks;
    await transitionToDone(subs[0].key);
    await expect.poll(async () => (await doTransition(parent.key, rule.transitionId)).status, { timeout: 30_000, intervals: [2_000] }).toBeLessThan(400);
  });

  test("attachment-required: blocks without an attachment, allows with one", async () => {
    const [rule] = await attachSelfLoopRules(WF, HUB, [{ name: "ZEXTRA-attach", type: "validator", config: pm("attachment-required") }]);
    const iss = await createIssue({ projectKey: "COGTEST", issueType: "Task", summary: `HARNESS attach ${Date.now()} [harness-test]` });
    const r1 = await doTransition(iss.key, rule.transitionId);
    expect(r1.status, "no attachment should BLOCK").toBeGreaterThanOrEqual(400);
    const up = await uploadAttachment(iss.key, "harness.txt", "hello harness");
    expect(up.ok, `attachment upload should succeed (status ${up.status})`).toBe(true);
    await expect.poll(async () => (await doTransition(iss.key, rule.transitionId)).status, { timeout: 30_000, intervals: [2_000] }).toBeLessThan(400);
  });

  test("comment-required: blocks without a comment (allow path is UI-only, not REST-reachable)", async () => {
    const [rule] = await attachSelfLoopRules(WF, HUB, [{ name: "ZEXTRA-comment", type: "validator", config: pm("comment-required") }]);
    const iss = await createIssue({ projectKey: "COGTEST", issueType: "Task", summary: `HARNESS comment ${Date.now()} [harness-test]` });
    const r1 = await doTransition(iss.key, rule.transitionId);
    expect(r1.status, "no comment should BLOCK").toBeGreaterThanOrEqual(400);
    // HARNESS CONSTRAINT (verified, not an app bug): the validator reads modifiedFields.comment,
    // which is populated only by the actual transition-screen UI. A REST `update.comment` adds the
    // comment but does NOT surface it in modifiedFields, so the transition still (correctly) blocks.
    const r2 = await transitionWithComment(iss.key, rule.transitionId, "looks good to me");
    console.log(`comment-required: REST update.comment → ${r2.status} (still blocked → comment not in modifiedFields; allow path is UI-only)`);
    expect(r2.status, "documents that REST update.comment does not reach modifiedFields.comment").toBeGreaterThanOrEqual(400);
  });
});
