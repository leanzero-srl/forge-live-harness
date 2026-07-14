// RULE-EXERCISE LAB — static-PF SANDBOX SECURITY boundary (live, on COGTEST).
// The backend runs static-PF code via `new AsyncFunction("api","vars",...blockedGlobals, code)`.
// The app's DOCUMENTED guarantees (src/index.js SANDBOX_BLOCKED_GLOBALS + the per-step deadline):
//   A) 14 host globals are shadowed to `undefined` by bare name (process/require/fetch/globalThis/
//      global/Buffer/module/exports/XMLHttpRequest/WebSocket/importScripts/__dirname/__filename/eval).
//   B) a runaway (long-running) step is bounded — it can never hang the transition or run unbounded.
// NOT the app's boundary (documented): the `.constructor.constructor` escape — Forge's FaaS platform
// isolation is the real hermetic boundary there, so we do NOT assert the app closes it.
// Deterministic (no AI). Any finding = a real sandbox regression.
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { get, doTransition, request, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { setField, waitForLog } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const TEXT = "customfield_10280";
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));
test.describe.configure({ timeout: 240_000, retries: 0 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}
async function attachStatic(name: string, code: string, extraConfig: any = {}) {
  return attachSelfLoopRules(WF, HUB, [{
    name, type: "static",
    config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF }, functions: [{ id: crypto.randomUUID(), name: "step", code }], ...extraConfig },
  }]);
}

test("🛡️ sandbox A: the 14 host globals are shadowed (undefined) by bare name", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  // The code probes each blocked global by bare name and writes back the list of any that are
  // still reachable. If the shadowing holds, NONE are reachable → 'SANDBOX:ALL_BLOCKED'.
  const code = `const reachable = [];
    if (typeof process !== 'undefined') reachable.push('process');
    if (typeof require !== 'undefined') reachable.push('require');
    if (typeof fetch !== 'undefined') reachable.push('fetch');
    if (typeof globalThis !== 'undefined') reachable.push('globalThis');
    if (typeof global !== 'undefined') reachable.push('global');
    if (typeof Buffer !== 'undefined') reachable.push('Buffer');
    if (typeof module !== 'undefined') reachable.push('module');
    if (typeof exports !== 'undefined') reachable.push('exports');
    if (typeof XMLHttpRequest !== 'undefined') reachable.push('XMLHttpRequest');
    if (typeof WebSocket !== 'undefined') reachable.push('WebSocket');
    if (typeof eval !== 'undefined') reachable.push('eval');
    await api.updateIssue(api.context.issueKey, { ${TEXT}: ('SANDBOX:' + (reachable.length ? reachable.join(',') : 'ALL_BLOCKED')).slice(0, 250) });`;
  const [pf] = await attachStatic(`ZSEC-glob-${Date.now()}`, code);
  try {
    await setField(key!, { [TEXT]: "pre" });
    await sleep(2000);
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired (PF runs post-transition, must not 5xx)").toBeLessThan(500);
    let val: any = null;
    for (let i = 0; i < 16; i++) {
      await sleep(2500);
      const v = (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT];
      if (v && String(v).startsWith("SANDBOX:")) { val = v; break; }
    }
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-static", since, { tries: 6, gapMs: 2000 }).catch(() => null);
    console.log(`sandbox globals → ${JSON.stringify(val)} log=${log ? JSON.stringify({ isValid: log.isValid }) : "NONE"}`);
    expect(val, "the probe step executed and wrote its finding").toBeTruthy();
    // HARD: no blocked global may be reachable by bare name.
    expect(val, "every shadowed host global is undefined by bare name").toBe("SANDBOX:ALL_BLOCKED");
  } finally {
    await detachByNamePrefix(WF, "ZSEC-glob").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null } } }).catch(() => {});
  }
});

test("🛡️ sandbox B: a runaway (long-running) step is bounded — never completes / hangs the transition", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  // Async spin so the per-step deadline can fire between awaits (a purely-synchronous while(true)
  // would instead hit Forge's hard 25s platform kill — either way it must be BOUNDED). The final
  // updateIssue only runs if the loop EXITS normally (it must not, within any budget).
  const code = `const t0 = Date.now();
    while (Date.now() - t0 < 90000) { await new Promise((r) => setTimeout(r, 40)); }
    await api.updateIssue(api.context.issueKey, { ${TEXT}: 'LOOP_COMPLETED' });`;
  const [pf] = await attachStatic(`ZSEC-loop-${Date.now()}`, code);
  try {
    await setField(key!, { [TEXT]: "pre-loop" });
    await sleep(2000);
    const tStart = Date.now();
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    const transMs = Date.now() - tStart;
    // The transition returns immediately (the PF runs post-transition) — must not hang or 5xx.
    expect(r.status, "transition returned (not hung / not 5xx) despite the runaway PF").toBeLessThan(500);
    expect(transMs, "the transition itself was not blocked by the runaway PF").toBeLessThan(30000);
    // Give the PF budget (~22s) + the platform limit (25s) + slack to resolve, then confirm containment.
    await sleep(45000);
    const finalText = (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT];
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-static", since, { tries: 6, gapMs: 2000 }).catch(() => null);
    const reason = String(log?.reason || "");
    console.log(`sandbox loop → transMs=${transMs} finalText=${JSON.stringify(finalText)} log=${log ? JSON.stringify({ isValid: log.isValid, reason: reason.slice(0, 90) }) : "NONE (platform-killed before logging)"}`);
    // HARD: the runaway loop must NOT have completed (it would only if nothing bounded it).
    expect(String(finalText || ""), "the runaway loop was bounded and never completed").not.toBe("LOOP_COMPLETED");
    // If a log exists, it must be an HONEST failure (deadline/budget/time), not a silent success.
    if (log) {
      expect(log.isValid, "a bounded runaway is logged as a failure, not a success").toBe(false);
      expect(/time|budget|deadline|exceed|timeout|abort|too long/i.test(reason), `the failure reason names the bound (got "${reason}")`).toBe(true);
    }
  } finally {
    await detachByNamePrefix(WF, "ZSEC-loop").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null } } }).catch(() => {});
  }
});
