// RULE-EXERCISE LAB L25 — SEMANTIC LINK managed flavor (postfunction-link), the last untested managed
// flavor whose EXECUTOR is self-contained (no external MCP): reads the source field, JQL-searches the
// project for candidates by the SUMMARY's salient terms, asks the AI to pick GENUINELY-related issues
// (conservative), and creates "Relates" issue links (decision LINK) or none (decision SKIP). Both are
// correct executor outcomes; the LOG is the primary oracle (the executor ran + logged on a real
// transition). The LINK branch is fully asserted (link count must rise); a conservative SKIP is accepted
// as a clean no-op. Runs on Forge LLM. Bounded (one fire). Created links are left on the disposable fixture.
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
test.describe.configure({ timeout: 240_000, retries: 1 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}

test("🔗 semantic LINK flavor: AI relates issues (postfunction-link log; LINK asserted, SKIP tolerated)", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  // Seed the source field so the AI has context; the candidate JQL uses the SUMMARY's terms
  // (harness/barrage/fixture), which the fixture's clone (COGTEST-256x [rule-lab-clone]) matches.
  await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: {
    description: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "Rule-lab link source: relate any issue that is a clone/duplicate of, or covers the same harness barrage fixture regression as, this one." }] }] } } } });
  const before = ((await get(`/rest/api/3/issue/${key}?fields=issuelinks`)).fields.issuelinks || []).length;
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZSML-${Date.now()}`, type: "semantic",
    config: { type: "postfunction-link", id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "description",
      linkPrompt: "Link any issue that is a clone or duplicate of, or covers the same fixture/regression as, this issue.",
      linkTypeName: "Relates", maxLinks: 2 },
  }]);
  try {
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-link", since, { tries: 12, gapMs: 3000 }).catch(() => null);
    const after = ((await get(`/rest/api/3/issue/${key}?fields=issuelinks`)).fields.issuelinks || []).length;
    console.log(`link → links ${before}→${after} log=${log ? JSON.stringify({ isValid: log.isValid, decision: log.decision, reason: String(log.reason || "").slice(0, 90) }) : "NONE"}`);
    // PRIMARY oracle: the link executor ran + logged correctly on a real transition.
    expect(log, "a postfunction-link execution log was written").toBeTruthy();
    expect(["LINK", "SKIP"], "decision is a valid link-flavor outcome").toContain(log.decision);
    if (log.decision === "LINK") {
      // The interesting branch: a LINK decision must have actually created ≥1 issue link + reported success.
      expect(log.isValid, "a LINK decision is a success").toBe(true);
      expect(after, "a LINK decision created at least one issue link").toBeGreaterThan(before);
    } else {
      // Conservative SKIP is a correct no-op — must be a clean run, not a crash.
      const cleanSkip = log.isValid === true || /no\s+(unlinked\s+)?(candidate|link|related)/i.test(String(log.reason || ""));
      expect(cleanSkip, "a SKIP is a clean no-op (success, or an honest 'no candidates/related' reason)").toBeTruthy();
    }
  } finally {
    await detachByNamePrefix(WF, "ZSML").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { description: null } } }).catch(() => {});
  }
});
