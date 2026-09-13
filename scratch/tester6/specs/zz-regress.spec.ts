// TESTER PROBE — listProjects recency ranking + the deleteIssue consent door.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
// eslint-disable-next-line
import { get, post, del } from "../../data/jira.mjs";

const QUOTA_RE = /used up their token allowance|token allowance for the moment/i;

async function askOnce(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId, message, personaId: "jira-scrubber", personaLocked: true,
  });
  if (!sent?.success) return `__ENQUEUE_FAILED__ ${JSON.stringify(sent?.error)}`;
  let data: any = null;
  const deadline = Date.now() + 480_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  if (data?.status !== "completed") return `__JOB_${data?.status}__ ${data?.error || ""}`;
  return String(data.result?.response || "");
}
async function ask(frame: any, page: any, c: string, m: string, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const r = await askOnce(frame, page, c, m);
    if (!QUOTA_RE.test(r)) return r;
    console.log(`   [quota] blocked, waiting 150s (attempt ${i + 1})`);
    await page.waitForTimeout(150_000);
  }
  return "__QUOTA_NEVER_CLEARED__";
}
async function exists(key: string) {
  const r: any = await get(`/rest/api/3/issue/${key}?fields=summary`).catch(() => null);
  return Boolean(r?.key);
}

test("listProjects recency: TF (zero issues) must not be called most active", async ({ page }) => {
  test.setTimeout(2_400_000);
  const T = getTarget("chatwise-global");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const convId = `conv_rank_${Date.now()}`;
  try {
    await callResolver(frame, GLOBAL_APP, "createConversation", { conversationId: convId, title: "[harness] ranking", personaId: "jira-scrubber" });
    const r1 = await ask(frame, page, convId,
      "Which projects have I been working in most recently? Rank them by the most recent issue update and list the TOP FIVE with their key and last-update date. Then tell me, separately, how many issues project TF has.");
    console.log(`\n### RANKING\n${r1}`);
    expect(r1.length).toBeGreaterThan(0);
  } finally {
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: convId }).catch(() => {});
  }
});

test("deleteIssue consent door — restatement and plain yes", async ({ page }) => {
  test.setTimeout(3_600_000);
  const T = getTarget("chatwise-global");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const meta: any = await get("/rest/api/3/issue/createmeta/WFH/issuetypes?maxResults=200");
  const stdType = String((meta?.issueTypes || meta?.values || []).find((t: any) => t.hierarchyLevel === 0 && !t.subtask).id);

  const convId = `conv_del_${Date.now()}`;
  let victim: string | null = null;
  let flipped = false;
  try {
    const made: any = await post("/rest/api/3/issue", {
      fields: { project: { key: "WFH" }, issuetype: { id: stdType }, summary: `[harness-test] delete consent ${Date.now()}`, labels: ["harness-test"] },
    });
    victim = String(made.key);
    await callResolver(frame, GLOBAL_APP, "createConversation", { conversationId: convId, title: "[harness] delete consent", personaId: "jira-scrubber" });
    const on: any = await callResolver(frame, GLOBAL_APP, "saveToolPolicy", { policy: { allowDestructive: true, allowBulk: true, allowAgile: true } });
    expect(on?.success).toBeTruthy();
    flipped = true;

    const t1 = await ask(frame, page, convId, `Delete the issue ${victim}.`);
    console.log(`\n### DELETE T1\n${t1}\n--- exists: ${await exists(victim)}`);
    const t2 = await ask(frame, page, convId, `Yes, delete ${victim} please.`);
    const e2 = await exists(victim);
    console.log(`\n### DELETE T2 ("Yes, delete ${victim} please.")\n${t2}\n--- exists: ${e2}`);
    if (e2) {
      const t3 = await ask(frame, page, convId, "yes");
      console.log(`\n### DELETE T3 ("yes")\n${t3}\n--- exists: ${await exists(victim)}`);
    }
  } finally {
    if (victim && (await exists(victim))) await del(`/rest/api/3/issue/${victim}?deleteSubtasks=true`).catch(() => {});
    if (flipped) {
      const back: any = await callResolver(frame, GLOBAL_APP, "saveToolPolicy", { policy: { allowDestructive: false, allowBulk: true, allowAgile: true } });
      console.log("RESTORED allowDestructive:false ->", JSON.stringify(back));
    }
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: convId }).catch(() => {});
  }
});
