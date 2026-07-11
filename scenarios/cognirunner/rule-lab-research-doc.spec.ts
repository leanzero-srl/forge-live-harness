// RULE-EXERCISE LAB L28 — SEMANTIC RESEARCH-DOC managed flavor (postfunction-research-doc), the LAST managed
// flavor + the last untested MCP service (context7). It gathers evidence from web-search AND context7
// (researchSources:["web","context7"]), the AI authors a brief, and it ATTACHES the doc to the issue via the
// doc-processor bridge. Combines the web-search hop (L27) + the attachment hop (L26) + adds context7. runAsync
// for the 110s budget. Adversarial: success → a NEW attachment + isValid=true + named log; degrade → HONEST
// fail/skip; silent wrong-success = DEFECT. Runs on Forge LLM. Bounded. Attachment left on the disposable fixture.
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
test.describe.configure({ timeout: 300_000, retries: 1 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}
const attachCount = async (key: string) => ((await get(`/rest/api/3/issue/${key}?fields=attachment`)).fields.attachment || []).length;

test("📑 semantic RESEARCH-DOC flavor: web+context7 evidence → authors + attaches a brief", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: {
    description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Rule-lab research-doc source: summarize best practices for Atlassian Forge KVS storage and rate limits." }] }] } } } });
  const before = await attachCount(key!);
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZSMD-${Date.now()}`, type: "semantic",
    config: { type: "postfunction-research-doc", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      researchQuery: "Atlassian Forge KVS storage limits, entity properties, and rate-limit best practices",
      researchTitle: "Forge KVS Research Brief", researchSources: ["web", "context7"], docFormat: "markdown", runAsync: true },
  }]);
  try {
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    // web+context7 evidence + authoring + attach — slow; poll generously.
    let after = before;
    for (let i = 0; i < 30; i++) { await sleep(3000); after = await attachCount(key!); if (after > before) break; }
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-research-doc", since, { tries: 15, gapMs: 3000 }).catch(() => null);
    console.log(`research-doc → attach ${before}→${after} log=${log ? JSON.stringify({ isValid: log.isValid, decision: log.decision, reason: String(log.reason || "").slice(0, 120) }) : "NONE"}`);
    expect(log, "a postfunction-research-doc execution log was written").toBeTruthy();
    expect(["RESEARCH_DOC", "SKIP"], "decision is a valid research-doc outcome").toContain(log.decision);
    if (log.isValid === true && log.decision === "RESEARCH_DOC") {
      expect(after, "a successful RESEARCH_DOC attached a new brief to the issue").toBeGreaterThan(before);
      expect(String(log.reason || ""), "the log names the attached brief").toMatch(/attach|research|brief|generated/i);
    } else {
      const honest = log.isValid === false || /skip|web.?search|context7|mcp|evidence|unreachable|failed|budget|no research|capability/i.test(String(log.reason || ""));
      expect(honest, "a non-success is honestly logged (not a silent wrong-success)").toBeTruthy();
      expect(after, "a failed/skipped research-doc did NOT attach").toBe(before);
    }
  } finally {
    await detachByNamePrefix(WF, "ZSMD").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { description: null } } }).catch(() => {});
  }
});
