// RULE-EXERCISE LAB — remaining premade EDGES + a clone effect. Two deep-backend tests on COGTEST:
//   (d) untested premade executor branches: field-comparison "contains" on a MULTI-VALUE field (labels,
//       array .some), field-comparison "ne" on a number, and date-relative FUTURE mode (vs the "within"
//       mode already covered as L5). push → set → transition → assert verdict + log.
//   (a) cloneIssue static PF: the PF clones the fixture (with a tagged summary override) — assert the
//       clone exists + the change is recorded. The clone is tagged + LEFT in place (never delete issues).
// Deterministic (no AI, no BYOK cost).
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { doTransition, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { setField, waitForLog } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const NUM = "customfield_10282";
const isoDay = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
test.describe.configure({ timeout: 300_000, retries: 0 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}

test("🧩 premade edges: field-comparison contains (multi-value) + ne + date-relative FUTURE", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  const RULES: any[] = [
    {
      name: "field-comparison CONTAINS on labels (multi-value .some)",
      prefix: "ZEDG-contains", fieldId: "labels",
      config: { ruleType: "field-comparison", premadeRuleType: "field-comparison", ruleKind: "premade", fieldId: "labels", fieldName: "Labels", op: "contains", compareValue: "bet", errorMessage: "A label must contain 'bet'" },
      cases: [
        { set: { labels: ["alpha", "beta"] }, allow: true, desc: "[alpha,beta] — 'beta' contains 'bet' → ALLOW" },
        { set: { labels: ["alpha", "gamma"] }, allow: false, desc: "[alpha,gamma] — none contains 'bet' → BLOCK" },
      ],
    },
    {
      name: "field-comparison NE on a number",
      prefix: "ZEDG-ne", fieldId: NUM,
      config: { ruleType: "field-comparison", premadeRuleType: "field-comparison", ruleKind: "premade", fieldId: NUM, fieldName: "Number", op: "ne", compareValue: "5", errorMessage: "Number must not equal 5" },
      cases: [
        { set: { [NUM]: 7 }, allow: true, desc: "7 ≠ 5 → ALLOW" },
        { set: { [NUM]: 5 }, allow: false, desc: "5 == 5 → BLOCK (ne fails)" },
      ],
    },
    {
      name: "date-relative FUTURE on duedate",
      prefix: "ZEDG-future", fieldId: "duedate",
      config: { ruleType: "date-relative", premadeRuleType: "date-relative", ruleKind: "premade", fieldId: "duedate", fieldName: "Due date", mode: "future", errorMessage: "Due date must be in the future" },
      cases: [
        { set: { duedate: isoDay(3) }, allow: true, desc: "today+3 → future → ALLOW" },
        { set: { duedate: isoDay(-3) }, allow: false, desc: "today-3 → past → BLOCK" },
      ],
    },
  ];

  const findings: string[] = [];
  for (const R of RULES) {
    const rules = await attachSelfLoopRules(WF, HUB, [{ name: `${R.prefix}-${Date.now()}`, type: "validator", config: R.config }]);
    const tid = rules[0].transitionId;
    try {
      for (const c of R.cases) {
        await setField(key!, c.set);
        await new Promise((s) => setTimeout(s, 2500));
        const since = Date.now();
        const r = await doTransition(key!, tid);
        const blocked = r.status >= 400;
        const log: any = await waitForLog((l: any) => l.issueKey === key && l.fieldId === R.fieldId && l.type === "validator", since, { tries: 12, gapMs: 2500 }).catch(() => null);
        const line = `[${R.name}] ${c.desc}: transition=${r.status}(${blocked ? "BLOCK" : "ALLOW"}) log.isValid=${log?.isValid}`;
        console.log(line);
        if (blocked === c.allow) findings.push(`WRONG VERDICT: ${line}`);
        if (!log) findings.push(`NO LOG: ${line}`);
        else if (!!log.isValid !== c.allow) findings.push(`LOG DISAGREES: ${line}`);
      }
    } finally {
      await detachByNamePrefix(WF, R.prefix).catch(() => {});
    }
  }
  await setField(key!, { labels: [], [NUM]: null, duedate: null }).catch(() => {});
  expect(findings, `premade-edges findings:\n${findings.join("\n")}`).toEqual([]);
});

test("👯 cloneIssue static PF: the PF clones the fixture (tagged) and records the change", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  const tag = "CLONE-" + crypto.randomUUID().slice(0, 8).toUpperCase();
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZCLONE-${Date.now()}`, type: "static",
    config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF }, functions: [{ id: crypto.randomUUID(), name: "clone", code: `const c = await api.cloneIssue({ summary: '[rule-lab-clone] ${tag}' }); await api.log('cloned ' + c.key);` }] },
  }]);
  try {
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    let clone: any = null;
    for (let i = 0; i < 16; i++) {
      await new Promise((s) => setTimeout(s, 2500));
      const found = await searchJql(`project = COGTEST AND summary ~ "${tag}"`, ["summary"], 3);
      if (found.length) { clone = found[0]; break; }
    }
    console.log(`cloneIssue → ${clone ? clone.key : "NO CLONE"} (tag ${tag})`);
    expect(clone, "the PF created a clone with the tagged summary").toBeTruthy();
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-static", since, { tries: 6, gapMs: 2000 }).catch(() => null);
    expect(log?.isValid, "PF log success").toBe(true);
    expect(log?.changes, "the clone is recorded as a change").toBeGreaterThanOrEqual(1);
    // clone is LEFT in place (tagged [rule-lab-clone]) — never delete issues.
  } finally {
    await detachByNamePrefix(WF, "ZCLONE").catch(() => {});
  }
});
