// RULE-EXERCISE LAB S4 — SOAK (sustained temporal load). S1/S2/S3 stressed a BURST + the cap + multi-project;
// this stresses the SAME store over TIME: 7 varied premade validators (known verdicts) fired in ROUNDS spaced
// over ~90s, so writes accumulate PAST the 50-log cap repeatedly across time (not in one millisecond burst).
// After a mid-soak checkpoint AND the final round, audit that: (a) EVERY rule's NEWEST log still carries the
// right verdict + premadeRuleType (attribution + verdict hold under sustained load, no drift over time);
// (b) the readable log store never exceeds MAX_LOGS(50) — an honest newest-kept ring even as old writes age
// out over minutes; (c) ZERO malformed/corrupt entries across the whole soak. Deterministic (no AI, no BYOK).
import { test, expect } from "@playwright/test";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { doTransition, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { setField, execLogs } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const TEXT = "customfield_10280";
const NUM = "customfield_10282";
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));
const isoDay = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
test.describe.configure({ timeout: 300_000, retries: 0 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}
const pm = (id: string, ruleType: string, fieldId: string, extra: any) => ({
  id, ruleType, premadeRuleType: ruleType, ruleKind: "premade", fieldId, ...extra, errorMessage: id,
});

test("🕰️ soak: 7 validators fired in rounds over ~90s — attribution + cap + verdict stay honest over time", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  await setField(key!, { [TEXT]: "Apple5", [NUM]: 10, labels: ["x"], duedate: isoDay(5) });
  await sleep(2500);

  // [config, expectedAllow] — deterministic verdicts for the seeded fixture state.
  const RULES: [any, boolean][] = [
    [pm("SOAK-R01", "field-required", TEXT, {}), true],
    [pm("SOAK-R02", "field-comparison", NUM, { op: "gte", compareValue: "5" }), true],
    [pm("SOAK-R03", "field-comparison", NUM, { op: "lte", compareValue: "5" }), false],
    [pm("SOAK-R04", "field-regex", TEXT, { regex: "^App" }), true],
    [pm("SOAK-R05", "field-regex", TEXT, { regex: "^Z" }), false],
    [pm("SOAK-R06", "allowed-values", "labels", { allowedValues: "x, y" }), true],
    [pm("SOAK-R07", "text-length", TEXT, { max: "3" }), false],
  ];
  const specs = RULES.map(([cfg]) => ({ name: `ZSOAK-${cfg.id}-${Date.now()}`, type: "validator" as const, config: cfg }));
  const attached = await attachSelfLoopRules(WF, HUB, specs);

  // Audit helper: newest log per ruleId; verdict + premadeRuleType must match; store capped + uncorrupted.
  const audit = async (label: string) => {
    const all = await execLogs();
    const malformed = all.filter((l: any) => !l.type || !l.timestamp || (l.type === "validator" && typeof l.isValid !== "boolean"));
    const newest: Record<string, any> = {};
    for (const l of all) {
      if (!l.ruleId) continue;
      if (!newest[l.ruleId] || Date.parse(l.timestamp) > Date.parse(newest[l.ruleId].timestamp)) newest[l.ruleId] = l;
    }
    const findings: string[] = [];
    for (const [cfg, expectAllow] of RULES) {
      const log = newest[cfg.id];
      if (!log) { findings.push(`${cfg.id}: NO recent log (attribution lost over time)`); continue; }
      if (!!log.isValid !== expectAllow) findings.push(`${cfg.id}: newest log.isValid=${log.isValid} ≠ ${expectAllow}`);
      if (log.premadeRuleType !== cfg.premadeRuleType) findings.push(`${cfg.id}: premadeRuleType=${log.premadeRuleType} ≠ ${cfg.premadeRuleType}`);
      if (log.fieldId !== cfg.fieldId) findings.push(`${cfg.id}: fieldId=${log.fieldId} ≠ ${cfg.fieldId}`);
    }
    const mine = RULES.filter(([c]) => newest[c.id]).length;
    console.log(`${label}: store=${all.length}/≤50, mine attributed=${mine}/7, malformed=${malformed.length}, findings=${findings.length}`);
    expect(all.length, `${label}: store honors MAX_LOGS(50) under sustained load`).toBeLessThanOrEqual(50);
    expect(malformed.length, `${label}: no corrupted/truncated log`).toBe(0);
    expect(findings, `${label} findings:\n${findings.join("\n")}`).toEqual([]);
  };

  try {
    const ROUNDS = 8;
    for (let round = 1; round <= ROUNDS; round++) {
      for (let j = 0; j < attached.length; j++) { await doTransition(key!, attached[j].transitionId); await sleep(450); }
      await sleep(3000); // let this round's logs settle before the next round
      if (round === 4) { await audit("mid-soak (round 4, ~28 writes)"); }
      if (round < ROUNDS) await sleep(4000); // space rounds over time (~90s total)
    }
    await sleep(4000);
    // 8 rounds × 7 = 56 writes > 50 cap, spread over time → the ring must be honest + freshest at the end.
    await audit("end-soak (round 8, ~56 writes)");
  } finally {
    await detachByNamePrefix(WF, "ZSOAK-").catch(() => {});
    await setField(key!, { [TEXT]: null, [NUM]: null, labels: [], duedate: null }).catch(() => {});
  }
});
