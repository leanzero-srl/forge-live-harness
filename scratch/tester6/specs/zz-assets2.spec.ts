// TESTER PROBE — Assets create (crash repro) + update, isolated.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";

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

test("assets create crash repro + update", async ({ page }) => {
  test.setTimeout(3_600_000);
  const T = getTarget("chatwise-global");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const stamp = String(Date.now()).slice(-6);

  const c1 = `conv_a2a_${Date.now()}`;
  await callResolver(frame, GLOBAL_APP, "createConversation", { conversationId: c1, title: "[harness] assets create", personaId: "jira-scrubber" });
  const r1 = process.env.SKIP_CREATE ? "(skipped)" : await ask(frame, page, c1,
    `Create ONE Assets object of object type id 77 ("Confluence Space") with exactly: Name = "[harness] crashrepro ${stamp}", Space Key = "HR${stamp}", Data Owner = "Harness Bot", Classification = "PUBLIC". Report the new object's id and key.`);
  console.log(`\n### CREATE (space key HR${stamp})\n${r1}`);
  await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: c1 }).catch(() => {});

  const c2 = `conv_a2b_${Date.now()}`;
  await callResolver(frame, GLOBAL_APP, "createConversation", { conversationId: c2, title: "[harness] assets update", personaId: "jira-scrubber" });
  const r2 = await ask(frame, page, c2,
    `Update the Assets object with numeric id 145: set Data Owner to "Harness Bot Two". Then read it back with getAssetObject and list EVERY attribute name with its value, and tell me whether anything else was cleared.`);
  console.log(`\n### UPDATE (object 143)\n${r2}`);
  await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: c2 }).catch(() => {});
  expect(r1.length + r2.length).toBeGreaterThan(0);
});
