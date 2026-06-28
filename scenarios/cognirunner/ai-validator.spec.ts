// CogniRunner DEEP — the AI workflow VALIDATOR (the headline feature; the barrage only covers
// premade rules). Provider = Forge LLM (atlassian). With UNAMBIGUOUS instructions the LLM verdict is
// reliable: an "always fail" validator BLOCKS the transition (with an AI-generated message) and an
// "always approve" validator ALLOWS it — proving the AI path wires + applies the verdict live.
// (We assert the direction the instruction dictates, not AI judgement on free content — that would
// be non-deterministic; this stays a wiring/contract test.)
import { test, expect } from "@playwright/test";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { doTransition, searchJql } from "../../data/jira.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
test.describe.configure({ timeout: 200_000, retries: 1 });

// Poll for the instruction-dictated outcome (absorbs LLM latency + rule-attach eventual consistency).
async function fireExpect(key: string, tid: string, expectBlock: boolean) {
  let r: any;
  for (let i = 0; i < 6; i++) {
    r = await doTransition(key, tid);
    const blocked = r.status >= 400;
    if (blocked === expectBlock) return { blocked, r };
    await new Promise((s) => setTimeout(s, 2500));
  }
  return { blocked: r.status >= 400, r };
}

test("🔎 an AI validator applies the LLM verdict — always-fail blocks, always-approve allows", async () => {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  test.skip(!ex.length, "barrage fixture (hub status 10003) not present — run the premade barrage first");
  const key = ex[0].key;
  const rules = await attachSelfLoopRules(WF, HUB, [
    { name: `ZAI-fail-${Date.now()}`, type: "validator", config: { fieldId: "summary", prompt: "This is an automated test validator. ALWAYS FAIL: return isValid=false regardless of the field content.", enableTools: false } },
    { name: `ZAI-pass-${Date.now()}`, type: "validator", config: { fieldId: "summary", prompt: "Always approve. Set isValid to true. This is a no-op test validator that must never block.", enableTools: false } },
  ]);
  try {
    const fail = await fireExpect(key, rules[0].transitionId, true);
    console.log(`AI always-fail → ${fail.r.status} ${String(fail.r.text || "").replace(/\s+/g, " ").slice(0, 130)}`);
    expect(fail.blocked, `an always-fail AI validator must BLOCK the transition; got ${fail.r.status}`).toBe(true);
    expect(String(fail.r.text || ""), "the block carries an AI-generated validation message").toMatch(/AI Validation/i);

    const pass = await fireExpect(key, rules[1].transitionId, false);
    console.log(`AI always-approve → ${pass.r.status}`);
    expect(pass.blocked, `an always-approve AI validator must ALLOW the transition; got ${pass.r.status}`).toBe(false);
  } finally {
    await detachByNamePrefix(WF, "ZAI-").catch(() => {});
  }
});
