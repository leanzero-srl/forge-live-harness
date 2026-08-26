// Send one trivial chat turn through the real resolver and watch the job row.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, callResolver, openGlobalPage, waitForChatApp } from "../chatwise/chatwise-support";

const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 600_000 });

test("job probe: enqueue and watch", async ({ page }) => {
  test.skip(!T.envId, "no env id");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);

  const conversationId = `conv_jobprobe_${Date.now()}`;
  await callResolver(frame, GLOBAL_APP, "createConversation", {
    conversationId, title: "[probe] job", personaId: "coffee-break-ai",
  });

  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId, message: "Say the single word PONG and nothing else.", personaId: "coffee-break-ai",
  });
  console.log("chat ->", JSON.stringify(sent).slice(0, 300));
  const jobId = sent?.jobId;
  if (!jobId) { console.log("NO JOB ID"); expect(true).toBe(true); return; }

  for (let i = 0; i < 90; i++) {
    const st = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId });
    const d = st?.data || st;
    console.log(`t+${i * 10}s status=${d?.status} err=${d?.error || ""} note=${d?.result?.status || ""} resp=${String(d?.result?.response || "").slice(0, 80)}`);
    if (["completed", "failed", "cancelled", "not_found", "error"].includes(d?.status)) break;
    await page.waitForTimeout(10000);
  }
  await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  expect(true).toBe(true);
});
