// RULE-EXERCISE LAB — OFFLOADED static-PF runtime (live, on COGTEST).
// When a static-PF config serializes > ~24KB, the backend offloads the code to a separate
// pf_code:{id}:{hash} KVS entry and keeps only slim functionsMeta in the registry; at runtime
// executeStaticPostFunction RE-READS pf_code and executes it. That runtime read+execute path is
// only render-tested elsewhere (mock config-view) — here we prove it LIVE: a >24KB step must still
// run and land its effect (if offload were broken, a >24KB config would blow the 32KB KVS value cap
// and the rule would fail to save/run — so a landed effect proves the offload round-trip worked).
// Deterministic (no AI).
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
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));
test.describe.configure({ timeout: 240_000, retries: 0 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}

test("📦 offloaded static PF: a >24KB config re-reads pf_code + executes at runtime", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  const marker = "OFFLOAD-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  // ~26KB inert string literal forces the config over the ~24KB offload threshold (under the 32KB
  // editor cap). The real effect is a single updateIssue writing the marker.
  const pad = "x".repeat(26000);
  const code = `const _pad = "${pad}".length; // inert bulk to force config offload to pf_code
    await api.updateIssue(api.context.issueKey, { ${TEXT}: '${marker}' });`;
  const codeBytes = code.length;
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZOFF-${Date.now()}`, type: "static",
    config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF }, functions: [{ id: crypto.randomUUID(), name: "step", code }] },
  }]);
  try {
    await setField(key!, { [TEXT]: "pre-offload" });
    await sleep(2000);
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired (offloaded PF runs post-transition, no 5xx)").toBeLessThan(500);
    let val: any = null;
    for (let i = 0; i < 16; i++) {
      await sleep(2500);
      const v = (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT];
      if (v && String(v) === marker) { val = v; break; }
    }
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-static", since, { tries: 6, gapMs: 2000 }).catch(() => null);
    console.log(`offloaded PF → codeBytes=${codeBytes} effect=${JSON.stringify(val)} log=${log ? JSON.stringify({ isValid: log.isValid, reason: String(log.reason || "").slice(0, 60) }) : "NONE"}`);
    // The config was well over the offload threshold; the effect landing proves the pf_code
    // round-trip (offload on save → re-read + execute at runtime) works.
    expect(codeBytes, "the step code is over the ~24KB offload threshold").toBeGreaterThan(24000);
    expect(val, "the offloaded static PF executed and wrote its marker at runtime").toBe(marker);
    expect(log?.isValid, "the offloaded PF logged success").toBe(true);
  } finally {
    await detachByNamePrefix(WF, "ZOFF").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null } } }).catch(() => {});
  }
});
