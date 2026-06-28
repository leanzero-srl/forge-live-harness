// CogniRunner DEEP — the ai-static-post-function module (deterministic). The AI generates the code,
// but once saved it runs deterministically: a sandbox JS step runs on a REAL Jira transition and
// writes a field, asserted via REST. This closes the post-function gap the premade-barrage doesn't.
//
// NOTE on the condition module (ai-text-field-condition): Forge workflow CONDITIONS are
// UI-visibility-only — the REST transition API executes the transition regardless (verified: with a
// field-has-value condition false, doTransition still returns 204). So conditions are not cleanly
// REST-testable; they'd need real Jira-UI driving. Documented in findings/coverage-cognirunner.md.
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { get, doTransition, request, searchJql } from "../../data/jira.mjs";
import { waitForTerminal } from "../_support/wait";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const TEXT = "customfield_10280";

test.describe.configure({ timeout: 180_000 });

test("🔎 a static post-function runs saved sandbox JS on a real transition and writes a field", async () => {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  test.skip(!ex.length, "barrage fixture (in hub status 10003) not present — run the premade barrage first");
  const key = ex[0].key;
  const tag = "PFRAN-" + Date.now().toString(36);
  const code = `await api.updateIssue(api.context.issueKey, { ${TEXT}: '${tag}' });`;
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZPF-static-${Date.now()}`,
    type: "static",
    config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF }, functions: [{ id: crypto.randomUUID(), name: "set field", code }] },
  }]);
  try {
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: "BEFORE-PF" } } });
    const r = await doTransition(key, pf.transitionId);
    console.log(`static PF transition → ${r.status}`);
    expect(r.status, "transition fired").toBeLessThan(400);
    const val = await waitForTerminal(async () => {
      const v = (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT];
      return v === tag ? v : false;
    }, { timeout: 40_000, interval: 2_500, label: "static PF wrote the field" });
    console.log(`static PF → field = ${JSON.stringify(val)} ✓`);
    expect(val, "the static post-function's saved JS wrote the field").toBe(tag);
  } finally {
    await detachByNamePrefix(WF, "ZPF-").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null } } }).catch(() => {});
  }
});
