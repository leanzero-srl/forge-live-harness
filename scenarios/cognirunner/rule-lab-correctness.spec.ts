// LIVE CORRECTNESS BARRAGE: attach COMPLEX real rules to the COGTEST workflow, transition an issue many
// times with KNOWN inputs, and assert from the execution LOGS + the issue EFFECTS that each rule produced
// the CORRECT output for that input — not merely that it ran. Owner directive: "transition like crazy and
// verify the output is indeed correct." Deterministic rules assert EXACT values; AI rules use unambiguous
// truth-table inputs so a wrong verdict is a real defect. Cleans up RULES (detach), never issues.
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
import { get, doTransition, request, searchJql } from "../../data/jira.mjs";
import { setField, waitForLog } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const TEXT = "customfield_10280";
const NUM = "customfield_10282";

test.describe.configure({ timeout: 900_000, retries: 0 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));

test("🧮 T1 complex multi-branch static PF: NUM → exact tag + label, 10-case matrix at volume", async () => {
  const key = await fixtureKey();
  test.skip(!key, "COGTEST barrage fixture missing");
  // Six deterministic branches over NUM. Each writes an EXACT derived tag to TEXT + a distinct label.
  const code = `
    const iss = await api.getIssue(api.context.issueKey);
    const n = Number(iss.fields.${NUM}) || 0;
    let tag, label;
    if (n > 1000) { tag = 'HUGE-' + n; label = 'br-huge'; }
    else if (n > 100) { tag = 'BIG-' + (n - 100); label = 'br-big'; }
    else if (n < 0) { tag = 'NEG-' + Math.abs(n); label = 'br-invalid'; }
    else if (n === 0) { tag = 'ZERO'; label = 'br-zero'; }
    else if (n % 2 === 0) { tag = 'EVEN-' + (n * 2); label = 'br-even'; }
    else { tag = 'ODD-' + (n + 1); label = 'br-odd'; }
    await api.updateIssue(api.context.issueKey, { ${TEXT}: tag });
    await api.addLabels([label]);
  `;
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZCORR-mb-${Date.now()}`, type: "static",
    config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF }, functions: [{ id: crypto.randomUUID(), name: "branch", code }] },
  }]);
  const cases = [
    { num: 5000, tag: "HUGE-5000", label: "br-huge" },
    { num: 1001, tag: "HUGE-1001", label: "br-huge" },
    { num: 1000, tag: "BIG-900", label: "br-big" },   // boundary: >1000 false at 1000
    { num: 250, tag: "BIG-150", label: "br-big" },
    { num: 101, tag: "BIG-1", label: "br-big" },       // boundary: >100 true at 101
    { num: -7, tag: "NEG-7", label: "br-invalid" },
    { num: 0, tag: "ZERO", label: "br-zero" },
    { num: 8, tag: "EVEN-16", label: "br-even" },
    { num: 100, tag: "EVEN-200", label: "br-even" },   // boundary: >100 false at 100 → even
    { num: 7, tag: "ODD-8", label: "br-odd" },
  ];
  const results: any[] = [];
  let wrong = 0;
  try {
    for (const c of cases) {
      // Isolate each case: clear the output field + labels first.
      await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null, labels: [] } } });
      await setField(key!, { [NUM]: c.num });
      await sleep(1500);
      const since = Date.now();
      const r = await doTransition(key!, pf.transitionId);
      expect(r.status, `transition fired (n=${c.num})`).toBeLessThan(400);
      let got: any = null;
      for (let i = 0; i < 18; i++) {
        await sleep(2000);
        const v = await get(`/rest/api/3/issue/${key}?fields=${TEXT},labels`);
        if (v.fields[TEXT] === c.tag) { got = v; break; }
      }
      const gotTag = got?.fields?.[TEXT] ?? (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT] ?? null;
      const gotLabels = got?.fields?.labels ?? (await get(`/rest/api/3/issue/${key}?fields=labels`)).fields.labels ?? [];
      const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-static", since, { tries: 4, gapMs: 2000 }).catch(() => null);
      const okTag = gotTag === c.tag;
      const okLabel = gotLabels.includes(c.label);
      if (!okTag || !okLabel || log?.isValid !== true) wrong++;
      results.push({ n: c.num, exp: c.tag, gotTag, okTag, label: c.label, okLabel, log: log?.isValid });
      expect(gotTag, `n=${c.num}: TEXT computed EXACTLY`).toBe(c.tag);
      expect(gotLabels, `n=${c.num}: correct branch label added`).toContain(c.label);
      expect(log?.isValid, `n=${c.num}: PF logged success`).toBe(true);
    }
  } finally {
    console.log(`\nT1 MULTI-BRANCH MATRIX (${cases.length - wrong}/${cases.length} correct):\n` +
      results.map((r) => `  n=${r.n} → ${r.gotTag} ${r.okTag ? "✓" : "✗ exp " + r.exp} | label ${r.okLabel ? "✓" : "✗"} | log ${r.log ? "✓" : "✗"}`).join("\n"));
    await detachByNamePrefix(WF, "ZCORR-mb").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null, [NUM]: null, labels: [] } } }).catch(() => {});
  }
});
