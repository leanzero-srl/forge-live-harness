// TESTER PROBE (confirmation pass, v6.90.0): CHECK 3, the honest way.
//
// The recommendation's basis can only be seen when the wizard has NO project of
// its own (the user never named a key) while the conversation HAS worked in one
// (an issue was created by a handed-over turn). That is exactly the state the
// brief describes. So: let the agent choose the project from the user's words,
// verify the issue in Jira, then provoke the project question again and read
// options[0] and the question text.
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

test("CHECK 3: the project this conversation worked in leads, with the reason and the count", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const conversationId = `conv_t4_basis_${Date.now()}`;
  const created: string[] = [];
  const log: any[] = [];
  let hit: any = null;
  try {
    const turns = [
      'create a work item in my name, you choose the space, the summary should be "[harness-test] t4 basis probe"',
      "put it in the work for hire one please",
      "great. now let's shape an epic for supplier onboarding — but first ask me which project it should be created in",
      "which project should the epic be created in?",
      "I still haven't told you the project — ask me again with the options",
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
      const po = projOpts(answerOptions);
      log.push({ turn: i + 1, msg, response, options: flat(answerOptions), questions: qs(answerOptions), projectOptions: po });
      console.log(`--- turn ${i + 1}: "${msg}"`);
      console.log(`  reply: ${response.slice(0, 300).replace(/\n/g, " ⏎ ")}`);
      console.log(`  projectOptions: ${JSON.stringify(po)}`);
      console.log(`  questions: ${JSON.stringify(qs(answerOptions))}`);
      if (po.length && i >= 2) { hit = log[log.length - 1]; break; }
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t4_basis.json`, JSON.stringify({ conversationId, created, log }, null, 2));
  } finally {
    for (const k of created) {
      const r: any = await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 120));
      console.log(`  cleanup ${k}: ${r}`);
    }
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  expect(created.length, "no issue was ever created, so 'the project this conversation worked in' has no basis to test").toBeGreaterThan(0);
  const proj = created[0].split("-")[0];
  expect(hit, `no later turn offered project options at all (so the recommendation basis is unreachable in this state); project worked in = ${proj}`).toBeTruthy();
  expect(hit.projectOptions[0]).toContain(`Use project ${proj}`);
  expect(hit.questions.join(" ")).toContain(`${proj} is the project this conversation has been working in`);
  expect(hit.questions.join(" ")).toMatch(/Showing \d+ of \d+/);
});
