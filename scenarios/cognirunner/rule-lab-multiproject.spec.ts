// RULE-EXERCISE LAB — MULTI-PROJECT concurrent attribution (the last REST-reachable item; S1 was single
// issue). Attach a small varied premade batch to COGTEST + CGL1 + CGL2 fixtures, fire them INTERLEAVED
// (round-robin across the 3 issues in a tight window), then audit that EACH log is attributed to the right
// ISSUE and RULE (issueKey + ruleId + premadeRuleType) — no cross-issue mixups when logs from 3 issues
// interleave in the shared store. Deterministic (no AI, no BYOK cost).
import { test, expect } from "@playwright/test";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { doTransition, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { setField, execLogs } from "../../data/cogni-rule-lab.mjs";
// @ts-ignore
import { provisionProject } from "../../data/cogni-provision.mjs";

const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));
const isoDay = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
test.describe.configure({ timeout: 300_000, retries: 0 });
const pm = (id: string, ruleType: string, fieldId: string, extra: any, msg: string) => ({
  id, ruleType, premadeRuleType: ruleType, ruleKind: "premade", fieldId, ...extra, errorMessage: msg,
});

test("🗂️ multi-project attribution: interleaved fires across 3 issues, no cross-issue log mixups", async () => {
  const cog = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  test.skip(!cog.length, "COGTEST fixture missing");
  const cgl1 = await provisionProject("CGL1", "CogniRunner Rule Lab 1");
  const cgl2 = await provisionProject("CGL2", "CogniRunner Rule Lab 2");

  // Per project: workflow + hub + fixture + one state + a small varied batch (unique config.id each).
  const PROJECTS = [
    {
      tag: "COGTEST", WF: "Software Simplified Workflow for Project COGTEST", HUB: "10003", key: cog[0].key,
      state: { customfield_10280: "present", customfield_10282: 10 },
      rules: [
        [pm("MPX-C1", "field-required", "customfield_10280", {}, "C1"), true],
        [pm("MPX-C2", "field-comparison", "customfield_10282", { op: "lte", compareValue: "5" }, "C2"), false],
      ],
    },
    {
      tag: "CGL1", WF: cgl1.workflowName, HUB: cgl1.hubStatusRef, key: cgl1.fixtureKey,
      state: { labels: ["x"], duedate: isoDay(5) },
      rules: [
        [pm("MPX-G1", "field-required", "labels", {}, "G1"), true],
        [pm("MPX-G2", "date-relative", "duedate", { mode: "within", days: "2" }, "G2"), false],
      ],
    },
    {
      tag: "CGL2", WF: cgl2.workflowName, HUB: cgl2.hubStatusRef, key: cgl2.fixtureKey,
      state: { labels: ["x"] },
      rules: [
        [pm("MPX-H1", "allowed-values", "labels", { allowedValues: "x, y" }, "H1"), true],
        [pm("MPX-H2", "field-cardinality", "labels", { min: "2" }, "H2"), false],
      ],
    },
  ] as const;

  const since = Date.now();
  const cleanup: { WF: string }[] = [];
  try {
    // set state + attach each project's batch; build a flat fire-list [{key, transitionId, id, expect}]
    const fireList: { key: string; tid: string; id: string; expect: boolean; tag: string }[] = [];
    for (const P of PROJECTS) {
      await setField(P.key, P.state);
      const specs = P.rules.map(([cfg]: any) => ({ name: `ZMPX-${cfg.id}-${Date.now()}`, type: "validator" as const, config: cfg }));
      const attached = await attachSelfLoopRules(P.WF, P.HUB, specs);
      cleanup.push({ WF: P.WF });
      P.rules.forEach(([cfg, expectAllow]: any, i: number) =>
        fireList.push({ key: P.key, tid: attached[i].transitionId, id: cfg.id, expect: expectAllow, tag: P.tag }));
    }
    await sleep(2500); // persist field writes before firing

    // ROUND-ROBIN interleave: reorder so consecutive fires hit DIFFERENT issues.
    const order = ["MPX-C1", "MPX-G1", "MPX-H1", "MPX-C2", "MPX-G2", "MPX-H2"].map((id) => fireList.find((f) => f.id === id)!);
    const fired: Record<string, boolean> = {};
    for (const f of order) {
      const r = await doTransition(f.key, f.tid);
      fired[f.id] = r.status < 400;
      await sleep(600);
    }
    await sleep(5000);

    // audit: each ruleId's log must carry the RIGHT issueKey + verdict + premadeRuleType.
    const logs = (await execLogs()).filter((l: any) => l.type === "validator" && Date.parse(l.timestamp) >= since - 2000);
    const byId: Record<string, any> = {};
    for (const l of logs) if (l.ruleId && !byId[l.ruleId]) byId[l.ruleId] = l;
    const findings: string[] = [];
    for (const P of PROJECTS) for (const [cfg, expectAllow] of P.rules as any) {
      const log = byId[cfg.id];
      if (fired[cfg.id] !== expectAllow) findings.push(`${cfg.id} (${P.tag}): transition ${fired[cfg.id] ? "ALLOW" : "BLOCK"} ≠ expected ${expectAllow ? "ALLOW" : "BLOCK"}`);
      if (!log) { findings.push(`${cfg.id} (${P.tag}): NO LOG`); continue; }
      if (log.issueKey !== P.key) findings.push(`${cfg.id}: log.issueKey=${log.issueKey} ≠ ${P.key} (CROSS-ISSUE MIXUP)`);
      if (!!log.isValid !== expectAllow) findings.push(`${cfg.id}: log.isValid=${log.isValid} ≠ ${expectAllow}`);
      if (log.premadeRuleType !== cfg.premadeRuleType) findings.push(`${cfg.id}: premadeRuleType=${log.premadeRuleType} ≠ ${cfg.premadeRuleType}`);
    }
    console.log(`multi-project: ${PROJECTS.flatMap((p) => p.rules).filter(([c]: any) => byId[c.id]).length}/6 logged; ${findings.length} finding(s)`);
    expect(findings, `multi-project attribution findings:\n${findings.join("\n")}`).toEqual([]);
  } finally {
    for (const P of PROJECTS) {
      await detachByNamePrefix(P.WF, "ZMPX-").catch(() => {});
      await setField(P.key, P.tag === "COGTEST" ? { customfield_10280: null, customfield_10282: null } : { labels: [], duedate: null }).catch(() => {});
    }
  }
});
