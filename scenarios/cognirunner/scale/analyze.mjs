// AT-SCALE PERSISTENT RULE BED — Tick 3: ANALYZE.
// Reconciles the fire log against persistent ISSUE EFFECTS (the load-bearing at-scale oracle, since
// the execution-log store is capped at 50): reads back labels + the computed field for every fired
// issue and verifies correctness. Also aggregates fire statuses and checks the premade truth-table.
// forge-logs taxonomy is pulled separately (see the wrapper). Run: node scenarios/cognirunner/scale/analyze.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { get, mapLimit } from "../../../data/jira.mjs";

const TEXT = "customfield_10280";
const NUM_FIELD = "customfield_10282";
const here = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(here, "rule-manifest.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const fires = fs.readFileSync(path.join(here, "fires.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const ruleById = new Map(rules.map((r) => [r.ruleId, r]));

async function main() {
  // ---- 1. fire-status aggregation ----
  const status = { attempted: fires.length, allowed: 0, blocked: 0, error: 0 };
  const byClass = {};
  for (const f of fires) {
    const bucket = f.status >= 500 ? "error" : f.status >= 400 ? "blocked" : "allowed";
    status[bucket]++;
    (byClass[f.ruleClass] ||= { n: 0, allowed: 0, blocked: 0, error: 0 })[bucket]++;
    byClass[f.ruleClass].n++;
  }

  // ---- 2. premade truth-table: does block/allow match expectBlock? ----
  const premadeFires = fires.filter((f) => f.ruleClass === "premade-validator");
  let pmCorrect = 0, pmWrong = 0;
  for (const f of premadeFires) {
    const wasBlocked = f.status >= 400 && f.status < 500;
    if (wasBlocked === !!f.expectBlock) pmCorrect++; else pmWrong++;
  }

  // ---- 3. deterministic EFFECT readback (correctness at scale) ----
  // Bulk-read every fired issue's labels + computed field. A static-PF fire "landed" iff its
  // deterministic label (zscale-r<n>) is present on the issue it fired on.
  const firedIssues = [...new Set(fires.map((f) => f.issueKey))];
  const issueData = new Map();
  await mapLimit(firedIssues, 6, async (key) => {
    try { const iss = await get(`/rest/api/3/issue/${key}?fields=labels,${TEXT},${NUM_FIELD}`); issueData.set(key, { labels: new Set(iss.fields.labels || []), text: iss.fields[TEXT], num: Number(iss.fields[NUM_FIELD]) || 0 }); }
    catch { issueData.set(key, { labels: new Set(), text: null, num: 0, readError: true }); }
  });

  const staticFires = fires.filter((f) => f.ruleClass === "static-pf" && f.status < 400);
  let landed = 0, notLanded = 0;
  for (const f of staticFires) {
    const rule = ruleById.get(f.ruleId);
    const lbl = rule?.effect?.label;
    const data = issueData.get(f.issueKey);
    if (lbl && data && data.labels.has(lbl)) landed++; else notLanded++;
  }

  // ---- 4. value spot-check: parse cf_10280 = SPF<n>=<v>, verify v == 5*K+off for arith rules ----
  // (labels prove execution; this proves the COMPUTED VALUE is exact. Sample the fired issues.)
  let valOk = 0, valBad = 0; const valSamples = [];
  for (const [key, data] of issueData) {
    const m = String(data.text || "").match(/^SPF(\d+)=(-?\d+)$/);
    if (!m) continue;
    const n = Number(m[1]), got = Number(m[2]);
    const rule = rules.find((r) => r.name === `ZSCALE-spf${n}` && r.effect && (r.effect.kind === "arith" || r.effect.kind === "arith-parity"));
    if (!rule) continue;
    const expected = data.num * rule.effect.K + rule.effect.off;
    if (got === expected) valOk++; else { valBad++; if (valSamples.length < 10) valSamples.push({ key, n, got, expected }); }
  }

  // ---- report ----
  console.log(`\n===== TICK 3 ANALYSIS =====`);
  console.log(`TRANSITIONS: attempted=${status.attempted} allowed(204)=${status.allowed} blocked(4xx)=${status.blocked} error(5xx)=${status.error}`);
  console.log(`by class:`); for (const [c, v] of Object.entries(byClass)) console.log(`  ${c.padEnd(20)} n=${String(v.n).padStart(5)} allowed=${v.allowed} blocked=${v.blocked} error=${v.error}`);
  console.log(`\nPREMADE truth-table: ${pmCorrect}/${premadeFires.length} block/allow decisions matched expectation (${pmWrong} wrong)`);
  console.log(`\nSTATIC-PF EFFECT landing (execution correctness): ${landed}/${landed + notLanded} fires landed their deterministic label`);
  console.log(`  not-landed=${notLanded} (braked ≤10/issue/5min, or write failed — cross-check with forge logs)`);
  console.log(`\nSTATIC-PF VALUE correctness (arith spot-check): ${valOk}/${valOk + valBad} exact (${valBad} mismatched)`);
  if (valSamples.length) console.log(`  mismatches (sample):`, JSON.stringify(valSamples));
  console.log(`\nissues touched: ${firedIssues.length}; read errors: ${[...issueData.values()].filter((d) => d.readError).length}`);
  // machine-readable summary
  fs.writeFileSync(path.join(here, "analysis-summary.json"), JSON.stringify({ status, byClass, premade: { correct: pmCorrect, wrong: pmWrong, total: premadeFires.length }, staticLanding: { landed, notLanded }, staticValue: { ok: valOk, bad: valBad, samples: valSamples }, issuesTouched: firedIssues.length }, null, 2));
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
