// Tick 4 verification: prove the premade-VALIDATOR block path works with CORRECT config (ruleType =
// catalog key), and that a misconfigured ruleType now logs the unrecognized-type warning.
import { attachSelfLoopRules, statusRefByName, detachByNamePrefix } from "../../../data/cogni-workflow.mjs";
import { doTransition } from "../../../data/jira.mjs";
const WF = "Software Simplified Workflow for Project COGTEST";
const KEY = "COGTEST-2476";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ts = Date.now();
const specs = [
  { name: `ZVERIFY-block-len-${ts}`, type: "validator", expectBlock: true,
    config: { ruleType: "text-length", ruleKind: "premade", fieldId: "summary", min: 100000, max: 100001, errorMessage: "must be 100000+ chars" } },
  { name: `ZVERIFY-block-rx-${ts}`, type: "validator", expectBlock: true,
    config: { ruleType: "field-regex", ruleKind: "premade", fieldId: "summary", regex: "^ZZZ_NEVER_[0-9]{9}$", errorMessage: "never matches" } },
  { name: `ZVERIFY-pass-req-${ts}`, type: "validator", expectBlock: false,
    config: { ruleType: "field-required", ruleKind: "premade", fieldId: "summary", errorMessage: "summary required" } },
  { name: `ZVERIFY-pass-len-${ts}`, type: "validator", expectBlock: false,
    config: { ruleType: "text-length", ruleKind: "premade", fieldId: "summary", min: 1, max: 2000, errorMessage: "1-2000" } },
  // deliberately WRONG ruleType → must fail-open AND emit the new warning in forge logs.
  { name: `ZVERIFY-badtype-${ts}`, type: "validator", expectBlock: false,
    config: { ruleType: "validator", ruleKind: "premade", fieldId: "summary", errorMessage: "n/a" } },
];
const hub = await statusRefByName(WF, "Backlog");
const res = await attachSelfLoopRules(WF, hub, specs, 9700);
await sleep(4000);
let pass = 0;
for (let i = 0; i < res.length; i++) {
  const r = await doTransition(KEY, res[i].transitionId);
  const blocked = r.status >= 400;
  const ok = blocked === specs[i].expectBlock;
  if (ok) pass++;
  console.log(`  ${specs[i].name.replace(/-\d+$/, "").padEnd(18)} -> ${r.status} ${specs[i].expectBlock ? "(expect BLOCK)" : "(expect ALLOW)"} ${ok ? "✓" : "✗ WRONG"}`);
  await sleep(1200);
}
console.log(`\nVERIFY: ${pass}/${res.length} premade decisions correct with proper config`);
// cleanup these temp verify transitions (NOT the ZSCALE bed)
await detachByNamePrefix(WF, "ZVERIFY-").catch(() => {});
console.log("cleaned up ZVERIFY- transitions");
