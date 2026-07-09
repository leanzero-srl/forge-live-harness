// RULE-EXERCISE LAB — new-project accumulation (CGL2) + UNICODE tier. Provisions/reuses CGL2 and fires
// two premade patterns NOT in the corpus, both on the rich-text `description` (so the searchable summary
// stays intact): field-regex with a SURROGATE-PAIR emoji pattern, and text-length with ASTRAL chars to
// prove the executor counts CODE POINTS (not UTF-16 units). Deterministic (no AI, no BYOK cost).
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

const adf = (text: string) => ({ type: "doc", version: 1, content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] });

test("🧪 rule-lab CGL2: emoji-regex + astral text-length (code-point counting) on a fresh project", async () => {
  const proj = await provisionProject("CGL2", "CogniRunner Rule Lab 2");
  const { workflowName: WF, hubStatusRef: HUB, fixtureKey: key } = proj;
  console.log(`CGL2: wf="${WF}" hub=${HUB} fixture=${key} created=${proj.created}`);

  const RULES: any[] = [
    {
      name: "field-regex with a surrogate-pair emoji pattern (🚀) on description",
      prefix: "ZCG2-rx",
      fieldId: "description",
      config: { ruleType: "field-regex", premadeRuleType: "field-regex", ruleKind: "premade", fieldId: "description", fieldName: "Description", regex: "🚀", errorMessage: "Description must contain 🚀" },
      cases: [
        { set: { description: adf("Launch 🚀 today") }, allow: true, desc: "contains 🚀 → ALLOW" },
        { set: { description: adf("no rocket here") }, allow: false, desc: "no 🚀 → BLOCK" },
      ],
    },
    {
      name: "text-length min3 max3 on description with ASTRAL chars (code-point count)",
      prefix: "ZCG2-len",
      fieldId: "description",
      config: { ruleType: "text-length", premadeRuleType: "text-length", ruleKind: "premade", fieldId: "description", fieldName: "Description", min: "3", max: "3", errorMessage: "Description must be exactly 3 characters" },
      cases: [
        // "😀😀😀" = 3 code points but 6 UTF-16 units. min3/max3 ALLOWS only if code points are counted.
        { set: { description: adf("😀😀😀") }, allow: true, desc: "3 emoji = 3 code points (6 UTF-16) → ALLOW proves code-point counting" },
        { set: { description: adf("😀😀😀😀") }, allow: false, desc: "4 emoji = 4 code points > max 3 → BLOCK" },
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
        const line = `[${R.name}] ${c.desc}: transition=${r.status}(${blocked ? "BLOCK" : "ALLOW"}) log.isValid=${log?.isValid} premade=${log?.premadeRuleType}`;
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
  // Restore the fixture's description so provisionProject's summary search + reruns stay clean.
  await setField(key, { description: null }).catch(() => {});
  expect(findings, `CGL2 rule-lab findings:\n${findings.join("\n")}`).toEqual([]);
});
