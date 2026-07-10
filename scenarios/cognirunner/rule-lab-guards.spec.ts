// RULE-EXERCISE LAB — runtime GUARDS + a less-used effect. Two deep-backend tests:
//   (b) PF-BRAKE STRESS: fire a self-loop static PF ~15× on a DEDICATED throwaway issue and assert the
//       per-issue execution brake (PF_BRAKE_MAX_PER_BUCKET = 10 / 5-min) engages — ≤10 runs succeed and a
//       "postfunction-skipped" execution-brake log appears. This is CogniRunner's automation-loop guard.
//   (c) createIssueLink static PF: the PF links the fixture to another issue — assert the link + change.
// Deterministic (no AI). The brake test uses a throwaway (never the shared fixture) so it can't poison
// the fixture's brake bucket; the throwaway is tagged + left in place (never delete issues).
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix, statusRefByName } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { get, doTransition, request, searchJql } from "../../data/jira.mjs";
// @ts-ignore
import { waitForLog, execLogs } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const sleep = (ms: number) => new Promise((s) => setTimeout(s, ms));
test.describe.configure({ timeout: 300_000, retries: 0 });

async function fixtureKey() {
  const ex = await searchJql(`project = COGTEST AND summary ~ "HARNESS-BARRAGE-FIXTURE"`, ["summary"], 5);
  return ex.length ? ex[0].key : null;
}

test("🛑 PF-brake: >10 post-function executions on one issue in 5 min trips the execution brake", async () => {
  // dedicated throwaway, self-looped on WHATEVER status it lands in (no need to move it to the hub).
  const proj = await get(`/rest/api/3/project/COGTEST`);
  const type = (proj.issueTypes || []).find((t: any) => !t.subtask);
  const created = await request("POST", "/rest/api/3/issue", { raw: true, body: { fields: {
    project: { key: "COGTEST" }, issuetype: { id: type.id }, summary: "[rule-lab-brake] it35 brake stress " + crypto.randomUUID().slice(0, 6) } } });
  expect(created.status, "throwaway created").toBeLessThan(400);
  const bkKey = JSON.parse(created.text).key;
  const stName = (await get(`/rest/api/3/issue/${bkKey}?fields=status`)).fields.status.name;
  const ref = await statusRefByName(WF, stName);
  expect(ref, `resolved a status ref for "${stName}"`).toBeTruthy();
  // setProperty is screen-independent (no field-on-screen dependency) — each run logs a postfunction-static.
  const [pf] = await attachSelfLoopRules(WF, ref!, [{
    name: `ZBRAKE-${Date.now()}`, type: "static",
    config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF }, functions: [{ id: crypto.randomUUID(), name: "tick", code: `await api.setProperty('brake-tick', { t: 1 });` }] },
  }]);
  try {
    const since = Date.now();
    for (let i = 0; i < 15; i++) {
      const r = await doTransition(bkKey, pf.transitionId);
      expect(r.status, `fire ${i} transitions cleanly (brake never blocks the TRANSITION, only the PF)`).toBeLessThan(400);
      await sleep(2000);
    }
    await sleep(5000); // let the last executions settle into the log
    const mine = (await execLogs()).filter((l: any) => l.issueKey === bkKey && Date.parse(l.timestamp) >= since - 1500);
    const ran = mine.filter((l: any) => l.type === "postfunction-static");
    const braked = mine.filter((l: any) => l.type === "postfunction-skipped" && /brake/i.test(l.reason || ""));
    console.log(`brake: ${ran.length} PF runs logged, ${braked.length} execution-brake skip log(s). Sample brake reason: ${braked[0]?.reason?.slice(0, 90) || "—"}`);
    expect(braked.length, "the execution brake engaged (postfunction-skipped brake log)").toBeGreaterThanOrEqual(1);
    expect(ran.length, "the brake capped successful PF executions at ≤10 in the window").toBeLessThanOrEqual(10);
    expect(ran.length, "at least most of the pre-brake executions ran").toBeGreaterThanOrEqual(7);
  } finally {
    await detachByNamePrefix(WF, "ZBRAKE").catch(() => {});
    await request("DELETE", `/rest/api/3/issue/${bkKey}/properties/brake-tick`, { raw: true }).catch(() => {});
  }
});

test("🔗 createIssueLink static PF: links the fixture to another issue + records the change", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  const target = "COGTEST-2557"; // a Done issue (scouted it33/it34)
  const [pf] = await attachSelfLoopRules(WF, HUB, [{
    name: `ZLINK-${Date.now()}`, type: "static",
    config: { type: "postfunction-static", id: crypto.randomUUID(), workflow: { workflowName: WF }, functions: [{ id: crypto.randomUUID(), name: "link", code: `await api.createIssueLink('${target}', 'Relates');` }] },
  }]);
  let linkId: string | null = null;
  try {
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    let link: any = null;
    for (let i = 0; i < 16; i++) {
      await sleep(2500);
      const links = (await get(`/rest/api/3/issue/${key}?fields=issuelinks`)).fields.issuelinks || [];
      link = links.find((l: any) => (l.outwardIssue?.key === target || l.inwardIssue?.key === target));
      if (link) break;
    }
    linkId = link?.id || null;
    console.log(`createIssueLink → ${link ? `linked to ${target} (${link.type?.name})` : "NO LINK"}`);
    expect(link, "the PF created an issue link to the target").toBeTruthy();
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-static", since, { tries: 6, gapMs: 2000 }).catch(() => null);
    expect(log?.isValid, "PF log success").toBe(true);
    expect(log?.changes, "the link is recorded as a change").toBeGreaterThanOrEqual(1);
  } finally {
    await detachByNamePrefix(WF, "ZLINK").catch(() => {});
    if (linkId) await request("DELETE", `/rest/api/3/issueLink/${linkId}`, { raw: true }).catch(() => {});
  }
});
