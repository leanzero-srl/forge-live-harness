// RULE-EXERCISE LAB — the last big REST-reachable runtime gap: SEMANTIC MANAGED flavors (AI-driven).
//   comment-draft (type "postfunction-comment"): AI reads a source field, drafts + POSTS a comment.
//   subtask       (type "postfunction-subtask"):  AI reads a source field, CREATES a sub-task.
// Both run on Forge LLM (getOpenAIKey → FORGE_LLM_SENTINEL, so they don't skip). We assert the MANAGED
// EFFECT landed (a new comment / a new sub-task) + the execution log has the right type + isValid.
// AI/Forge-LLM — bounded (a few fires). asApp-authored effects can't be cleaned by harness user auth;
// they're left on the disposable fixture.
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { get, doTransition, request, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { waitForLog } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));
test.describe.configure({ timeout: 240_000, retries: 1 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}

test("💬 semantic comment-draft flavor: AI drafts + posts a comment (postfunction-comment log)", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  const nonce = "CMT-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  // seed the source (description) so the draft has content to work from.
  await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: {
    description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Rule-lab managed-comment source: the issue is ready for review." }] }] } } } });
  const before = (await get(`/rest/api/3/issue/${key}?fields=comment`)).fields.comment.total;
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZSMC-${Date.now()}`, type: "semantic",
    config: { type: "postfunction-comment", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      commentPrompt: `Write one short sentence noting this issue was auto-reviewed. Include the exact token ${nonce} somewhere in the sentence.` },
  }]);
  try {
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    // wait for the posted comment (AI latency) — count delta is the robust oracle.
    let posted: any = null;
    for (let i = 0; i < 18; i++) {
      await sleep(3000);
      const c = (await get(`/rest/api/3/issue/${key}?fields=comment`)).fields.comment;
      if (c.total > before) { posted = c.comments[c.comments.length - 1]; break; }
    }
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-comment", since, { tries: 8, gapMs: 3000 }).catch(() => null);
    const body = posted ? JSON.stringify(posted.body) : "";
    console.log(`comment-draft → posted=${!!posted} nonceInBody=${body.includes(nonce)} log=${log ? JSON.stringify({ isValid: log.isValid, decision: log.decision, reason: String(log.reason || "").slice(0, 60) }) : "NONE"}`);
    expect(posted, "the managed comment flavor POSTED a new comment").toBeTruthy();
    expect(log, "a postfunction-comment log was written").toBeTruthy();
    expect(log.isValid, "comment flavor succeeded").toBe(true);
    expect(String(log.reason || ""), "log reason confirms a comment was posted").toMatch(/posted a comment/i);
  } finally {
    await detachByNamePrefix(WF, "ZSMC").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { description: null } } }).catch(() => {});
  }
});

test("🌿 semantic subtask flavor: AI creates a sub-task (postfunction-subtask log)", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: {
    description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Rule-lab managed-subtask source: implement the login retry backoff." }] }] } } } });
  const before = ((await get(`/rest/api/3/issue/${key}?fields=subtasks`)).fields.subtasks || []).length;
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZSMS-${Date.now()}`, type: "semantic",
    config: { type: "postfunction-subtask", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      subtaskPrompt: "Create a sub-task capturing the concrete next implementation step implied by the parent." },
  }]);
  try {
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    let subs: any[] = [];
    for (let i = 0; i < 18; i++) {
      await sleep(3000);
      subs = (await get(`/rest/api/3/issue/${key}?fields=subtasks`)).fields.subtasks || [];
      if (subs.length > before) break;
    }
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-subtask", since, { tries: 8, gapMs: 3000 }).catch(() => null);
    console.log(`subtask → count ${before}→${subs.length} newest=${subs[subs.length - 1]?.key} log=${log ? JSON.stringify({ isValid: log.isValid, decision: log.decision, reason: String(log.reason || "").slice(0, 60) }) : "NONE"}`);
    expect(subs.length, "the managed subtask flavor CREATED a sub-task").toBeGreaterThan(before);
    expect(log, "a postfunction-subtask log was written").toBeTruthy();
    expect(log.isValid, "subtask flavor succeeded").toBe(true);
  } finally {
    await detachByNamePrefix(WF, "ZSMS").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { description: null } } }).catch(() => {});
    // sub-task is a real issue — left in place (never delete issues).
  }
});
