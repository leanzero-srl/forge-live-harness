// Push the rule bed toward the MCPs (context7 / web-search / doc-processor) + reproduce/diagnose the
// tool-usage 502 (Test = tools/list works; the real agentic tools/call got 502). Attaches persistent
// ZMCP- rules across all MCP flavors, seeds the fixture, fires them (bounded — heavy/async), so the
// forge logs show the actual mcpRpc tool calls + any errors. Run: node scenarios/cognirunner/scale/mcp-exercise.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachSelfLoopRules, statusRefByName } from "../../../data/cogni-workflow.mjs";
import { request, doTransition, searchJql } from "../../../data/jira.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const here = path.dirname(fileURLToPath(import.meta.url));
const HOOK = process.env.COGNI_TESTHOOK_URL, SECRET = process.env.HARNESS_SECRET;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const adf = (text) => ({ type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

const specs = [
  { name: `ZMCP-research1`, type: "semantic", mcp: "web-search",
    config: { type: "postfunction-research", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      researchQuery: "Atlassian Forge app KVS storage limits and rate limiting best practices", researchTitle: "ZMCP Forge KVS Research", runAsync: true, debugTrace: true } },
  { name: `ZMCP-research2`, type: "semantic", mcp: "web-search",
    config: { type: "postfunction-research", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      researchQuery: "Jira Cloud REST API transition rate limits cost-based throttling", researchTitle: "ZMCP Jira Rate Limits", runAsync: true, debugTrace: true } },
  { name: `ZMCP-researchdoc1`, type: "semantic", mcp: "web+context7+doc-processor",
    config: { type: "postfunction-research-doc", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      contentPrompt: "Summarize best practices for the topic into Problem, Options, Recommendation.", researchTitle: "ZMCP Research Brief", researchSources: ["web", "context7"], docFormat: "markdown", runAsync: true, debugTrace: true } },
  { name: `ZMCP-generatedoc1`, type: "semantic", mcp: "doc-processor",
    config: { type: "postfunction-generate-doc", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      contentPrompt: "Summarize the source into a short structured brief: Problem, Impact, Next steps.", docTitlePrompt: "ZMCP Generated Brief", docFormat: "markdown", runAsync: true, debugTrace: true } },
  { name: `ZMCP-generatedoc2`, type: "semantic", mcp: "doc-processor",
    config: { type: "postfunction-generate-doc", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      contentPrompt: "Produce a one-page runbook from the source.", docTitlePrompt: "ZMCP Runbook", docFormat: "docx", runAsync: true, debugTrace: true } },
  { name: `ZMCP-crosscheck1`, type: "semantic", mcp: "web+doc-processor (fact-check)",
    config: { type: "postfunction-semantic", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      conditionPrompt: "Run every time.", actionPrompt: "Classify the factual accuracy of the source as ACCURATE, MIXED, or UNVERIFIED. Output only that token.", actionFieldId: "customfield_10280",
      crossCheckClaims: true, runAsync: true, debugTrace: true } },
];

const KEY = "COGTEST-2476";
// seed a description with a research-worthy topic + factual claims (for fact-check + research).
await request("PUT", `/rest/api/3/issue/${KEY}`, { raw: true, body: { fields: { description: adf(
  "The Atlassian Forge KVS has a 240KiB per-value limit and synchronous resolvers time out at 25 seconds. Jira Cloud REST enforces cost-based rate limits on transitions. React 18 was released in 2022. This brief needs external verification and a generated summary document.") } } });

const hub = await statusRefByName(WF, "Backlog");
const res = await attachSelfLoopRules(WF, hub, specs, 9860);
console.log(`[mcp] attached ${res.length} MCP-pushing rules (persistent):`);
res.forEach((r, i) => console.log(`   ${specs[i].name.padEnd(20)} [${specs[i].mcp}] tid=${r.transitionId}`));
if (HOOK && SECRET) {
  const rules = res.map((r) => ({ instanceId: r.ruleId, type: "postfunction-semantic", fieldId: "description", prompt: "mcp", workflowName: WF, transitionId: r.transitionId, transitionName: r.name }));
  const rr = await fetch(HOOK, { method: "POST", headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "registerRules", rules }) }).then((x) => x.json());
  console.log(`[mcp] registerRules: ${JSON.stringify(rr)}`);
}
await sleep(3000);

// fire each MCP rule twice (bounded — heavy/async), on the seeded fixture
const pool = [KEY, ...(await searchJql(`project = COGTEST AND status = "Backlog" ORDER BY created DESC`, ["key"], 4)).map((i) => i.key)];
let n = 0;
for (let round = 0; round < 2; round++) {
  for (let i = 0; i < res.length; i++) {
    const key = pool[(n++) % pool.length];
    if (specs[i].config.fieldId === "description" && key !== KEY) { try { await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { description: adf("Forge KVS 240KiB limit; verify externally and generate a brief.") } } }); } catch {} }
    try { const r = await doTransition(key, res[i].transitionId); console.log(`[mcp] fire ${specs[i].name} on ${key} -> ${r.status}`); }
    catch (e) { console.log(`[mcp] fire ${specs[i].name} -> ERR ${e?.status || e?.message}`); }
    await sleep(1500);
  }
}
fs.writeFileSync(path.join(here, "mcp-fired.json"), JSON.stringify(res.map((r, i) => ({ name: specs[i].name, mcp: specs[i].mcp, transitionId: r.transitionId })), null, 2));
console.log(`\n[mcp] fired all MCP rules. Async flavors queue to the 110s consumer — waiting 90s for tool calls to hit the MCPs, then pull forge logs.`);
await sleep(90000);
console.log(`[mcp] done — now grep forge logs for mcpRpc / tools-call / 502.`);
