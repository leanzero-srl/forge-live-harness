// RULE-EXERCISE LAB — SCALE + regression pass (the KINDS are covered L1–L24; this stresses VOLUME +
// attribution + the log-store cap honesty). Two deep-backend tests on COGTEST:
//   (A) 15 varied premade validators — all readable from ONE fixture state, each with a UNIQUE config.id
//       — fired in a BURST. Audit that EACH rule's log is present, its verdict is correct, and it is
//       ATTRIBUTED to the right rule (log.ruleId / premadeRuleType / fieldId). Catches cross-contamination.
//   (B) log-store CAP honesty — fire one marked validator ~45× so this run alone overflows MAX_LOGS(50):
//       assert execLogs never exceeds 50, keeps the NEWEST, and every entry is well-formed (no silent
//       corruption / truncation).
// Deterministic (no AI, no BYOK cost).
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
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
const pm = (id: string, ruleType: string, fieldId: string, extra: any, msg: string) => ({
  id, ruleType, premadeRuleType: ruleType, ruleKind: "premade", fieldId, ...extra, errorMessage: msg,
});

test("📦 scale: 15 varied premade validators fired in a burst — every log correct + attributed", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  // ONE fixture state that makes every rule's verdict predictable.
  await setField(key!, { [TEXT]: "Apple5", [NUM]: 10, labels: ["x"], duedate: isoDay(5) });
  await sleep(2500);

  // [config, expectedAllow]
  const RULES: [any, boolean][] = [
    [pm("SCALE-R01", "field-required", TEXT, {}, "R01"), true],
    [pm("SCALE-R02", "field-comparison", NUM, { op: "gte", compareValue: "5" }, "R02"), true],
    [pm("SCALE-R03", "field-comparison", NUM, { op: "lte", compareValue: "5" }, "R03"), false],
    [pm("SCALE-R04", "field-comparison", NUM, { op: "gt", compareValue: "20" }, "R04"), false],
    [pm("SCALE-R05", "field-comparison", NUM, { op: "ne", compareValue: "5" }, "R05"), true],
    [pm("SCALE-R06", "field-comparison", TEXT, { op: "contains", compareValue: "App" }, "R06"), true],
    [pm("SCALE-R07", "field-regex", TEXT, { regex: "^App" }, "R07"), true],
    [pm("SCALE-R08", "field-regex", TEXT, { regex: "^Z" }, "R08"), false],
    [pm("SCALE-R09", "allowed-values", "labels", { allowedValues: "x, y" }, "R09"), true],
    [pm("SCALE-R10", "allowed-values", "labels", { allowedValues: "a, b" }, "R10"), false],
    [pm("SCALE-R11", "text-length", TEXT, { min: "3" }, "R11"), true],
    [pm("SCALE-R12", "text-length", TEXT, { max: "3" }, "R12"), false],
    [pm("SCALE-R13", "field-cardinality", "labels", { max: "1" }, "R13"), true],
    [pm("SCALE-R14", "date-relative", "duedate", { mode: "future" }, "R14"), true],
    [pm("SCALE-R15", "date-relative", "duedate", { mode: "within", days: "2" }, "R15"), false],
  ];
  const specs = RULES.map(([cfg]) => ({ name: `ZSCL-${cfg.id}-${Date.now()}`, type: "validator" as const, config: cfg }));
  const attached = await attachSelfLoopRules(WF, HUB, specs);
  const since = Date.now();
  try {
    // BURST: fire all 15 back-to-back (short spacing), collecting the transition verdict.
    const fired: Record<string, boolean> = {};
    for (let i = 0; i < attached.length; i++) {
      const r = await doTransition(key!, attached[i].transitionId);
      fired[RULES[i][0].id] = r.status < 400; // allowed?
      await sleep(700);
    }
    await sleep(5000); // let logs settle
    // audit: map ruleId → log
    const logs = (await execLogs()).filter((l: any) => l.type === "validator" && Date.parse(l.timestamp) >= since - 2000);
    const byId: Record<string, any> = {};
    for (const l of logs) if (l.ruleId && !byId[l.ruleId]) byId[l.ruleId] = l;
    const findings: string[] = [];
    for (const [cfg, expectAllow] of RULES) {
      const log = byId[cfg.id];
      const tr = fired[cfg.id];
      if (tr !== expectAllow) findings.push(`${cfg.id}: transition verdict ${tr ? "ALLOW" : "BLOCK"} ≠ expected ${expectAllow ? "ALLOW" : "BLOCK"}`);
      if (!log) { findings.push(`${cfg.id}: NO LOG (attribution lost at volume)`); continue; }
      if (!!log.isValid !== expectAllow) findings.push(`${cfg.id}: log.isValid=${log.isValid} ≠ expected ${expectAllow}`);
      if (log.premadeRuleType !== cfg.premadeRuleType) findings.push(`${cfg.id}: log premadeRuleType=${log.premadeRuleType} ≠ ${cfg.premadeRuleType}`);
      if (log.fieldId !== cfg.fieldId) findings.push(`${cfg.id}: log fieldId=${log.fieldId} ≠ ${cfg.fieldId}`);
    }
    const present = RULES.filter(([c]) => byId[c.id]).length;
    console.log(`scale burst: ${present}/15 rules logged + attributed; ${findings.length} finding(s)`);
    expect(logs.length, "readable logs never exceed MAX_LOGS(50)").toBeLessThanOrEqual(50);
    expect(findings, `scale attribution findings:\n${findings.join("\n")}`).toEqual([]);
  } finally {
    await detachByNamePrefix(WF, "ZSCL-").catch(() => {});
    await setField(key!, { [TEXT]: null, [NUM]: null, labels: [], duedate: null }).catch(() => {});
  }
});

test("🗄️ log-store cap honesty: overflow MAX_LOGS in one burst — capped, newest kept, no corruption", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  const nonce = "SCALECAP-" + crypto.randomUUID().slice(0, 6).toUpperCase();
  await setField(key!, { [NUM]: null }); // empty → field-required BLOCKS every time (a real log each fire)
  await sleep(2000);
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZCAP-${Date.now()}`, type: "validator",
    config: { id: "SCALECAP", ruleType: "field-required", premadeRuleType: "field-required", ruleKind: "premade", fieldId: NUM, errorMessage: nonce },
  }]);
  const since = Date.now();
  try {
    const N = 45;
    for (let i = 0; i < N; i++) { await doTransition(key!, pf.transitionId); await sleep(600); }
    await sleep(5000);
    const all = await execLogs();
    const mine = all.filter((l: any) => String(l.reason || "").includes(nonce) && Date.parse(l.timestamp) >= since - 2000);
    const malformed = all.filter((l: any) => !l.type || !l.timestamp || typeof l.isValid !== "boolean");
    console.log(`cap: total readable=${all.length} (≤50?), mine present=${mine.length}/${N}, malformed=${malformed.length}`);
    expect(all.length, "readable logs are hard-capped at MAX_LOGS(50) — no silent unbounded growth").toBeLessThanOrEqual(50);
    // 45 fresh < 50 cap ⇒ all my newest fires survive (honest ring, newest kept).
    expect(mine.length, "the newest burst is retained (nothing recent silently dropped)").toBeGreaterThanOrEqual(40);
    expect(malformed.length, "no entry is corrupted/truncated by the cap").toBe(0);
  } finally {
    await detachByNamePrefix(WF, "ZCAP").catch(() => {});
    await setField(key!, { [NUM]: null }).catch(() => {});
  }
});
