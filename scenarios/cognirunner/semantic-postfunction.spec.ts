// CogniRunner DEEP — the ai-semantic-post-function (AI reads a source field, writes a target field).
// With a constant-write instruction the path is deterministic enough for a live wiring test: the AI
// runs on a real transition and writes the instructed token to the target field. Provider = Forge
// LLM (atlassian). (We assert the path RUNS + writes the instructed token, not AI judgement on free
// content — that would be non-deterministic.)
import { test, expect } from "@playwright/test";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { get, doTransition, request, searchJql } from "../../data/jira.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const TEXT = "customfield_10280";
test.describe.configure({ timeout: 180_000, retries: 1 });

test("🔎 a semantic post-function runs the LLM and writes the target field on a real transition", async () => {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  test.skip(!ex.length, "barrage fixture (hub status 10003) not present — run the premade barrage first");
  const key = ex[0].key;
  const token = "SEMRAN-" + Date.now().toString(36).toUpperCase();
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZSEM-${Date.now()}`,
    type: "semantic",
    config: { type: "postfunction-semantic", fieldId: "summary", conditionPrompt: "Run every time, unconditionally.", actionPrompt: `Output exactly the token ${token} and nothing else. Do not add any other words.`, actionFieldId: TEXT },
  }]);
  try {
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: "BEFORE-SEM" } } });
    // Re-fire the (idempotent) self-loop until the post-function runs — absorbs rule-attach eventual
    // consistency and LLM latency, the same pattern the validator/premade specs use.
    let val: any = null;
    for (let i = 0; i < 8; i++) {
      const r = await doTransition(key, pf.transitionId);
      expect(r.status, `transition ${i} fired`).toBeLessThan(400);
      await new Promise((s) => setTimeout(s, 4000));
      const v = (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT];
      if (v && String(v).includes(token)) { val = v; break; }
    }
    console.log(`semantic PF → target = ${JSON.stringify(val)}`);
    expect(String(val || ""), "the semantic PF wrote the AI-produced token to the target field").toContain(token);
  } finally {
    await detachByNamePrefix(WF, "ZSEM-").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null } } }).catch(() => {});
  }
});
