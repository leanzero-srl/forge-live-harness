// AT-SCALE PERSISTENT RULE BED — Tick 2: TRIGGER.
// Fires thousands of REST transitions across the COGTEST Backlog pool through the ZSCALE- self-loop
// rules from Tick 1. Favors the fast zero-AI paths (premade validators unlimited, static PFs spread
// across the pool to respect the ≤10 PF/issue/5min brake); AI validators + semantic PFs get a capped
// sample (latency + tokens). Records every fire to fires.jsonl for Tick 3 analysis.
// Run: node scenarios/cognirunner/scale/fire-transitions.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { doTransition, searchJql, mapLimit, stats } from "../../../data/jira.mjs";

const NUM = "customfield_10282";
const here = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(here, "rule-manifest.jsonl");
const FIRES = path.join(here, "fires.jsonl");

// rounds per class (fast classes get more; slow AI/semantic capped)
const ROUNDS = { premade: 14, aiValidator: 3, aiAgentic: 2, static: 6, semantic: 2 };
const POOL_SIZE = 400;

const rules = fs.readFileSync(MANIFEST, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const premade = rules.filter((r) => r.ruleClass === "premade-validator");
const aiVal = rules.filter((r) => r.ruleClass === "ai-validator");
const aiAgn = rules.filter((r) => r.ruleClass === "ai-agentic");
const statics = rules.filter((r) => r.ruleClass === "static-pf");
const semantic = rules.filter((r) => r.ruleClass.startsWith("semantic"));

const fireLog = fs.createWriteStream(FIRES, { flags: "w" });
const counts = { attempted: 0, allowed: 0, blocked: 0, error: 0, byClass: {} };
function record(issueKey, r, status) {
  counts.attempted++;
  if (status >= 500) counts.error++;
  else if (status >= 400) counts.blocked++;
  else counts.allowed++;
  const c = r.ruleClass; counts.byClass[c] = counts.byClass[c] || { n: 0, allowed: 0, blocked: 0, error: 0 };
  counts.byClass[c].n++;
  if (status >= 500) counts.byClass[c].error++; else if (status >= 400) counts.byClass[c].blocked++; else counts.byClass[c].allowed++;
  fireLog.write(JSON.stringify({ issueKey, transitionId: r.transitionId, ruleClass: c, ruleId: r.ruleId, expectBlock: r.expectBlock || false, status, ts: Date.now() }) + "\n");
}

async function fireTasks(tasks, concurrency, label) {
  const start = counts.attempted;
  await mapLimit(tasks, concurrency, async ({ key, rule }) => {
    try { const res = await doTransition(key, rule.transitionId); record(key, rule, res.status); }
    catch (e) { record(key, rule, e?.status || 599); }
  });
  console.log(`[fire]   ${label}: +${counts.attempted - start} fires (total ${counts.attempted}, 429s=${stats.status429})`);
}

async function main() {
  const t0 = Date.now();
  console.log(`[fire] manifest: ${rules.length} rules — premade=${premade.length} aiVal=${aiVal.length} aiAgn=${aiAgn.length} static=${statics.length} semantic=${semantic.length}`);
  // Pool of Backlog issues.
  const poolKeys = (await searchJql(`project = COGTEST AND status = "Backlog" ORDER BY created DESC`, ["key"], POOL_SIZE)).map((i) => i.key);
  console.log(`[fire] Backlog pool: ${poolKeys.length} issues (no seeding — analyze reads each issue's actual ${NUM} for the arith check)`);

  // GLOBAL round-robin issue assignment so NO single issue is hammered (Jira throttles transitions
  // PER ISSUE with brutal Retry-After when you repeat on the same key). Low concurrency to stay under
  // the site-wide write-rate limit. Each pool issue ends up with only a handful of transitions total.
  let gi = 0;
  const nextKey = () => poolKeys[(gi++) % poolKeys.length];
  const buildTasks = (ruleset, rounds) => { const t = []; for (let r = 0; r < rounds; r++) for (const rule of ruleset) t.push({ key: nextKey(), rule }); return t; };

  console.log(`[fire] premade validators: ${premade.length}×${ROUNDS.premade} across ${poolKeys.length} issues...`);
  await fireTasks(buildTasks(premade, ROUNDS.premade), 3, "premade");
  console.log(`[fire] static PFs: ${statics.length}×${ROUNDS.static} (brake ≤10/issue/5min; ~${((statics.length * ROUNDS.static) / poolKeys.length).toFixed(1)}/issue)...`);
  await fireTasks(buildTasks(statics, ROUNDS.static), 3, "static");
  console.log(`[fire] AI validators + agentic (capped)...`);
  await fireTasks([...buildTasks(aiVal, ROUNDS.aiValidator), ...buildTasks(aiAgn, ROUNDS.aiAgentic)], 2, "ai");
  console.log(`[fire] semantic PFs (capped)...`);
  await fireTasks(buildTasks(semantic, ROUNDS.semantic), 2, "semantic");

  fireLog.end();
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n[fire] === TICK 2 REPORT ===`);
  console.log(`[fire] TRANSITIONS attempted: ${counts.attempted}  allowed(204): ${counts.allowed}  blocked(4xx): ${counts.blocked}  error(5xx): ${counts.error}`);
  console.log(`[fire] by class: ${JSON.stringify(counts.byClass)}`);
  console.log(`[fire] wall-clock: ${secs}s  (~${(counts.attempted / secs).toFixed(1)}/s)  REST=${stats.requests} 429s=${stats.status429} 5xx=${stats.status5xx}`);
  console.log(`[fire] fires → ${FIRES}`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
