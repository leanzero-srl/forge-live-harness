// AT-SCALE — EXPANSION SWEEP: transitions the multi-project bed built by expand-bed.mjs. Spread across
// each project's own issue pool (round-robin, low concurrency — the same per-issue-throttle avoidance).
// Run: node scenarios/cognirunner/scale/expand-fire.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { doTransition, searchJql, mapLimit, stats } from "../../../data/jira.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const rules = fs.readFileSync(path.join(here, "expand-manifest.jsonl"), "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
const FIRES = path.join(here, "expand-fires.jsonl");
const fireLog = fs.createWriteStream(FIRES, { flags: "w" });
const ROUNDS = 6; // per rule, spread across the project's pool

const byProj = {};
for (const r of rules) (byProj[r.proj] ||= []).push(r);

const counts = { attempted: 0, allowed: 0, blocked: 0, error: 0, byProj: {} };
function record(proj, key, r, status) {
  counts.attempted++;
  const b = status >= 500 ? "error" : status >= 400 ? "blocked" : "allowed"; counts[b]++;
  (counts.byProj[proj] ||= { n: 0, allowed: 0, blocked: 0, error: 0 }); counts.byProj[proj].n++; counts.byProj[proj][b]++;
  fireLog.write(JSON.stringify({ proj, issueKey: key, transitionId: r.transitionId, ruleClass: r.ruleClass, ruleId: r.ruleId, expectBlock: r.expectBlock || false, status }) + "\n");
}

async function main() {
  const t0 = Date.now();
  for (const [proj, projRules] of Object.entries(byProj)) {
    const pool = (await searchJql(`project = ${proj} AND statusCategory != Done`, ["key"], 60)).map((i) => i.key);
    if (!pool.length) { console.log(`[expfire] ${proj}: no active-pool issues — skip`); continue; }
    // build spread tasks: each rule × ROUNDS, round-robin the project's own pool
    let gi = 0; const tasks = [];
    for (let r = 0; r < ROUNDS; r++) for (const rule of projRules) tasks.push({ key: pool[(gi++) % pool.length], rule });
    const start = counts.attempted;
    await mapLimit(tasks, 3, async ({ key, rule }) => {
      try { const res = await doTransition(key, rule.transitionId); record(proj, key, rule, res.status); }
      catch (e) { record(proj, key, rule, e?.status || 599); }
    });
    console.log(`[expfire] ${proj}: pool=${pool.length} rules=${projRules.length} → +${counts.attempted - start} fires (429s=${stats.status429})`);
  }
  fireLog.end();
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`\n[expfire] === EXPANSION SWEEP ===`);
  console.log(`[expfire] transitions: ${counts.attempted} (allowed ${counts.allowed} / blocked ${counts.blocked} / error ${counts.error}) across ${Object.keys(counts.byProj).length} projects in ${secs}s`);
  console.log(`[expfire] by project: ${JSON.stringify(counts.byProj)}`);
  console.log(`[expfire] REST=${stats.requests} 429s=${stats.status429} 5xx=${stats.status5xx}`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
