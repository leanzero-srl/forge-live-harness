// TESTER5 — F2: after an issue exists, an EXPLICIT project question must offer
// real clickable options, not 18 projects in prose. Does `needs_project` fire live?
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, del } from "../../data/jira.mjs";
import * as fs from "fs";

const T = getTarget("chatwise-global");
const OUT = process.env.T5_OUT || "/tmp/t5";
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9_]{1,9}-\d+)\b/g;
// PURE quota only: the honest-partial path ("...ALREADY MADE...") also quotes the quota sentence.
const QUOTA = { test: (t: string) => /token allowance/i.test(t) && !/ALREADY MADE/i.test(t) };
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
  return { response: String(data.result?.response || ""), answerOptions: data.result?.answerOptions || null };
}
const flat = (g: any) => (Array.isArray(g) ? g.flatMap((x: any) => (x?.options || []).map(String)) : []);
const qs = (g: any) => (Array.isArray(g) ? g.map((x: any) => String(x?.question || "")) : []);
const projOpts = (g: any) => flat(g).filter((o) => /^Use project [A-Z]/.test(o));
async function verifyKeys(text: string, into: string[]) {
  for (const m of text.matchAll(ISSUE_KEY_RE)) {
    const k = m[1];
    if (into.includes(k)) continue;
    const issue: any = await get(`/rest/api/3/issue/${k}?fields=summary,project`).catch(() => null);
    if (issue?.key) { into.push(k); console.log(`  VERIFIED ${k} in ${issue.fields.project?.key}: "${issue.fields.summary}"`); }
    else console.log(`  KEY IN REPLY DOES NOT EXIST IN JIRA: ${k}`);
  }
}

const ROUNDS = Number(process.env.T5_F2_ROUNDS || 4);

test("F2: 'now I want to raise another item, which project should it go in?' offers BUTTONS", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  console.log(`DEPLOYED BUILD IN THE DOM: ${(await frame.locator("#version-indicator").innerText()).trim()}`);
  const created: string[] = [];
  const rows: any[] = [];
  try {
    for (let i = 1; i <= ROUNDS; i++) {
      const conversationId = `conv_t5_f2_${Date.now()}_${i}`;
      const t1 = await ask(frame, page, conversationId, `create a work item in my name in the work for hire one, summary "[harness-test] t5 f2 r${i}"`);
      if (QUOTA.test(t1.response)) { console.log(`round ${i}: QUOTA on turn 1`); continue; }
      await verifyKeys(t1.response, created);
      // THE VERBATIM CASE.
      const t2 = await ask(frame, page, conversationId, "now I want to raise another item, which project should it go in?");
      if (QUOTA.test(t2.response)) { console.log(`round ${i}: QUOTA on turn 2`); continue; }
      await verifyKeys(t2.response, created);
      const po = projOpts(t2.answerOptions);
      console.log(`--- F2 round ${i}`);
      console.log(`  t1 reply: ${t1.response.slice(0, 160).replace(/\n/g, " ⏎ ")}`);
      console.log(`  t2 reply: ${t2.response.slice(0, 400).replace(/\n/g, " ⏎ ")}`);
      console.log(`  t2 question: ${JSON.stringify(qs(t2.answerOptions))}`);
      console.log(`  t2 project options: ${JSON.stringify(po)}`);
      console.log(`  t2 all options: ${JSON.stringify(flat(t2.answerOptions))}`);
      rows.push({ i, t1: t1.response, t2: t2.response, questions: qs(t2.answerOptions), projectOptions: po, allOptions: flat(t2.answerOptions) });
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t5_f2.json`, JSON.stringify(rows, null, 2));
  } finally {
    for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 120))}`);
  }
  expect(rows.length, "every F2 round was quota-blocked").toBeGreaterThan(0);
  const withButtons = rows.filter((r) => r.projectOptions.length > 0);
  console.log(`F2 HIT RATE: ${withButtons.length}/${rows.length}`);
  for (const r of rows) expect(r.projectOptions.length, `round ${r.i}: an explicit project question offered NO buttons. reply: ${r.t2.slice(0, 400)}`).toBeGreaterThan(0);
});

// CHEAPER VARIANT of the same predicate: a project is already in play (named by
// the user, so `established` is non-empty from history) and the user asks the
// question outright. One turn instead of two — the tenant's token quota is the
// reason this exists.
test("F2-lite: a project already in play + an explicit ask must still offer BUTTONS", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const rows: any[] = [];
  const N = Number(process.env.T5_F2LITE_ROUNDS || 5);
  for (let i = 1; i <= N; i++) {
    const conversationId = `conv_t5_f2l_${Date.now()}_${i}`;
    const r = await ask(frame, page, conversationId, "I raised WFH-2197 yesterday. Now I want to raise another item, which project should it go in?");
    if (QUOTA.test(r.response)) { console.log(`lite round ${i}: QUOTA`); continue; }
    const po = projOpts(r.answerOptions);
    console.log(`--- F2-lite round ${i}`);
    console.log(`  reply: ${r.response.slice(0, 300).replace(/\n/g, " ⏎ ")}`);
    console.log(`  question: ${JSON.stringify(qs(r.answerOptions))}`);
    console.log(`  project options: ${JSON.stringify(po)}`);
    rows.push({ i, reply: r.response, questions: qs(r.answerOptions), projectOptions: po });
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/t5_f2lite_${Date.now()}.json`, JSON.stringify(rows, null, 2));
  expect(rows.length, "every F2-lite round was quota-blocked").toBeGreaterThan(0);
  const hits = rows.filter((r) => r.projectOptions.length > 0);
  console.log(`F2-LITE HIT RATE: ${hits.length}/${rows.length}`);
  for (const r of rows) expect(r.projectOptions.length, `lite round ${r.i}: explicit ask, NO buttons. reply: ${r.reply.slice(0, 300)}`).toBeGreaterThan(0);
});
