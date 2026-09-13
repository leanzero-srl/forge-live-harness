// TESTER PROBE — v6.98.0 ITEM 6: the consent restatement table, live.
// Spot-checks the TWO phrasings that were REFUSED live against v6.95.0:
//   "Yes, move <KEY> into CGL1 please."   (key + destination)
//   "Yes, move it into CGL1 please."      (destination only)
// Plus the P0 nobody may skip: a user who says yes must NOT be asked again.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { get, post, del } from "../../data/jira.mjs";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";

const T = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const DEST = "CGL1";
test.describe.configure({ timeout: 1_800_000 });

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId, message, personaId: "jira-scrubber", personaLocked: true,
  });
  expect(sent?.success, `enqueue failed: ${JSON.stringify(sent?.error)}`).toBeTruthy();
  let data: any = null;
  const deadline = Date.now() + 420_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  return { status: data?.status, text: String(data?.result?.response || data?.error || "") };
}

const QUOTA = /token allowance|Nothing was lost/i;

for (const [label, phrase] of [
  ["key + destination", `Yes, move {KEY} into ${DEST} please.`],
  ["destination only", `Yes, move it into ${DEST} please.`],
] as [string, string][]) {
  test(`PROBE consent restatement — ${label}`, async ({ page }) => {
    const conversationId = `conv_harness_restate_${Date.now()}`;
    let frame: any = null;
    let victim: string | null = null;
    try {
      const meta: any = await get(`/rest/api/3/issue/createmeta/${PROJECT}/issuetypes?maxResults=200`);
      const stdType = (meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0);
      const made: any = await post("/rest/api/3/issue", {
        fields: { project: { key: PROJECT }, issuetype: { id: String(stdType.id) },
          summary: `[harness-test] restatement ${label} ${Date.now()}`, labels: ["harness-test"] },
      });
      victim = String(made.key);
      console.log(`victim=${victim}`);

      frame = await openGlobalPage(page, T);
      await waitForChatApp(page, frame, GLOBAL_APP);
      await callResolver(frame, GLOBAL_APP, "createConversation", {
        conversationId, title: `[harness-test] restatement ${label}`, personaId: "jira-scrubber" });

      const t1 = await ask(frame, page, conversationId,
        `Move issue ${victim} to project ${DEST}. Show me the plan first.`);
      console.log(`--- TURN 1 (${t1.status}) ---\n${t1.text}\n`);
      test.skip(QUOTA.test(t1.text), "tenant quota exhausted — not a product failure");

      const say = phrase.replace("{KEY}", victim);
      const t2 = await ask(frame, page, conversationId, say);
      console.log(`--- TURN 2 "${say}" (${t2.status}) ---\n${t2.text}\n`);
      test.skip(QUOTA.test(t2.text), "tenant quota exhausted — not a product failure");

      const after: any = await get(`/rest/api/3/issue/${victim}?fields=project,summary`).catch(() => null);
      const nowIn = after?.fields?.project?.key ?? "(gone)";
      console.log(`AFTER TURN 2: ${victim} lives in ${nowIn}`);

      // P0: was the user asked AGAIN after saying yes?
      const askedAgain = /reply with the single word YES|did not read as a clear yes|could not check your answer|say YES|confirm/i.test(t2.text)
        && nowIn === PROJECT;
      console.log(`ASKED AGAIN AFTER A YES: ${askedAgain}`);
      expect(askedAgain, `THE USER SAID YES AND WAS ASKED AGAIN. Reply: ${t2.text.slice(0, 400)}`).toBe(false);
      expect(nowIn, `the restated approval was NOT honoured — issue still in ${nowIn}. Reply: ${t2.text.slice(0, 400)}`).toBe(DEST);
    } finally {
      if (victim) await del(`/rest/api/3/issue/${victim}?deleteSubtasks=true`).catch(() => {});
      if (frame) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  });
}
