// AT-SCALE PERSISTENT RULE BED — Tick 1: CREATE.
// Authors a diverse, intricate rule set and attaches it PERSISTENTLY (no detach) to the COGTEST
// workflow on wolfaenpak (sanctioned test env). Deterministic-effect rules so correctness is
// verifiable at scale by reading the effect back. Then registers them into the admin registry via
// the dev-gated registerRules hook. Idempotent-ish: uses the ZSCALE- name prefix; re-running adds more.
// Run: node scenarios/cognirunner/scale/create-rules.mjs [targetCount]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { attachSelfLoopRules, statusRefByName } from "../../../data/cogni-workflow.mjs";
import { stats } from "../../../data/jira.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const TEXT = "customfield_10280";   // text
const NUM = "customfield_10282";    // number
const HOOK = process.env.COGNI_TESTHOOK_URL;
const SECRET = process.env.HARNESS_SECRET;
const here = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST = path.join(here, "rule-manifest.jsonl");

const TARGET = Number(process.argv[2] || 260);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- rule generators (diverse + intricate; deterministic effects where possible) ----
function spfSpec(n) {
  const K = 2 + (n % 5), off = 100 + n, flavor = n % 4;
  let code, effect;
  if (flavor === 0) {
    code = `const iss = await api.getIssue(api.context.issueKey);
const num = Number(iss.fields.${NUM}) || 0;
const v = num * ${K} + ${off};
await api.updateIssue(api.context.issueKey, { ${TEXT}: 'SPF${n}=' + v });
await api.addLabels('zscale-r${n}');`;
    effect = { kind: "arith", K, off, label: `zscale-r${n}` };
  } else if (flavor === 1) {
    code = `const iss = await api.getIssue(api.context.issueKey);
const num = Number(iss.fields.${NUM}) || 0;
const v = num * ${K} + ${off};
await api.updateIssue(api.context.issueKey, { ${TEXT}: 'SPF${n}=' + v });
await api.addLabels(v % 2 === 0 ? 'zscale-r${n}-even' : 'zscale-r${n}-odd');
await api.addLabels('zscale-r${n}');`;
    effect = { kind: "arith-parity", K, off, label: `zscale-r${n}` };
  } else if (flavor === 2) {
    code = `const r = await api.searchJql('project = COGTEST AND statusCategory != Done');
const arr = Array.isArray(r) ? r : (r && r.issues) || [];
await api.updateIssue(api.context.issueKey, { ${TEXT}: 'SPF${n}sibs=' + arr.length });
await api.addLabels('zscale-r${n}');`;
    effect = { kind: "jql-siblings", label: `zscale-r${n}` };
  } else {
    code = `const iss = await api.getIssue(api.context.issueKey);
const t = String(iss.fields.${TEXT} || '');
await api.updateIssue(api.context.issueKey, { ${TEXT}: 'SPF${n}[' + t.slice(0, 6).toUpperCase() + ']' });
await api.addLabels('zscale-r${n}');`;
    effect = { kind: "string-xform", label: `zscale-r${n}` };
  }
  return { name: `ZSCALE-spf${n}`, type: "static", ruleClass: "static-pf", effect,
    config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF },
      functions: [{ id: crypto.randomUUID(), name: "step", code }] } };
}

function premadeSpec(n) {
  // Mostly-passing validators (so transitions succeed) + a deterministic blocking minority (truth-table).
  const passing = [
    { premadeRuleType: "field-required", fieldId: "summary" },
    { premadeRuleType: "text-length", fieldId: "summary", min: 1, max: 2000 },
    { premadeRuleType: "field-regex", fieldId: "summary", regex: ".+" },
    { premadeRuleType: "field-required", fieldId: "issuetype" },
    { premadeRuleType: "text-length", fieldId: "summary", min: 1, max: 5000 },
  ];
  const blocking = [
    // requires a field that is (by design) empty on the pool → blocks. Deterministic truth-table.
    { premadeRuleType: "field-required", fieldId: "customfield_10999_unset", expectBlock: true },
    { premadeRuleType: "text-length", fieldId: "summary", min: 100000, max: 100001, expectBlock: true },
  ];
  const block = n % 5 === 0;
  const base = block ? blocking[n % blocking.length] : passing[n % passing.length];
  const expectBlock = !!base.expectBlock;
  const { expectBlock: _e, ...params } = base;
  return { name: `ZSCALE-pv${n}`, type: "validator", ruleClass: "premade-validator", expectBlock,
    config: { ruleType: "validator", ruleKind: "premade", errorMessage: `zscale premade ${n} blocked`, ...params } };
}

function aivSpec(n) {
  const agentic = n % 4 === 0;
  return { name: `ZSCALE-aiv${n}`, type: "validator", ruleClass: agentic ? "ai-agentic" : "ai-validator",
    config: agentic
      ? { fieldId: "summary", enableTools: true, debugTrace: true,
          prompt: "You can search Jira with JQL. Decide if this issue's summary looks like a clear duplicate of another open issue in its project. If a clear duplicate exists, isValid=false and name the key; otherwise isValid=true." }
      : { fieldId: "summary", debugTrace: true,
          prompt: "Return isValid=true if the Summary is a non-empty descriptive phrase of at least three words; otherwise isValid=false. Judge only the summary text." } };
}

function semSpec(n) {
  const flavors = ["postfunction-semantic", "postfunction-comment", "postfunction-subtask"];
  const f = flavors[n % flavors.length];
  const common = { type: f, id: crypto.randomUUID(), workflow: { workflowName: WF }, fieldId: "summary", debugTrace: true };
  let config, ruleClass;
  if (f === "postfunction-semantic") {
    config = { ...common, conditionPrompt: "Run every time, unconditionally.",
      actionPrompt: "Classify the summary's urgency as exactly one token: RED, AMBER, or GREEN. Output only that token.", actionFieldId: TEXT };
    ruleClass = "semantic-classify";
  } else if (f === "postfunction-comment") {
    config = { ...common, commentPrompt: `Write one short sentence noting an automated review ran. Include the token ZSEM${n}.` };
    ruleClass = "semantic-comment";
  } else {
    config = { ...common, subtaskPrompt: "Create a sub-task capturing the concrete next step implied by the summary." };
    ruleClass = "semantic-subtask";
  }
  return { name: `ZSCALE-sem${n}`, type: "semantic", ruleClass, config };
}

// ---- build the mixed spec list ----
function buildSpecs(target, base) {
  const specs = [];
  let i = base;
  // ratios: ~48% static, ~30% premade, ~14% AI, ~8% semantic
  const nStatic = Math.round(target * 0.48), nPrem = Math.round(target * 0.30),
        nAiv = Math.round(target * 0.14), nSem = target - nStatic - nPrem - nAiv;
  for (let k = 0; k < nStatic; k++) specs.push(spfSpec(i++));
  for (let k = 0; k < nPrem; k++) specs.push(premadeSpec(i++));
  for (let k = 0; k < nAiv; k++) specs.push(aivSpec(i++));
  for (let k = 0; k < nSem; k++) specs.push(semSpec(i++));
  return specs;
}

async function main() {
  console.log(`[create] target=${TARGET}, WF="${WF}"`);
  const hub = await statusRefByName(WF, "Backlog");
  if (!hub) throw new Error("Backlog status not found on COGTEST workflow");
  console.log(`[create] Backlog hub statusRef=${hub}`);

  // Continue the rule index + transition-id range from whatever already exists (re-run-safe: no
  // name/label/id collisions), and APPEND to the manifest.
  const existing = fs.existsSync(MANIFEST) ? fs.readFileSync(MANIFEST, "utf8").trim().split("\n").filter(Boolean).length : 0;
  const specs = buildSpecs(TARGET, existing);
  console.log(`[create] built ${specs.length} specs (base index ${existing}; static/premade/ai/semantic mix)`);

  // Attach in small batches so each workflows/update payload stays moderate; re-read version each batch.
  const manifest = [];
  const BATCH = 12;
  let startId = 9001 + existing * 2, attached = 0, failedBatches = 0;
  for (let b = 0; b < specs.length; b += BATCH) {
    const batch = specs.slice(b, b + BATCH);
    try {
      const res = await attachSelfLoopRules(WF, hub, batch, startId);
      res.forEach((r, idx) => {
        const spec = batch[idx];
        manifest.push({ ruleId: r.ruleId, transitionId: r.transitionId, name: r.name, type: r.type,
          ruleClass: spec.ruleClass, expectBlock: spec.expectBlock || false, effect: spec.effect || null,
          fieldId: spec.config.fieldId || null, workflowName: WF });
      });
      attached += res.length;
      startId += BATCH + 5;
      if (b % 60 === 0) console.log(`[create] attached ${attached}/${specs.length} (batch @${b}); wf reads=${stats.requests}`);
      await sleep(400);
    } catch (e) {
      failedBatches++;
      console.log(`[create] batch @${b} FAILED: ${String(e.message).slice(0, 160)}`);
      if (String(e.message).match(/too large|payload|413|400/i)) { console.log("[create] payload ceiling hit — stopping attach."); break; }
      if (failedBatches > 5) { console.log("[create] too many failed batches — stopping."); break; }
      startId += BATCH + 5;
      await sleep(1500);
    }
  }

  fs.appendFileSync(MANIFEST, manifest.map((m) => JSON.stringify(m)).join("\n") + "\n");
  console.log(`\n[create] ATTACHED ${attached} live rules (appended to manifest ${MANIFEST})`);

  // Register into the admin registry (the table the owner watches), 500-capped.
  if (HOOK && SECRET) {
    const rules = manifest.map((m) => ({
      instanceId: m.ruleId, type: m.type === "static" ? "postfunction-static" : m.type === "semantic" ? (m.ruleClass.startsWith("semantic") ? "postfunction-semantic" : "postfunction") : "validator",
      fieldId: m.fieldId, prompt: m.ruleClass, workflowName: WF, transitionId: m.transitionId, transitionName: m.name,
    }));
    // register in chunks of 200 to keep the POST body sane
    let added = 0, updated = 0, skipped = 0;
    for (let i = 0; i < rules.length; i += 200) {
      const chunk = rules.slice(i, i + 200);
      const r = await fetch(HOOK, { method: "POST", headers: { Authorization: `Bearer ${SECRET}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "registerRules", rules: chunk }) }).then((x) => x.json());
      added += r.added || 0; updated += r.updated || 0; skipped += r.skipped || 0;
      console.log(`[create] registerRules chunk ${i}: ${JSON.stringify(r)}`);
    }
    console.log(`[create] REGISTERED +${added} added, ${updated} updated, ${skipped} skipped (500-cap)`);
  } else {
    console.log("[create] COGNI_TESTHOOK_URL/HARNESS_SECRET not set — skipping registration");
  }

  // Report counts by class.
  const byClass = {};
  for (const m of manifest) byClass[m.ruleClass] = (byClass[m.ruleClass] || 0) + 1;
  console.log(`\n[create] === TICK 1 REPORT ===`);
  console.log(`[create] rules attached (live): ${attached}`);
  console.log(`[create] by class: ${JSON.stringify(byClass)}`);
  console.log(`[create] REST requests: ${stats.requests}, 429s: ${stats.status429}, 5xx: ${stats.status5xx}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
