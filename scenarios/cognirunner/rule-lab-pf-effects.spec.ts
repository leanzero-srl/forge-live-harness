// RULE-EXERCISE LAB — static-PF EFFECTS breadth (escalation tier). Three deep-backend tests on COGTEST:
//   (a) CROSS-FIELD: the PF READS two custom fields (text + number), computes, writes a derived value.
//   (d) LESS-USED api.* methods: addWorklog + setProperty — assert the real side effects + change entries.
//   (b) TRANSITIONING PF: a PF (firing on the fixture) drives ANOTHER issue's workflow via transitionByName
//       — assert the target issue's status actually changed (no self-loop, so no brake/loop risk).
// Deterministic (no AI, no BYOK cost).
import { test, expect } from "@playwright/test";
import crypto from "node:crypto";
// @ts-ignore
import { attachSelfLoopRules, detachByNamePrefix } from "../../data/cogni-workflow.mjs";
// @ts-ignore
import { get, doTransition, request, searchJql, getTransitions } from "../../data/jira.mjs";
// @ts-ignore
import { setField, waitForLog } from "../../data/cogni-rule-lab.mjs";

const WF = "Software Simplified Workflow for Project COGTEST";
const HUB = "10003";
const TEXT = "customfield_10280";
const NUM = "customfield_10282";
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

test("🧮 cross-field static PF: reads TEXT + NUMBER, computes, writes a derived value", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  const code = `const iss = await api.getIssue(api.context.issueKey);
    const t = String(iss.fields.${TEXT} || '');
    const n = Number(iss.fields.${NUM}) || 0;
    await api.updateIssue(api.context.issueKey, { ${TEXT}: t.toUpperCase() + '-x' + n + '=' + (n * 2) });`;
  const [pf] = await attachStatic(`ZEFF-xf-${Date.now()}`, code);
  try {
    await setField(key!, { [TEXT]: "hello", [NUM]: 7 });
    await new Promise((s) => setTimeout(s, 2500));
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    let val: any = null;
    for (let i = 0; i < 16; i++) {
      await new Promise((s) => setTimeout(s, 2500));
      const v = (await get(`/rest/api/3/issue/${key}?fields=${TEXT}`)).fields[TEXT];
      if (v && String(v).startsWith("HELLO-")) { val = v; break; }
    }
    console.log(`cross-field → ${JSON.stringify(val)}`);
    // "HELLO-x7=14" proves it read TEXT (hello) AND NUMBER (7) and computed 7*2=14 in one PF.
    expect(val, "computed from BOTH fields").toBe("HELLO-x7=14");
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-static", since, { tries: 6, gapMs: 2000 }).catch(() => null);
    expect(log?.isValid, "PF log success").toBe(true);
  } finally {
    await detachByNamePrefix(WF, "ZEFF-xf").catch(() => {});
    await request("PUT", `/rest/api/3/issue/${key}`, { raw: true, body: { fields: { [TEXT]: null, [NUM]: null } } }).catch(() => {});
  }
});

test("🧰 less-used api.* methods: addWorklog + setProperty apply + are recorded as changes", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  const propKey = "rulelab-prop-" + crypto.randomUUID().slice(0, 6);
  const marker = "rule-lab worklog " + crypto.randomUUID().slice(0, 6);
  const code = `await api.addWorklog(3600, '${marker}');
    await api.setProperty('${propKey}', { touched: true, n: 42 });`;
  const [pf] = await attachStatic(`ZEFF-api-${Date.now()}`, code);
  let worklogId: string | null = null;
  try {
    const since = Date.now();
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "transition fired").toBeLessThan(400);
    // property is the terminal effect — poll for it.
    let prop: any = null;
    for (let i = 0; i < 16; i++) {
      await new Promise((s) => setTimeout(s, 2500));
      const pr = await request("GET", `/rest/api/3/issue/${key}/properties/${propKey}`, { raw: true });
      if (pr.status < 400) { prop = JSON.parse(pr.text).value; break; }
    }
    console.log(`api-methods → property=${JSON.stringify(prop)}`);
    expect(prop?.n, "setProperty wrote the property").toBe(42);
    // worklog effect
    const wl = (await get(`/rest/api/3/issue/${key}/worklog`)).worklogs || [];
    const mine = wl.find((w: any) => JSON.stringify(w.comment || "").includes(marker));
    worklogId = mine?.id || null;
    expect(mine, "addWorklog created a worklog with our marker").toBeTruthy();
    expect(Number(mine.timeSpentSeconds), "worklog is 1h").toBe(3600);
    // log records both changes
    const log: any = await waitForLog((l: any) => l.issueKey === key && l.type === "postfunction-static", since, { tries: 6, gapMs: 2000 }).catch(() => null);
    console.log(`api-methods log: ${log ? JSON.stringify({ isValid: log.isValid, changes: log.changes }) : "NONE"}`);
    expect(log?.isValid, "PF log success").toBe(true);
    expect(log?.changes, "both writes recorded as changes").toBeGreaterThanOrEqual(2);
  } finally {
    await detachByNamePrefix(WF, "ZEFF-api").catch(() => {});
    if (worklogId) await request("DELETE", `/rest/api/3/issue/${key}/worklog/${worklogId}`, { raw: true }).catch(() => {});
    await request("DELETE", `/rest/api/3/issue/${key}/properties/${propKey}`, { raw: true }).catch(() => {});
  }
});

test("🔀 transitioning PF: drives ANOTHER issue's workflow via transitionByName", async () => {
  const key = await fixtureKey();
  test.skip(!key, "fixture missing");
  // Dedicated throwaway target (tagged; left in place — never delete issues).
  const proj = await get(`/rest/api/3/project/COGTEST`);
  const type = (proj.issueTypes || []).find((t: any) => !t.subtask);
  const created = await request("POST", "/rest/api/3/issue", { raw: true, body: { fields: {
    project: { key: "COGTEST" }, issuetype: { id: type.id }, summary: "[rule-lab-throwaway] it34 transition target " + crypto.randomUUID().slice(0, 6) } } });
  expect(created.status, "throwaway created").toBeLessThan(400);
  const twKey = JSON.parse(created.text).key;
  const before = (await get(`/rest/api/3/issue/${twKey}?fields=status`)).fields.status.name;
  const trs = (await getTransitions(twKey)).transitions || [];
  const target = trs.find((t: any) => t.to?.name && t.to.name !== before) || trs[0];
  console.log(`throwaway ${twKey}: status="${before}" → transition "${target.name}" → "${target.to?.name}"`);
  const code = `await api.transitionByName('${twKey}', ${JSON.stringify(target.name)});`;
  const [pf] = await attachStatic(`ZEFF-tr-${Date.now()}`, code);
  try {
    const r = await doTransition(key!, pf.transitionId);
    expect(r.status, "PF transition (on the fixture) fired").toBeLessThan(400);
    let after: string | null = null;
    for (let i = 0; i < 16; i++) {
      await new Promise((s) => setTimeout(s, 2500));
      const st = (await get(`/rest/api/3/issue/${twKey}?fields=status`)).fields.status.name;
      if (st !== before) { after = st; break; }
    }
    console.log(`throwaway status after PF: "${after}" (was "${before}")`);
    expect(after, "the PF drove the throwaway's workflow to the transition's target status").toBe(target.to?.name);
  } finally {
    await detachByNamePrefix(WF, "ZEFF-tr").catch(() => {});
  }
});
