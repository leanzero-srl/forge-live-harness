// TESTER PROBE (confirmation pass, v6.90.0): checks 3 and 4.
//
// 3 — "RECOMMENDED" has a basis: after an issue has been created in project X
//     in THIS conversation, a later project question must put X first and say
//     why, and must state how many projects are hidden.
// 4 — Options do NOT appear once the project is settled: create, "approve",
//     then an unrelated message — none of those turns may re-render the four
//     project buttons.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, del } from "../../data/jira.mjs";
import * as fs from "fs";

const T = getTarget("chatwise-global");
const OUT = process.env.T4_OUT || "/tmp/t4";
const QUOTA = /token allowance|Nothing was lost/i;
const ISSUE_KEY_RE = /\b([A-Z][A-Z0-9_]{1,9}-\d+)\b/g;
const PROJ = process.env.T4_PROJECT || "COGTEST";

test.describe.configure({ timeout: 3_600_000 });

function rec(name: string, payload: unknown) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(payload, null, 2));
}
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

test("CHECK 3+4: the recommendation has a basis, and settled turns stop offering buttons", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const conversationId = `conv_t4_rec_${Date.now()}`;
  const created: string[] = [];
  const log: any[] = [];
  try {
    const turns = [
      `create a work item in project ${PROJ} in my name, summary "[harness-test] t4 recency probe"`,
      "approve",
      "thanks. now I want to raise another item, which project should it go in?",
      "remind me what makes a good acceptance criterion",
    ];
    for (const [i, msg] of turns.entries()) {
      const { response, answerOptions } = await ask(frame, page, conversationId, msg);
      if (QUOTA.test(response)) test.skip(true, "site quota-blocked");
      for (const m of response.matchAll(ISSUE_KEY_RE)) {
        const k = m[1];
        if (created.includes(k)) continue;
        const issue: any = await get(`/rest/api/3/issue/${k}?fields=summary,project,assignee,issuetype`).catch(() => null);
        if (issue?.key) {
          created.push(k);
          console.log(`  VERIFIED ${k}: summary="${issue.fields.summary}" project=${issue.fields.project?.key} type=${issue.fields.issuetype?.name} assignee=${issue.fields.assignee?.displayName || "none"}`);
        }
      }
      log.push({ turn: i + 1, msg, response, options: flat(answerOptions), questions: qs(answerOptions), projectOptions: projOpts(answerOptions) });
      console.log(`--- turn ${i + 1}: "${msg}"`);
      console.log(`  reply: ${response.slice(0, 350).replace(/\n/g, " ⏎ ")}`);
      console.log(`  projectOptions: ${JSON.stringify(projOpts(answerOptions))}`);
      console.log(`  questions: ${JSON.stringify(qs(answerOptions))}`);
      console.log(`  allOptions: ${JSON.stringify(flat(answerOptions))}`);
    }
    rec("t4_rec", { conversationId, created, log });
  } finally {
    for (const k of created) await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).catch(() => {});
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  // CHECK 4 — the approve turn and the unrelated turn must not re-offer projects.
  expect(log[1].projectOptions, "turn 2 ('approve') re-rendered project buttons").toEqual([]);
  expect(log[3].projectOptions, "turn 4 (unrelated) re-rendered project buttons").toEqual([]);
  // CHECK 3 — when turn 3 DOES offer projects, the established one leads and the count is stated.
  const t3 = log[2];
  if (t3.projectOptions.length) {
    expect(t3.projectOptions[0], `options[0] is not the established project: ${JSON.stringify(t3.projectOptions)}`).toContain(`Use project ${PROJ}`);
    expect(t3.questions.join(" "), "the question does not name the basis for the recommendation").toContain(`${PROJ} is the project this conversation has been working in`);
    expect(t3.questions.join(" "), "the question does not state how many are hidden").toMatch(/Showing \d+ of \d+/);
  } else {
    throw new Error(`turn 3 asked which project and carried NO options at all — reply: ${t3.response.slice(0, 400)}`);
  }
});
