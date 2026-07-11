// RULE-EXERCISE LAB L27 — SEMANTIC RESEARCH managed flavor (postfunction-research), the last untested MCP hop:
// the WEB-SEARCH MCP. On a transition it runs a web search (Mac Studio Funnel web-search MCP), the AI authors
// a brief, and it SAVES a doc to the Documentation Library (doc_repo). runAsync:true gives the 110s budget so
// the slow web search (30–90s) can complete (the inline ~17s path would just degrade). Fixed title →
// update-on-rerun (no doc accumulation). Adversarial: success → the library holds the titled doc + isValid=true
// + a named log; degrade (web-search down / budget / save fail) → an HONEST failure/skip; a silent wrong-success
// = DEFECT. Runs on Forge LLM (authoring). Bounded (one fire). The research doc is left in the library.
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { doTransition, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { waitForLog } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));
test.describe.configure({ timeout: 300_000, retries: 1 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}
async function docTitles(): Promise<string[]> {
  const r = await fetch(`${HOOK}?what=kvs&key=doc_repo_index`, { headers: { Authorization: `Bearer ${SECRET}` } });
  const v = (await r.json()).value;
  const arr = Array.isArray(v) ? v : (v?.docs || v?.index || []);
  return (Array.isArray(arr) ? arr : []).map((d: any) => String(d.title || d.name || ""));
}

test("🔎 semantic RESEARCH flavor: web-search MCP → saves a doc to the library (postfunction-research log)", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  const TITLE = "Rule-Lab Research Probe";
  const before = await docTitles();
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZSMR-${Date.now()}`, type: "semantic",
    config: { type: "postfunction-research", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      researchQuery: "Atlassian Forge app KVS storage limits and best practices", researchTitle: TITLE, runAsync: true },
  }]);
  try {
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    // Web search is slow (30–90s) + async queue delay — poll the library generously.
    let titles = before;
    for (let i = 0; i < 30; i++) { await sleep(3000); titles = await docTitles(); if (titles.includes(TITLE)) break; }
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-research", since, { tries: 15, gapMs: 3000 }).catch(() => null);
    const hasDoc = titles.includes(TITLE);
    console.log(`research → docLib ${before.length}→${titles.length} hasProbeDoc=${hasDoc} log=${log ? JSON.stringify({ isValid: log.isValid, decision: log.decision, reason: String(log.reason || "").slice(0, 110) }) : "NONE"}`);
    expect(log, "a postfunction-research execution log was written").toBeTruthy();
    expect(["RESEARCH", "SKIP"], "decision is a valid research outcome").toContain(log.decision);
    if (log.isValid === true && log.decision === "RESEARCH") {
      // SUCCESS: the web-search brief was saved to the Documentation Library.
      expect(hasDoc, "a successful RESEARCH saved the titled doc to the library").toBe(true);
      expect(String(log.reason || ""), "the log names the saved research").toMatch(/saved|updated|research/i);
    } else {
      // DEGRADE (web-search MCP down / budget / save fail): must be HONEST, not a silent wrong-success.
      const honest = log.isValid === false || /skip|web.?search|mcp|unreachable|failed|no research query|budget/i.test(String(log.reason || ""));
      expect(honest, "a non-success is honestly logged (not a silent wrong-success)").toBeTruthy();
    }
  } finally {
    await detachByNamePrefix(WF, "ZSMR").catch(() => {});
    // The research doc (fixed title) is left in the library — update-on-rerun, so it never accumulates.
  }
});
