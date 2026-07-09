// CogniRunner RULE-EXERCISE LAB (deep backend test). Pushes intricate rules, sets the fixture's
// field state, transitions to FIRE them, and asserts BOTH the transition verdict AND the execution
// LOG match the rule's intended behaviour. This is the seed of the rule-exercise loop — escalate
// intricacy + accumulate rules (eventually across freshly-provisioned projects) over time.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { doTransition, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { setField, waitForLog } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
test.describe.configure({ timeout: 360_000, retries: 0 });

const RULES: any[] = [
  {
    name: "field-comparison gte on a NUMBER custom field",
    prefix: "ZLAB-cmp",
    fieldId: "customfield_10282",
    config: { ruleType: "field-comparison", premadeRuleType: "field-comparison", ruleKind: "premade", fieldId: "customfield_10282", op: "gte", compareValue: "8", errorMessage: "COGTEST_Number must be at least 8" },
    cases: [
      { set: { customfield_10282: 5 }, allow: false, desc: "5 < 8 → BLOCK" },
      { set: { customfield_10282: 13 }, allow: true, desc: "13 ≥ 8 → ALLOW" },
    ],
  },
  {
    name: "field-cardinality 2..3 on a MULTI-VALUE field (labels)",
    prefix: "ZLAB-card",
    fieldId: "labels",
    config: { ruleType: "field-cardinality", premadeRuleType: "field-cardinality", ruleKind: "premade", fieldId: "labels", min: "2", max: "3", errorMessage: "Need 2 to 3 labels" },
    cases: [
      { set: { labels: ["lab-one"] }, allow: false, desc: "1 label < min 2 → BLOCK" },
      { set: { labels: ["lab-one", "lab-two"] }, allow: true, desc: "2 labels in [2,3] → ALLOW" },
    ],
  },
];

test("🧪 rule-lab: intricate premade validators — verdict + LOG match intent", async () => {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 3);
  test.skip(!ex.length, "HARNESS-BARRAGE-FIXTURE missing on COGTEST");
  const key = ex[0].key;
  const findings: string[] = [];

  for (const R of RULES) {
    const rules = await attachSelfLoopRules(WF, HUB, [{ name: `${R.prefix}-${Date.now()}`, type: "validator", config: R.config }]);
    const tid = rules[0].transitionId;
    try {
      for (const c of R.cases) {
        await setField(key, c.set);
        await new Promise((s) => setTimeout(s, 2500)); // persisted write → visible to the validator's REST read
        const since = Date.now();
        const r = await doTransition(key, tid);
        const blocked = r.status >= 400;
        const log: any = await waitForLog((l: any) => l.issueKey === key && l.fieldId === R.fieldId && l.type === "validator", since);
        const line = `[${R.name}] ${c.desc}: transition=${r.status}(${blocked ? "BLOCK" : "ALLOW"}) log.isValid=${log?.isValid} premade=${log?.premadeRuleType} reason="${String(log?.reason || "").slice(0, 70)}"`;
        console.log(line);
        // verdict must match intent (block when !allow), AND a log must exist AND its verdict must agree
        if (blocked === c.allow) findings.push(`WRONG VERDICT: ${line}`);
        if (!log) findings.push(`NO LOG: ${line}`);
        else if (!!log.isValid !== c.allow) findings.push(`LOG DISAGREES: ${line}`);
        else if (log.premadeRuleType !== R.config.premadeRuleType) findings.push(`NOT ROUTED PREMADE: ${line}`);
      }
    } finally {
      await detachByNamePrefix(WF, R.prefix).catch(() => {});
    }
  }

  expect(findings, `rule-lab findings:\n${findings.join("\n")}`).toEqual([]);
});
