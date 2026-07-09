// RULE-EXERCISE LAB — new-project accumulation (owner: "continuously create new projects so we don't
// refresh rules"). Provisions/reuses CGL1 (a company-managed COGTEST-clone), then fires two premade
// patterns NOT yet in the corpus — date-relative "within N days" (the date-window path) and
// allowed-values every-must-match on a multi-value field (labels). Proves CogniRunner fires on a
// freshly-provisioned project AND deepens premade coverage. Deterministic (no AI, no BYOK cost).
import { test, expect } from "@playwright/test";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { doTransition } from "../../data/jira.mjs";
// @ts-ignore
import { setField, waitForLog } from "../../data/cogni-rule-lab.mjs";
// @ts-ignore
import { provisionProject } from "../../data/cogni-provision.mjs";

test.describe.configure({ timeout: 300_000, retries: 0 });

// date-only 'YYYY-MM-DD' N days from today (UTC), matching the executor's UTC-calendar-day compare.
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);

test("🧪 rule-lab CGL1: date-window + allowed-values every-match on a freshly-provisioned project", async () => {
  const proj = await provisionProject("CGL1", "CogniRunner Rule Lab 1");
  const { workflowName: WF, hubStatusRef: HUB, fixtureKey: key } = proj;
  console.log(`CGL1: wf="${WF}" hub=${HUB} fixture=${key} created=${proj.created}`);

  const RULES: any[] = [
    {
      name: "date-relative WITHIN 5 days on duedate",
      prefix: "ZCGL-dwin",
      fieldId: "duedate",
      config: { ruleType: "date-relative", premadeRuleType: "date-relative", ruleKind: "premade", fieldId: "duedate", fieldName: "Due date", mode: "within", days: "5", errorMessage: "Due date must be within 5 days" },
      cases: [
        { set: { duedate: isoDay(2) }, allow: true, desc: "today+2 within 5 → ALLOW" },
        { set: { duedate: isoDay(10) }, allow: false, desc: "today+10 outside 5 → BLOCK" },
      ],
    },
    {
      name: "allowed-values EVERY-must-match on labels (multi-value)",
      prefix: "ZCGL-allow",
      fieldId: "labels",
      config: { ruleType: "allowed-values", premadeRuleType: "allowed-values", ruleKind: "premade", fieldId: "labels", fieldName: "Labels", allowedValues: "alpha, gamma", errorMessage: "Labels must all be alpha or gamma" },
      cases: [
        { set: { labels: ["alpha"] }, allow: true, desc: "[alpha] ⊆ {alpha,gamma} → ALLOW" },
        { set: { labels: ["alpha", "beta"] }, allow: false, desc: "[alpha,beta] — beta not allowed → BLOCK (every-must-match)" },
      ],
    },
  ];

  const findings: string[] = [];
  for (const R of RULES) {
    const rules = await attachSelfLoopRules(WF, HUB, [{ name: `${R.prefix}-${Date.now()}`, type: "validator", config: R.config }]);
    const tid = rules[0].transitionId;
    try {
      for (const c of R.cases) {
        await setField(key, c.set);
        await new Promise((s) => setTimeout(s, 2500));
        const since = Date.now();
        const r = await doTransition(key, tid);
        const blocked = r.status >= 400;
        const log: any = await waitForLog((l: any) => l.issueKey === key && l.fieldId === R.fieldId && l.type === "validator", since, { tries: 12, gapMs: 2500 }).catch(() => null);
        const line = `[${R.name}] ${c.desc}: transition=${r.status}(${blocked ? "BLOCK" : "ALLOW"}) log.isValid=${log?.isValid} premade=${log?.premadeRuleType} reason="${String(log?.reason || "").slice(0, 70)}"`;
        console.log(line);
        if (blocked === c.allow) findings.push(`WRONG VERDICT: ${line}`);
        if (!log) findings.push(`NO LOG: ${line}`);
        else if (!!log.isValid !== c.allow) findings.push(`LOG DISAGREES: ${line}`);
        else if (log.premadeRuleType !== R.config.premadeRuleType) findings.push(`NOT ROUTED PREMADE: ${line}`);
      }
    } finally {
      await detachByNamePrefix(WF, R.prefix).catch(() => {});
    }
  }
  // Reset the fixture's mutable fields so reruns start clean.
  await setField(key, { duedate: null, labels: [] }).catch(() => {});
  expect(findings, `CGL1 rule-lab findings:\n${findings.join("\n")}`).toEqual([]);
});
