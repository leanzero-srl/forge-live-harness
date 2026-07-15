// AT-SCALE — EXPANSION: a wider, multi-project test bed. Creates issues in sparse projects and attaches
// SYSTEM-FIELD rules (labels + summary premade/AI — no COGTEST custom fields) across several "Software
// Simplified" workflows, then registers. A separate paced sweep (expand-fire.mjs) transitions them.
// Run: node scenarios/cognirunner/scale/expand-bed.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachSelfLoopRules, statusRefByName } from "../../../data/cogni-workflow.mjs";
import { get, post, searchJql, mapLimit, stats } from "../../../data/jira.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(here, "expand-manifest.jsonl");
const HOOK = process.env.COGNI_TESTHOOK_URL, SECRET = process.env.HARNESS_SECRET;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TARGETS = [
  { proj: "DFD", projId: "10010", itId: "10005", wf: "Software Simplified Workflow for Project DFD" },
  { proj: "TEF", projId: "10004", itId: "10005", wf: "Software Simplified Workflow for Project TEF" },
  { proj: "ES", projId: "10013", itId: "10005", wf: "Software Simplified Workflow for Project ES" },
  { proj: "TES", projId: "10011", itId: "10005", wf: "Software Simplified Workflow for Project TES" },
  { proj: "FIEL", projId: "10012", itId: "10005", wf: "Software Simplified Workflow for Project FIEL" },
];
const MIN_ISSUES = 30;
const RULES_PER_WF = 12;

// system-field rules (work on ANY project — no custom fields)
function ruleSpecs(proj, wf, base) {
  const specs = []; let i = base;
  // 6 label static PFs (deterministic effect = a label)
  for (let k = 0; k < 6; k++) {
    const n = i++;
    specs.push({ name: `ZEXP-${proj}-spf${n}`, type: "static", ruleClass: "static-pf", effect: { label: `zexp-r${n}` },
      config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: wf },
        functions: [{ id: crypto.randomUUID(), name: "step", code: `await api.addLabels('zexp-r${n}');\nconst iss = await api.getIssue(api.context.issueKey);\nawait api.addLabels('zexp-len' + String(iss.fields.summary||'').length);` }] } });
  }
  // 4 premade validators on summary (3 pass, 1 block — real truth-table, CORRECT config: ruleType=catalog key)
  const pv = [
    { rt: "field-required", expectBlock: false },
    { rt: "text-length", min: 1, max: 5000, expectBlock: false },
    { rt: "field-regex", regex: ".+", expectBlock: false },
    { rt: "text-length", min: 100000, max: 100001, expectBlock: true },
  ];
  for (const p of pv) { const n = i++; const { rt, expectBlock, ...params } = p;
    specs.push({ name: `ZEXP-${proj}-pv${n}`, type: "validator", ruleClass: "premade-validator", expectBlock,
      config: { ruleType: rt, ruleKind: "premade", fieldId: "summary", errorMessage: `zexp ${n}`, ...params } }); }
  // 2 AI validators on summary
  for (let k = 0; k < 2; k++) { const n = i++;
    specs.push({ name: `ZEXP-${proj}-aiv${n}`, type: "validator", ruleClass: "ai-validator",
      config: { fieldId: "summary", debugTrace: true, prompt: "Return isValid=true if the Summary is a descriptive phrase of at least three words; otherwise isValid=false." } }); }
  return specs.slice(0, RULES_PER_WF);
}

async function ensureIssues(t) {
  const have = (await searchJql(`project = ${t.proj}`, ["key"], 60)).length;
  if (have >= MIN_ISSUES) { console.log(`  ${t.proj}: ${have} issues (ok)`); return have; }
  const need = MIN_ISSUES - have;
  console.log(`  ${t.proj}: ${have} issues, creating ${need}...`);
  let made = 0;
  await mapLimit([...Array(need).keys()], 3, async (k) => {
    try { await post(`/rest/api/3/issue`, { fields: { project: { id: t.projId }, issuetype: { id: t.itId }, summary: `ZEXP scale bed issue ${k} for ${t.proj} automated test` } }); made++; }
    catch (e) { if (k === 0) console.log(`    create failed: ${String(e.message).slice(0, 80)}`); }
  });
  console.log(`  ${t.proj}: +${made} created`);
  return have + made;
}

async function main() {
  fs.writeFileSync(MANIFEST, "");
  const allRuleRows = [];
  let baseIdx = 5000;
  for (const t of TARGETS) {
    console.log(`\n[expand] === ${t.proj} (${t.wf}) ===`);
    await ensureIssues(t);
    const hub = (await statusRefByName(t.wf, "Backlog")) || (await statusRefByName(t.wf, "To Do")) || (await statusRefByName(t.wf, "Open"));
    if (!hub) { console.log(`  ${t.proj}: no hub status found — skipping rules`); continue; }
    const specs = ruleSpecs(t.proj, t.wf, baseIdx); baseIdx += 100;
    try {
      const res = await attachSelfLoopRules(t.wf, hub, specs, 9401);
      res.forEach((r, idx) => { const s = specs[idx]; const row = { proj: t.proj, wf: t.wf, ruleId: r.ruleId, transitionId: r.transitionId, name: r.name, type: r.type, ruleClass: s.ruleClass, expectBlock: s.expectBlock || false, effect: s.effect || null }; allRuleRows.push(row); });
      fs.appendFileSync(MANIFEST, res.map((r, idx) => JSON.stringify({ proj: t.proj, wf: t.wf, ruleId: r.ruleId, transitionId: r.transitionId, name: r.name, type: r.type, ruleClass: specs[idx].ruleClass, expectBlock: specs[idx].expectBlock || false, effect: specs[idx].effect || null })).join("\n") + "\n");
      console.log(`  ${t.proj}: attached ${res.length} rules on hub ${hub}`);
    } catch (e) { console.log(`  ${t.proj}: attach FAILED ${String(e.message).slice(0, 100)}`); }
    await sleep(600);
  }
  // register (up to the 500 cap — extra live rules stay unregistered but still fire)
  if (HOOK && SECRET && allRuleRows.length) {
    const rules = allRuleRows.map((m) => ({ instanceId: m.ruleId, type: m.type === "static" ? "postfunction-static" : "validator", fieldId: "summary", prompt: m.ruleClass, workflowName: m.wf, transitionId: m.transitionId, transitionName: m.name }));
    const r = await fetch(HOOK, { method: "POST", headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "registerRules", rules }) }).then((x) => x.json());
    console.log(`\n[expand] registerRules: ${JSON.stringify(r)}`);
  }
  const byProj = {}; for (const m of allRuleRows) byProj[m.proj] = (byProj[m.proj] || 0) + 1;
  console.log(`\n[expand] === EXPANSION BED ===`);
  console.log(`[expand] rules attached across ${Object.keys(byProj).length} new workflows: ${allRuleRows.length}  ${JSON.stringify(byProj)}`);
  console.log(`[expand] REST=${stats.requests} 429s=${stats.status429} 5xx=${stats.status5xx}`);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
