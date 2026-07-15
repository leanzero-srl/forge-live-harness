// Prove the app handles GENUINELY COMPLEX rules. Reads the workflow-verified intricate templates,
// attaches them as ZCOMPLEX- self-loops on COGTEST, registers, fires each a BOUNDED number of times
// (some create links/comments/properties — not for volume), and verifies they EXECUTE correctly.
// Run: node scenarios/cognirunner/scale/attach-complex.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachSelfLoopRules, statusRefByName } from "../../../data/cogni-workflow.mjs";
import { get, searchJql, doTransition, mapLimit, stats } from "../../../data/jira.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(here, "complex-templates.json");
const HOOK = process.env.COGNI_TESTHOOK_URL, SECRET = process.env.HARNESS_SECRET;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FIRES_PER_RULE = 6; // bounded (these do real writes/links)

const templates = JSON.parse(fs.readFileSync(TEMPLATES, "utf8"));
console.log(`[complex] ${templates.length} verified-complex templates`);

const specs = templates.map((t, i) => ({
  name: `ZCOMPLEX-${t.name}-${i}`, type: "static", tname: t.name, steps: t.steps,
  config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF },
    functions: [{ id: crypto.randomUUID(), name: t.name, code: t.code }] },
}));

const hub = await statusRefByName(WF, "Backlog");
const res = await attachSelfLoopRules(WF, hub, specs, 9800);
console.log(`[complex] attached ${res.length} complex rules`);
// register
if (HOOK && SECRET) {
  const rules = res.map((r) => ({ instanceId: r.ruleId, type: "postfunction-static", fieldId: null, prompt: "complex", workflowName: WF, transitionId: r.transitionId, transitionName: r.name }));
  const rr = await fetch(HOOK, { method: "POST", headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "registerRules", rules }) }).then((x) => x.json());
  console.log(`[complex] registerRules: ${JSON.stringify(rr)}`);
}
await sleep(3000);

// pool + fire each complex rule a BOUNDED number of times, spread across issues
const pool = (await searchJql(`project = COGTEST AND status = "Backlog" ORDER BY created DESC`, ["key"], 80)).map((i) => i.key);
let gi = 0;
const tasks = [];
for (let r = 0; r < FIRES_PER_RULE; r++) for (const rule of res) tasks.push({ key: pool[(gi++) % pool.length], rule });
const outcomes = { attempted: 0, allowed: 0, blocked: 0, error: 0 };
await mapLimit(tasks, 3, async ({ key, rule }) => {
  try { const rr = await doTransition(key, rule.transitionId); outcomes.attempted++; if (rr.status >= 500) outcomes.error++; else if (rr.status >= 400) outcomes.blocked++; else outcomes.allowed++; }
  catch (e) { outcomes.attempted++; outcomes.error++; }
});
console.log(`\n[complex] === COMPLEX-RULE FIRING ===`);
console.log(`[complex] rules: ${res.length}  fires: ${outcomes.attempted}  allowed=${outcomes.allowed} blocked=${outcomes.blocked} error=${outcomes.error}`);
console.log(`[complex] REST=${stats.requests} 429s=${stats.status429} 5xx=${stats.status5xx}`);
// save the fired transition ids for the runtime-effect check
fs.writeFileSync(path.join(here, "complex-fired.json"), JSON.stringify({ attached: res.map((r, i) => ({ name: specs[i].tname, transitionId: r.transitionId, ruleId: r.ruleId })), pool: pool.slice(0, 20) }, null, 2));
console.log(`[complex] saved complex-fired.json`);
