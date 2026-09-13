// TESTER PROBE — v6.98.0 ITEM 6: compaction AND a quota fallback on the SAME
// real turn — both chips must be present and both must survive a restore.
//
// THE ARITHMETIC THAT MAKES THIS HARD ON WOLFAENPAK: the smallest context
// budget a persona can have is MIN_CONTEXT_TOKENS = 64,000 (budget.js), so
// compaction only begins at roughly 55,000 tokens of prompt once the tool
// schemas and the direction are subtracted. The tenant's Forge LLM quota is
// 50,000 tokens PER MODEL. A prompt big enough to compact is therefore bigger
// than the whole per-model allowance. This spec tries the only window that
// exists: burn the pinned tier first, then send one over-budget turn and hope
// the gateway checks USAGE-SO-FAR rather than usage+request on the sibling.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, assertLoggedIn, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";

const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 2_400_000 });

const FILLER = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `Line ${i}: the quarterly planning review recorded that team ${i % 17} reclaimed ` +
    `${(i * 7) % 91} hours of deep work in sprint ${i % 23}, against a target of 40, with ` +
    `blockers logged under category ${String.fromCharCode(65 + (i % 26))}.`).join("\n");

async function ask(frame: any, page: any, conversationId: string, message: string) {
  const sent = await callResolver<any>(frame, GLOBAL_APP, "chat", {
    conversationId, message, personaId: "coffee-break-ai", personaLocked: true });
  if (!sent?.success) return { status: "enqueue-failed", text: JSON.stringify(sent?.error), job: null };
  let data: any = null;
  const deadline = Date.now() + 600_000;
  while (Date.now() < deadline) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getJobStatus", { jobId: sent.jobId });
    data = r?.data ?? null;
    if (data && ["completed", "failed", "cancelled"].includes(data.status)) break;
    await page.waitForTimeout(3000);
  }
  return { status: data?.status, text: String(data?.result?.response || data?.error || ""), job: data };
}

test("PROBE compaction + quota on one turn", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const conversationId = `conv_harness_compact_${Date.now()}`;
  try {
    await callResolver(frame, GLOBAL_APP, "createConversation", {
      conversationId, title: "[harness-test] compaction", personaId: "coffee-break-ai" });

    for (let i = 1; i <= 4; i++) {
      const body = FILLER(600); // ~85 KB
      const r = await ask(frame, page, conversationId,
        `Turn ${i}. Summarise the single most common blocker category below in one word.\n\n${body}`);
      console.log(`TURN ${i}: status=${r.status} contextNote=${JSON.stringify(r.job?.result?.contextNote)} ` +
        `model=${r.job?.result?.model} reply="${r.text.slice(0, 160)}"`);
      const note = r.job?.result?.contextNote;
      if (note && (note.compacted || note.degraded) && note.quotaNote) {
        console.log(`BOTH DISCLOSURES ON ONE TURN: ${JSON.stringify(note)}`);
        // and they must survive a restore
        const conv = await callResolver<any>(frame, GLOBAL_APP, "getConversation", { conversationId });
        const stored = (conv?.data?.messages ?? conv?.messages ?? []).filter((m: any) => m.role === "assistant").pop();
        console.log(`STORED contextNote: ${JSON.stringify(stored?.contextNote)}`);
        expect(stored?.contextNote?.quotaNote, "the quota disclosure was lost on the stored row").toBeTruthy();
        expect(stored?.contextNote?.compacted || stored?.contextNote?.degraded,
          "the compaction disclosure was lost on the stored row").toBeTruthy();
        return;
      }
    }
    console.log("NEVER GOT BOTH ON ONE TURN — see the header for why this is expected here.");
  } finally {
    await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
});
