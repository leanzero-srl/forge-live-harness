// RULE-EXERCISE LAB — MULTIPLE rules on ONE transition (escalation tier). Two deep-backend tests:
//   (a) CROSS-KIND interaction: a premade VALIDATOR + a static POST-FUNCTION on the same transition.
//       When the validator BLOCKS, the transition never executes → the PF must NOT run (no write, no PF
//       log). When it ALLOWS, the PF runs. This proves validators gate post-functions correctly.
//   (d) SAME-KIND AND-gating: TWO premade validators on one transition — both must pass to ALLOW; if
//       either fails the transition BLOCKS. Asserts each validator logs independently.
// Deterministic (no AI, no BYOK cost). Uses attachSelfLoopMulti (N rules on one self-loop transition).
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
// @ts-ignore
import { attachSelfLoopMulti, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { get, doTransition, request, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { setField, waitForLog, execLogs } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const TEXT = "customfield_10280";   // text
const NUM = "customfield_10282";    // number
test.describe.configure({ timeout: 240_000, retries: 0 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}

test("🔗 combined validator + static PF: the PF runs only when the validator ALLOWS", async () => {
  const key = await fixtureKey();
  test.skip(!key, "HARNESS-BARRAGE-FIXTURE missing on COGTEST");
  const nonce = crypto.randomUUID().slice(0, 8).toUpperCase();
  const combo = await attachSelfLoopMulti(WF, HUB, `ZCMB-vpf-${Date.now()}`, [
    { type: "validator", config: { ruleType: "field-comparison", premadeRuleType: "field-comparison", ruleKind: "premade", fieldId: NUM, fieldName: "Number", op: "gte", compareValue: "5", errorMessage: "Number must be at least 5" } },
    { type: "static", config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF }, functions: [{ id: crypto.randomUUID(), name: "write on allow", code: `await api.updateIssue(api.context.issueKey, { ${TEXT}: 'PFRAN-${nonce}' });` }] } },
  ]);
  const tid = combo.transitionId;
  try {
    // --- BLOCK case: validator fails → transition rejected → PF must NOT run ---
    await setField(key!, { [NUM]: 2, [TEXT]: "BEFORE-BLOCK" });
    await new Promise((s) => setTimeout(s, 2500));
    let since = Date.now();
    let r = await doTransition(key!, tid);
    console.log(`[block case] transition → ${r.status}`);
    expect(r.status, "validator blocks the transition").toBeGreaterThanOrEqual(400);
    const vLogBlock: any = await waitForLog((l: any) => l.issueKey === key && l.type === "validator" && l.fieldId === NUM, since, { tries: 10, gapMs: 2500 }).catch(() => null);
    expect(vLogBlock?.isValid, "validator logged a block").toBe(false);
    await new Promise((s) => setTimeout(s, 4000)); // give any (erroneous) PF time to run
    const afterBlock = (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT];
    console.log(`[block case] field after = ${JSON.stringify(afterBlock)} (must be unchanged)`);
    expect(afterBlock, "the PF did NOT run because the validator blocked the transition").toBe("BEFORE-BLOCK");
    const pfLogsBlock = (await execLogs()).filter((l: any) => l.issueKey === key && l.type === "postfunction-static" && Date.parse(l.timestamp) >= since - 1500);
    expect(pfLogsBlock.length, "no post-function log was written for the blocked transition").toBe(0);

    // --- ALLOW case: validator passes → transition executes → PF runs ---
    await setField(key!, { [NUM]: 10, [TEXT]: "BEFORE-ALLOW" });
    await new Promise((s) => setTimeout(s, 2500));
    since = Date.now();
    r = await doTransition(key!, tid);
    console.log(`[allow case] transition → ${r.status}`);
    expect(r.status, "validator allows the transition").toBeLessThan(400);
    let val: any = null;
    for (let i = 0; i < 16; i++) {
      await new Promise((s) => setTimeout(s, 2500));
      const v = (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT];
      if (v === `PFRAN-${nonce}`) { val = v; break; }
    }
    expect(val, "the PF ran and wrote the field after the validator allowed").toBe(`PFRAN-${nonce}`);
    const vLogAllow: any = await waitForLog((l: any) => l.issueKey === key && l.type === "validator" && l.fieldId === NUM, since, { tries: 6, gapMs: 2000 }).catch(() => null);
    expect(vLogAllow?.isValid, "validator logged an allow").toBe(true);
  } finally {
    await detachByNamePrefix(WF, "ZCMB-vpf").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null, [NUM]: null } } }).catch(() => {});
  }
});

test("➕ two premade validators on one transition: both must pass (AND-gating), each logs", async () => {
  const key = await fixtureKey();
  test.skip(!key, "HARNESS-BARRAGE-FIXTURE missing on COGTEST");
  const combo = await attachSelfLoopMulti(WF, HUB, `ZCMB-2v-${Date.now()}`, [
    { type: "validator", config: { ruleType: "field-required", premadeRuleType: "field-required", ruleKind: "premade", fieldId: TEXT, fieldName: "Text", errorMessage: "Text is required" } },
    { type: "validator", config: { ruleType: "field-comparison", premadeRuleType: "field-comparison", ruleKind: "premade", fieldId: NUM, fieldName: "Number", op: "gte", compareValue: "5", errorMessage: "Number must be at least 5" } },
  ]);
  const tid = combo.transitionId;
  try {
    // both pass → ALLOW, both log true
    await setField(key!, { [TEXT]: "present", [NUM]: 10 });
    await new Promise((s) => setTimeout(s, 2500));
    let since = Date.now();
    let r = await doTransition(key!, tid);
    console.log(`[both pass] transition → ${r.status}`);
    expect(r.status, "both validators pass → allow").toBeLessThan(400);
    const logsPass = [] as any[];
    await waitForLog((l: any) => { if (l.issueKey === key && l.type === "validator" && Date.parse(l.timestamp) >= since - 1500) logsPass.push(l); return false; }, since, { tries: 5, gapMs: 2500 }).catch(() => null);
    const reqPass = logsPass.find((l) => l.fieldId === TEXT), cmpPass = logsPass.find((l) => l.fieldId === NUM);
    console.log(`[both pass] required.isValid=${reqPass?.isValid} comparison.isValid=${cmpPass?.isValid}`);
    expect(reqPass?.isValid, "field-required logged pass").toBe(true);
    expect(cmpPass?.isValid, "field-comparison logged pass").toBe(true);

    // one fails (Number=2 < 5) → BLOCK; the failing validator logs false
    await setField(key!, { [TEXT]: "present", [NUM]: 2 });
    await new Promise((s) => setTimeout(s, 2500));
    since = Date.now();
    r = await doTransition(key!, tid);
    console.log(`[one fails] transition → ${r.status}`);
    expect(r.status, "one validator fails → block").toBeGreaterThanOrEqual(400);
    const cmpFail: any = await waitForLog((l: any) => l.issueKey === key && l.type === "validator" && l.fieldId === NUM, since, { tries: 10, gapMs: 2500 }).catch(() => null);
    expect(cmpFail?.isValid, "the failing field-comparison validator logged a block").toBe(false);
  } finally {
    await detachByNamePrefix(WF, "ZCMB-2v").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null, [NUM]: null } } }).catch(() => {});
  }
});
