// TESTER5 — v6.92.0 verification of the P0: one request must not create two issues.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, del, put } from "../../data/jira.mjs";
import * as fs from "fs";

const T = getTarget("chatwise-global");
const OUT = process.env.T5_OUT || "/tmp/t5";
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9_]{1,9}-\d+)\b/g;
const QUOTA = /token allowance|Nothing was lost/i;
test.describe.configure({ timeout: 3_600_000 });

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId, message, personaId: "product-owner", personaLocked: true,
  });
  expect(sent?.success, `enqueue failed: ${sent?.error}`).toBeTruthy();
  let data: any = null;
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  expect(data?.status, `job did not complete: ${data?.error}`).toBe("completed");
  return { response: String(data.result?.response || ""), answerOptions: data.result?.answerOptions || null, raw: data.result };
}
const flat = (g: any) => (Array.isArray(g) ? g.flatMap((x: any) => (x?.options || []).map(String)) : []);
const projOpts = (g: any) => flat(g).filter((o) => /^Use project [A-Z]/.test(o));
const qs = (g: any) => (Array.isArray(g) ? g.map((x: any) => String(x?.question || "")) : []);
async function verifyKeys(text: string, into: string[]) {
  for (const m of text.matchAll(ISSUE_KEY_RE)) {
    const k = m[1];
    if (into.includes(k)) continue;
    const issue: any = await get(`/rest/api/3/issue/${k}?fields=summary,project`).catch(() => null);
    if (issue?.key) { into.push(k); console.log(`  VERIFIED ${k} in ${issue.fields.project?.key}: "${issue.fields.summary}"`); }
    else console.log(`  KEY IN REPLY DOES NOT EXIST IN JIRA: ${k}`);
  }
}

test("P0-A: a create-turn renders NO project options, and produces exactly ONE issue", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const build = (await frame.locator("#version-indicator").innerText()).trim();
  console.log(`DEPLOYED BUILD IN THE DOM: ${build}`);
  expect(build).toBe("v6.92.0");
  const rounds: any[] = [];
  const created: string[] = [];
  const marker = `t5p0-${Date.now()}`;
  try {
    for (let i = 1; i <= 3; i++) {
      const conversationId = `conv_t5_p0_${Date.now()}_${i}`;
      const t1 = await ask(frame, page, conversationId, `create a work item in my name in the work for hire one, summary "[harness-test] ${marker} r${i}"`);
      console.log(`--- round ${i} RAW REPLY: ${t1.response.replace(/\n/g, " ⏎ ")}`);
      if (QUOTA.test(t1.response)) { console.log(`round ${i}: QUOTA — skipped`); continue; }
      const before = created.length;
      await verifyKeys(t1.response, created);
      const po = projOpts(t1.answerOptions);
      console.log(`--- round ${i}`);
      console.log(`  reply: ${t1.response.slice(0, 260).replace(/\n/g, " ⏎ ")}`);
      console.log(`  ALL options: ${JSON.stringify(flat(t1.answerOptions))}`);
      console.log(`  project options: ${JSON.stringify(po)}`);
      console.log(`  question: ${JSON.stringify(qs(t1.answerOptions))}`);
      rounds.push({ i, conversationId, reply: t1.response, options: flat(t1.answerOptions), questions: qs(t1.answerOptions), projectOptions: po, createdThisRound: created.slice(before) });
      // Truth over JQL: what actually exists carrying this marker?
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    const jql = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent(`summary ~ "${marker}" ORDER BY created ASC`)}&fields=summary,project&maxResults=50`).catch((e:any)=>({error:String(e)}));
    console.log(`JQL for marker ${marker}: ${JSON.stringify((jql as any).issues?.map((x:any)=>`${x.key} (${x.fields.project.key}) ${x.fields.summary}`) ?? jql)}`);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t5_p0a.json`, JSON.stringify({ build, marker, rounds, created, jql }, null, 2));
    const creating = rounds.filter((r) => r.createdThisRound.length > 0);
    console.log(`ROUNDS THAT CREATED: ${creating.length}/${rounds.length}`);
    for (const r of rounds) {
      expect(r.createdThisRound.length, `round ${r.i} created ${r.createdThisRound.length} issues: ${r.createdThisRound.join(",")}`).toBeLessThanOrEqual(1);
      if (r.createdThisRound.length) expect(r.projectOptions, `round ${r.i} STILL rendered project buttons under a create: ${JSON.stringify(r.projectOptions)}`).toEqual([]);
      else console.log(`NOTE round ${r.i} created nothing; options were ${JSON.stringify(r.projectOptions)}`);
    }
    expect(creating.length, "no round created anything, so the P0 was not exercised").toBeGreaterThan(0);
    expect(rounds.length, "every round was quota-blocked").toBeGreaterThan(0);
  } finally {
    for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 120))}`);
  }
});

test("P0-B: a NON-CREATE write (comment/transition) also drops the stale project options", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  // A seeded issue we own, in WFH (deletable).
  const seeded: any = await get(`/rest/api/3/search/jql?jql=${encodeURIComponent('project = WFH AND statusCategory != Done ORDER BY created DESC')}&fields=summary,status&maxResults=1`);
  const target = seeded.issues?.[0];
  expect(target, "no WFH issue to comment on").toBeTruthy();
  console.log(`target issue: ${target.key} "${target.fields.summary}" status=${target.fields.status.name}`);
  const rows: any[] = [];
  const cases = [
    { name: "comment", msg: `add a comment on ${target.key} saying "[harness-test] t5 non-create write probe"` },
    { name: "label", msg: `add the label harness-test-t5 to ${target.key}` },
  ];
  for (const c of cases) {
    const conversationId = `conv_t5_nc_${Date.now()}_${c.name}`;
    const r = await ask(frame, page, conversationId, c.msg);
    console.log(`--- ${c.name} RAW REPLY: ${r.response.replace(/\n/g, " ⏎ ")}`);
    console.log(`  project options: ${JSON.stringify(projOpts(r.answerOptions))} | questions: ${JSON.stringify(qs(r.answerOptions))}`);
    if (/token allowance/.test(r.response) && !/ALREADY MADE|already made/i.test(r.response)) { console.log(`${c.name}: PURE QUOTA — skipped`); continue; }
    const po = projOpts(r.answerOptions);
    console.log(`--- ${c.name}\n  reply: ${r.response.slice(0, 300).replace(/\n/g, " ⏎ ")}\n  project options: ${JSON.stringify(po)}\n  all options: ${JSON.stringify(flat(r.answerOptions))}`);
    rows.push({ ...c, reply: r.response, projectOptions: po, options: flat(r.answerOptions) });
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/t5_p0b.json`, JSON.stringify({ target: target.key, rows }, null, 2));
  // restore
  await get(`/rest/api/3/issue/${target.key}?fields=labels,comment`).then(async (i: any) => {
    const labels = (i.fields.labels || []).filter((l: string) => l !== "harness-test-t5");
    if (labels.length !== (i.fields.labels || []).length) {
      await put(`/rest/api/3/issue/${target.key}`, { fields: { labels } }).catch((e: any) => console.log(`label restore failed: ${e}`));
      console.log(`restored labels on ${target.key} to ${JSON.stringify(labels)}`);
    }
    for (const cm of i.fields.comment?.comments || []) {
      if (JSON.stringify(cm.body).includes("t5 non-create write probe")) {
        await del(`/rest/api/3/issue/${target.key}/comment/${cm.id}`).then(() => console.log(`deleted comment ${cm.id}`)).catch((e: any) => console.log(`comment delete failed: ${e}`));
      }
    }
  }).catch((e: any) => console.log(`restore read failed: ${e}`));
  expect(rows.length, "both non-create rounds were quota-blocked").toBeGreaterThan(0);
  for (const r of rows) expect(r.projectOptions, `${r.name} rendered stale project buttons: ${JSON.stringify(r.projectOptions)}`).toEqual([]);
});
