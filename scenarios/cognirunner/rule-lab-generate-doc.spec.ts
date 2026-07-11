// RULE-EXERCISE LAB L26 — SEMANTIC GENERATE-DOC managed flavor (postfunction-generate-doc), the first
// managed flavor that crosses the ATTACHMENT-BRIDGE / doc-processor MCP hop: AI authors {title, content} →
// callDocProcessorCreate renders the file on the Mac Studio doc-processor + attaches it to the issue via a
// minted upload cap. docReader MCP is enabled + the doc-processor remote URL is configured, so the SUCCESS
// path is reachable IF the Mac Studio Funnel is up. Adversarial: assert EITHER (a) success → a NEW attachment
// appears + isValid=true + the log names the doc; OR (b) an HONEST degrade (isValid=false with a clear reason,
// or a SKIP) — a silent wrong-success (isValid=true but NO attachment) or a crash would be a DEFECT.
// Runs on Forge LLM (authoring). Bounded (one fire). Any created attachment is left on the disposable fixture.
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

test("📎 semantic GENERATE-DOC flavor: AI authors + attaches a doc via the doc-processor bridge", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: {
    description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Rule-lab generate-doc source: the login service intermittently returns 500 on token refresh under load; summarize the problem, impact, and next steps into a short brief." }] }] } } } });
  const before = await attachCount(key!);
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZSMG-${Date.now()}`, type: "semantic",
    config: { type: "postfunction-generate-doc", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      contentPrompt: "Summarize the source into a short, structured brief: Problem, Impact, Next steps.",
      docTitlePrompt: "Login 500 Brief", docFormat: "markdown" },
  }]);
  try {
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    // Attachment creation crosses AI authoring + the MCP hop — poll generously.
    let after = before;
    for (let i = 0; i < 22; i++) { await sleep(3000); after = await attachCount(key!); if (after > before) break; }
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-generate-doc", since, { tries: 10, gapMs: 3000 }).catch(() => null);
    console.log(`generate-doc → attach ${before}→${after} log=${log ? JSON.stringify({ isValid: log.isValid, decision: log.decision, reason: String(log.reason || "").slice(0, 110) }) : "NONE"}`);
    expect(log, "a postfunction-generate-doc execution log was written").toBeTruthy();
    expect(["GENERATE", "SKIP"], "decision is a valid generate-doc outcome").toContain(log.decision);
    if (log.isValid === true && log.decision === "GENERATE") {
      // SUCCESS path: the doc-processor rendered + attached — a new attachment MUST exist, and the log names it.
      expect(after, "a successful GENERATE attached a new file to the issue").toBeGreaterThan(before);
      expect(String(log.reason || ""), "the log names the generated/attached doc").toMatch(/attached|generated/i);
    } else {
      // DEGRADE path (MCP down / docReader off / budget): must be HONEST + must NOT have attached anything.
      const honest = log.isValid === false || /skip|mcp|doc-reader|doc processor|unreachable|failed|budget|no api|capability/i.test(String(log.reason || ""));
      expect(honest, "a non-success is honestly logged (not a silent wrong-success)").toBeTruthy();
      expect(after, "a failed/skipped generate-doc did NOT attach a file").toBe(before);
    }
  } finally {
    await detachByNamePrefix(WF, "ZSMG").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { description: null } } }).catch(() => {});
  }
});
