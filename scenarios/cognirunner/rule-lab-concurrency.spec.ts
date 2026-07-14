// RULE-EXERCISE LAB — CONCURRENCY / contention on the SAME issue (live, on COGTEST).
// Fires several transitions on the same issue's self-loop in PARALLEL. The app's per-issue brake,
// duplicate-delivery dedup, and race-free log store all do KVS reads/writes that could corrupt or
// throw under contention. Bar: no transition 5xx-crashes, the flow is bounded, and the concurrent
// load produces well-formed execution logs (at least one clean PF run) — never a corrupted log or a
// platform exception. LOWER CONFIDENCE by design: Jira may serialize same-issue transitions (some
// return 409), which weakens true contention — a clean, non-crashing result is the pass bar.
// Kept to 6 fires (< the 10/issue/5min brake) so the brake doesn't mask the concurrency signal.
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { doTransition, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { waitForLog } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));
test.describe.configure({ timeout: 180_000, retries: 0 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}

test("🔀 concurrent same-issue transitions: brake/dedup/log store hold under contention (no crash/corruption)", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  // A light PF: api.log only (no Jira write) so the concurrency stresses the app's OWN KVS paths
  // (brake counter, dedup claim, race-free log store) rather than Jira's optimistic-locking.
  const code = `api.log('concurrency probe ' + api.context.issueKey);`;
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZCON-${Date.now()}`, type: "static",
    config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF }, functions: [{ id: crypto.randomUUID(), name: "step", code }] },
  }]);
  try {
    const since = Date.now();
    const t0 = Date.now();
    // Fire 6 transitions on the SAME issue concurrently.
    const results = await Promise.all(
      Array.from({ length: 6 }, () => doTransition(key!, pf.transitionId).catch((e: any) => ({ status: e?.status || 599, error: String(e?.message || e) }))),
    );
    const elapsed = Date.now() - t0;
    const statuses = results.map((r: any) => r.status);
    const dist: Record<string, number> = {};
    for (const s of statuses) dist[s] = (dist[s] || 0) + 1;
    const max = Math.max(...statuses);
    // give the concurrent PFs time to run + write their logs
    await sleep(8000);
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-static", since, { tries: 8, gapMs: 2000 }).catch(() => null);
    console.log(`concurrency → statuses=${JSON.stringify(dist)} elapsedMs=${elapsed} log=${log ? JSON.stringify({ isValid: log.isValid, reason: String(log.reason || "").slice(0, 60) }) : "NONE"}`);
    // HARD: no transition caused a server crash (5xx), and the whole batch was bounded.
    expect(max, "no concurrent same-issue transition 5xx-crashed").toBeLessThan(500);
    expect(elapsed, "the concurrent batch was bounded (no hang/deadlock)").toBeLessThan(60000);
    // The concurrent load produced a well-formed log (not a corrupted / thrown record).
    expect(log, "concurrent load still wrote a well-formed execution log").toBeTruthy();
    expect(typeof log.isValid, "the log is well-formed (isValid is a boolean, not corrupted)").toBe("boolean");
  } finally {
    await detachByNamePrefix(WF, "ZCON").catch(() => {});
  }
});
