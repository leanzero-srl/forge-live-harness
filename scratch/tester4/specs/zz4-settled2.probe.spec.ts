// TESTER PROBE: CHECK 4, round 2 — plus a count of the "created AND still asking
// which project" contradiction on the creating turn itself.
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

test("CHECK 4 (round 2): approve and an unrelated turn do not re-offer projects", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const conversationId = `conv_t4_settled2_${Date.now()}`;
  const created: string[] = [];
  const log: any[] = [];
  try {
    for (const msg of [
      'create a work item in my name in the work for hire one, summary "[harness-test] t4 settled 2"',
      "approve",
      "thanks — what makes a good definition of done?",
    ]) {
      const { response, answerOptions } = await ask(frame, page, conversationId, msg);
      if (QUOTA.test(response)) test.skip(true, "site quota-blocked");
      for (const m of response.matchAll(ISSUE_KEY_RE)) {
        const k = m[1];
        if (created.includes(k)) continue;
        const issue: any = await get(`/rest/api/3/issue/${k}?fields=summary,project`).catch(() => null);
        if (issue?.key) { created.push(k); console.log(`  VERIFIED ${k} in ${issue.fields.project?.key}: "${issue.fields.summary}"`); }
      }
      const po = projOpts(answerOptions);
      log.push({ msg, response, projectOptions: po, questions: qs(answerOptions) });
      console.log(`--- "${msg}"\n  reply: ${response.slice(0, 260).replace(/\n/g, " ⏎ ")}\n  projectOptions: ${JSON.stringify(po)}\n  questions: ${JSON.stringify(qs(answerOptions))}`);
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/t4_settled2.json`, JSON.stringify({ conversationId, created, log }, null, 2));
  } finally {
    for (const k of created) console.log(`  cleanup ${k}: ${await del(`/rest/api/3/issue/${k}?deleteSubtasks=true`).then(() => "deleted").catch((e: any) => String(e).slice(0, 90))}`);
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  expect(log[1].projectOptions, "'approve' re-rendered project buttons").toEqual([]);
  expect(log[2].projectOptions, "an unrelated turn re-rendered project buttons").toEqual([]);
  // The creating turn itself: did it BOTH create and ask which project?
  const contradiction = created.length > 0 && log[0].projectOptions.length > 0;
  console.log(`CONTRADICTION on the creating turn (created AND asked which project): ${contradiction}`);
  fs.appendFileSync(`${OUT}/contradiction.log`, `settled2 ${contradiction} ${JSON.stringify(log[0].projectOptions)}\n`);
});
