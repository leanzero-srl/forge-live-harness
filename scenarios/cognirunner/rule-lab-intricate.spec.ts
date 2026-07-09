// RULE-EXERCISE LAB — the INTRICATE tier (escalation queue). Three independent deep-backend tests on
// COGTEST, each pushing a rule kind harder than the corpus and auditing the execution LOG as the oracle:
//   1. MULTI-STEP STATIC PF  — searchJql → conditional addComment → addLabels + updateIssue, with a
//      value passed step→step. Asserts all THREE effects + the "3/3 steps OK" log + change count.
//   2. SEMANTIC read-BRANCH PF — the LLM READS the description and BRANCHES (URGENT → emit a token,
//      else SKIP), writing the token to a target field. Asserts the branch was taken (read happened).
//   3. AGENTIC AI validator   — enableTools JQL duplicate-detection. SAFETY-asserted (no crash, clean
//      verdict, a log) because Forge-LLM agentic can DEGRADE (the known 400) — we watch + record it.
// Tests are separate so a flaky AI test never fails the deterministic static one.
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { get, doTransition, request, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { setField, waitForLog } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const TEXT = "customfield_10280";
test.describe.configure({ timeout: 240_000, retries: 0 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}

test("🔧 multi-step static PF: searchJql → conditional comment → labels+field, all effects + log", async () => {
  const key = await fixtureKey();
  test.skip(!key, "HARNESS-BARRAGE-FIXTURE missing on COGTEST");
  const marker = "rule-lab multistep";
  const label = "rule-lab-multistep";
  const functions = [
    { id: crypto.randomUUID(), name: "count active siblings", variableName: "sibs",
      code: `const r = await api.searchJql('project = COGTEST AND statusCategory != Done'); return (r.issues || []).length;` },
    { id: crypto.randomUUID(), name: "comment when siblings exist",
      code: `if (sibs > 0) { await api.addComment('${marker}: ' + sibs + ' active sibling(s) at transition.'); }` },
    { id: crypto.randomUUID(), name: "label + write field",
      code: `await api.addLabels('${label}'); await api.updateIssue(api.context.issueKey, { ${TEXT}: 'MS-OK-' + sibs });` },
  ];
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZINT-static-${Date.now()}`, type: "static",
    config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF }, functions },
  }]);
  try {
    await setField(key!, { [TEXT]: "BEFORE-MS", labels: [] });
    await new Promise((s) => setTimeout(s, 2000));
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    // Wait for the field write (terminal effect of step 3).
    let fieldVal: any = null;
    for (let i = 0; i < 16; i++) {
      await new Promise((s) => setTimeout(s, 2500));
      const v = (await get(`/rest/api/3/issue/${key}?fields=${TEXT},labels`)).fields;
      if (v[TEXT] && String(v[TEXT]).startsWith("MS-OK-")) { fieldVal = v; break; }
    }
    expect(fieldVal, "step 3 wrote the target field (MS-OK-<count>)").toBeTruthy();
    console.log(`static PF field=${JSON.stringify(fieldVal[TEXT])} labels=${JSON.stringify(fieldVal.labels)}`);
    // effect assertions
    expect(String(fieldVal[TEXT]), "field carries the passed step-1 count").toMatch(/^MS-OK-\d+$/);
    expect(fieldVal.labels, "step 3 added the label (merge)").toContain(label);
    const comments = (await get(`/rest/api/3/issue/${key}?fields=comment`)).fields.comment.comments || [];
    const mine = comments.filter((c: any) => JSON.stringify(c.body).includes(marker));
    expect(mine.length, "step 2 added the conditional comment").toBeGreaterThan(0);
    // LOG oracle
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-static", since, { tries: 10, gapMs: 2500 }).catch(() => null);
    console.log(`static PF log: ${log ? JSON.stringify({ isValid: log.isValid, steps: log.steps, changes: log.changes, reason: String(log.reason || "").slice(0, 80) }) : "NONE"}`);
    expect(log, "a postfunction-static log was written").toBeTruthy();
    expect(log.isValid, "log reports success").toBe(true);
    expect(log.steps, "log records 3 steps").toBe(3);
    expect(log.changes, "log records >=2 changes (comment+label+field)").toBeGreaterThanOrEqual(2);
  } finally {
    await detachByNamePrefix(WF, "ZINT-static").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null }, update: { labels: [{ remove: label }] } } }).catch(() => {});
    // delete our marker comments so the fixture doesn't accumulate them
    try {
      const cs = (await get(`/rest/api/3/issue/${key}?fields=comment`)).fields.comment.comments || [];
      for (const c of cs.filter((x: any) => JSON.stringify(x.body).includes(marker)))
        await request("DELETE", `/rest/api/3/issue/${key}/comment/${c.id}`, { raw: true }).catch(() => {});
    } catch { /* best-effort */ }
  }
});

test("🧠 semantic read-branch PF: LLM reads description, branches on URGENT, writes the token", async () => {
  const key = await fixtureKey();
  test.skip(!key, "HARNESS-BARRAGE-FIXTURE missing on COGTEST");
  const token = "URG-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZINT-sem-${Date.now()}`, type: "semantic",
    config: {
      type: "postfunction-semantic", fieldId: "description",
      conditionPrompt: "Run every time, unconditionally.",
      actionPrompt: `Read the SOURCE field text. If it contains the word URGENT, output exactly the token ${token}. If it does NOT contain URGENT, output exactly the word SKIP. Output only that single token and nothing else.`,
      actionFieldId: TEXT,
    },
  }]);
  try {
    // description is rich text → write as ADF containing URGENT (branch-true).
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: {
      description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "This request is URGENT and must be handled immediately." }] }] },
      [TEXT]: "BEFORE-SEM",
    } } });
    let val: any = null, log: any = null;
    for (let i = 0; i < 8; i++) {
      const since = Date.now();
      const r = await doTransition(key!, pf.transitionId);
      expect(r.status, `transition ${i} fired`).toBeLessThan(400);
      await new Promise((s) => setTimeout(s, 4000));
      const v = (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT];
      if (v && String(v).includes(token)) {
        val = v;
        log = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-semantic", since, { tries: 4, gapMs: 2000 }).catch(() => null);
        break;
      }
    }
    console.log(`semantic branch → target=${JSON.stringify(val)} log=${log ? JSON.stringify({ isValid: log.isValid, model: log.modelUsed, reason: String(log.reason || "").slice(0, 70) }) : "NONE"}`);
    expect(String(val || ""), "the LLM read URGENT and wrote the branch token (proves source-read + branch)").toContain(token);
    expect(String(val || ""), "did NOT take the SKIP branch").not.toContain("SKIP");
  } finally {
    await detachByNamePrefix(WF, "ZINT-sem").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null } } }).catch(() => {});
  }
});

test("🕵️ agentic AI validator: enableTools JQL duplicate-detection — safety + degrade watch", async () => {
  const key = await fixtureKey();
  test.skip(!key, "HARNESS-BARRAGE-FIXTURE missing on COGTEST");
  const [v] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZINT-agentic-${Date.now()}`, type: "validator",
    config: {
      fieldId: "summary", enableTools: true,
      prompt: "You can search Jira with JQL. Search the COGTEST project for a DIFFERENT issue whose summary is very similar to this issue's summary. If you find a likely duplicate, this field is INVALID (block the transition) and say which key. If you find none, it is VALID.",
    },
  }]);
  try {
    const since = Date.now();
    const r = await doTransition(key!, v.transitionId);
    console.log(`agentic validator transition → ${r.status}`);
    // SAFETY: never a crash (5xx). A clean 204 (allow / fail-open) or 400 (block) are both acceptable.
    expect(r.status, "no server crash — agentic path returns a clean verdict").toBeLessThan(500);
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "validator" && l.ruleKind !== "premade", since, { tries: 14, gapMs: 3000 }).catch(() => null);
    console.log(`agentic log: ${log ? JSON.stringify({ isValid: log.isValid, mode: log.mode, tool: log.toolMeta, transient: log.transientError, reason: String(log.reason || "").slice(0, 120) }) : "NONE"}`);
    expect(log, "an AI-validator log was written (path ran, not a silent no-op)").toBeTruthy();
    expect(typeof log.isValid, "verdict is a clean boolean").toBe("boolean");
    // If it blocked, the reason must be a real message (not empty/garbage). If it degraded, that's recorded above.
    if (log.isValid === false) expect(String(log.reason || "").length, "a block carries a real reason").toBeGreaterThan(3);
  } finally {
    await detachByNamePrefix(WF, "ZINT-agentic").catch(() => {});
  }
});
