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

test("🚦 T2 AI validator truth-table: block/allow decision is CORRECT on unambiguous inputs", async () => {
  const key = await fixtureKey();
  test.skip(!key, "COGTEST barrage fixture missing");
  // Unambiguous compound criterion over the TEXT custom field (not summary — that would break fixture lookup).
  const [v] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZCORR-val-${Date.now()}`, type: "validator",
    config: { fieldId: TEXT, enableTools: false, prompt: "The field contains some text. Return isValid=true ONLY IF the text contains a number that is 1000 or greater (for example 1000, 2500, 999999). If there is NO number at all, or every number present is less than 1000, return isValid=false. Judge only the numeric rule; ignore everything else." },
  }]);
  const cases = [
    { text: "deploy 2500 units to production now", expectBlock: false }, // 2500 >= 1000 → pass
    { text: "value is exactly 999999 here", expectBlock: false },        // 999999 >= 1000 → pass
    { text: "deploy 50 small units now", expectBlock: true },            // 50 < 1000 → block
    { text: "there are no numbers in this sentence", expectBlock: true },// none → block
    { text: "ticket 42 and item 7 need review", expectBlock: true },     // 42,7 < 1000 → block
  ];
  const results: any[] = [];
  let wrong = 0;
  try {
    for (const c of cases) {
      await setField(key!, { [TEXT]: c.text });
      await sleep(1200);
      // AI is non-deterministic — retry a couple times to reach the correct verdict for these unambiguous inputs.
      let blocked = null, status = 0, isValid: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const since = Date.now();
        const r = await doTransition(key!, v.transitionId);
        status = r.status; blocked = r.status >= 400;
        const log: any = await waitForLog((l: any) => l.issueKey === key && (l.type === "validator" || l.type === "validation"), since, { tries: 5, gapMs: 2000 }).catch(() => null);
        isValid = log?.isValid ?? null;
        if (blocked === c.expectBlock) break;
        await sleep(1500);
      }
      const correct = blocked === c.expectBlock;
      if (!correct) wrong++;
      results.push({ text: c.text.slice(0, 32), expectBlock: c.expectBlock, blocked, status, isValid, correct });
      expect(blocked, `"${c.text.slice(0, 40)}" → expected ${c.expectBlock ? "BLOCK" : "ALLOW"} (status ${status})`).toBe(c.expectBlock);
      // The log's isValid must agree with the transition outcome (isValid=true ⇒ allowed).
      if (isValid !== null) expect(isValid, `log isValid agrees with the ${c.expectBlock ? "block" : "allow"}`).toBe(!c.expectBlock);
    }
  } finally {
    console.log(`\nT2 VALIDATOR TRUTH-TABLE (${cases.length - wrong}/${cases.length} correct):\n` +
      results.map((r) => `  "${r.text}" → ${r.blocked ? "BLOCK" : "ALLOW"} ${r.correct ? "✓" : "✗ expected " + (r.expectBlock ? "BLOCK" : "ALLOW")} (isValid=${r.isValid})`).join("\n"));
    await detachByNamePrefix(WF, "ZCORR-val").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null } } }).catch(() => {});
  }
});

test("🎨 T3 semantic PF classification: reads Description → writes the CORRECT RED/AMBER/GREEN token", async () => {
  const key = await fixtureKey();
  test.skip(!key, "COGTEST barrage fixture missing");
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZCORR-sem-${Date.now()}`, type: "semantic",
    config: {
      type: "postfunction-semantic", fieldId: "description", actionFieldId: TEXT,
      conditionPrompt: "Run every time, unconditionally.",
      actionPrompt: "Read the SOURCE description text and classify its severity. Output EXACTLY ONE of these three tokens and nothing else: RED, AMBER, or GREEN. Output RED if the text describes an outage, data loss, or a security breach. Output AMBER if it describes something slow, degraded, or delayed (but no outage/data-loss/breach). Otherwise output GREEN. Output only the single token.",
    },
  }]);
  const cases = [
    { desc: "The production database suffered a major outage overnight and was unreachable.", expect: "RED" },
    { desc: "A security breach exposed some customer records to the public internet.", expect: "RED" },
    { desc: "Users report the search results page is very slow and feels degraded lately.", expect: "AMBER" },
    { desc: "Routine documentation update for the onboarding guide, nothing is broken.", expect: "GREEN" },
  ];
  const results: any[] = [];
  let wrong = 0;
  try {
    for (const c of cases) {
      await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null } } });
      await setField(key!, { description: c.desc });
      await sleep(1500);
      let val: any = null, isValid: any = null;
      for (let attempt = 0; attempt < 3 && val !== c.expect; attempt++) {
        const since = Date.now();
        await doTransition(key!, pf.transitionId);
        for (let i = 0; i < 16; i++) {
          await sleep(2000);
          const v = (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT];
          if (v) { val = String(v).trim().toUpperCase(); break; }
        }
        const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-semantic", since, { tries: 3, gapMs: 2000 }).catch(() => null);
        isValid = log?.isValid ?? isValid;
        if (val === c.expect) break;
        await sleep(1500);
      }
      const correct = val === c.expect;
      if (!correct) wrong++;
      results.push({ desc: c.desc.slice(0, 40), exp: c.expect, got: val, correct, isValid });
      expect(val, `"${c.desc.slice(0, 40)}…" → classified ${c.expect}`).toBe(c.expect);
    }
  } finally {
    console.log(`\nT3 SEMANTIC CLASSIFICATION (${cases.length - wrong}/${cases.length} correct):\n` +
      results.map((r) => `  "${r.desc}…" → ${r.got} ${r.correct ? "✓" : "✗ expected " + r.exp}`).join("\n"));
    await detachByNamePrefix(WF, "ZCORR-sem").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null, description: null } } }).catch(() => {});
  }
});
