// REGRESSION (it45 defect #5) — premade-rules.js adfText() undercounted rich text: a description made only
// of non-text ADF nodes (emoji / mention / date / smart-link card) read as EMPTY, so field-required
// false-BLOCKED a filled description and text-length undercounted it. Fixed to emit attrs display text.
// This locks it: a field-required validator on a description that is ONLY an emoji node must ALLOW.
import { test, expect } from "@playwright/test";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { doTransition, request, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { waitForLog } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
test.describe.configure({ timeout: 120_000, retries: 1 });

test("field-required sees a NON-text-node rich description as non-empty (adfText #5 regression)", async () => {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 3);
  test.skip(!ex.length, "fixture missing");
  const key = ex[0].key;
  // description = only an emoji node (no text node). Pre-fix adfText="" → isEmpty → BLOCK; post-fix → non-empty → ALLOW.
  await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "emoji", attrs: { shortName: ":tada:", text: "🎉" } }] }] } } } });
  const [v] = await attachSelfLoopRules(WF, HUB, [{ name: `ZADFRX-${Date.now()}`, type: "validator",
    config: { ruleType: "field-required", premadeRuleType: "field-required", ruleKind: "premade", fieldId: "description", fieldName: "Description", errorMessage: "Description required" } }]);
  try {
    await new Promise((s) => setTimeout(s, 2500));
    const since = Date.now();
    const r = await doTransition(key, v.transitionId);
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.fieldId === "description" && l.type === "validator", since, { tries: 10, gapMs: 2500 }).catch(() => null);
    console.log(`emoji-only description → transition=${r.status} log.isValid=${log?.isValid}`);
    expect(r.status, "emoji-only description is NOT empty → field-required ALLOWs").toBeLessThan(400);
    expect(log?.isValid, "the validator log agrees (Passed)").toBe(true);
  } finally {
    await detachByNamePrefix(WF, "ZADFRX-").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { description: null } } }).catch(() => {});
  }
});
