// LIVE REGRESSION: recent history must be the NEWEST messages.
//
// THE BUG THIS GUARDS (ChatWise, fixed 17 Aug 2026)
// -------------------------------------------------
// `@forge/kvs`'s plain query builder has no sort(). Message keys are
// `conv:<id>:msg:msg_<Date.now()>_<rand>` — ascending lexicographic, therefore
// ascending chronological — so `query().limit(50)` returned the OLDEST fifty.
// Past fifty messages the model was never shown the user's newest turn, and the
// sidebar preview (the same call with limit 1) showed the opening line forever.
//
// WHY THIS EXISTS ALONGSIDE THE UNIT TEST
// ---------------------------------------
// test/messageOrder.test.mjs proves the logic against a fake KVS and goes red on
// the pre-fix code. What it cannot prove is that the REAL KVS behaves the way the
// fake does — the fix reads an index and pages a cursor walk, and a wrong field
// name or a different paging shape would look identical in a fake and be silently
// broken in production. So this asserts the same properties against real storage.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";

test("recent history is the newest messages, against real KVS", async ({ page, context }) => {
  test.setTimeout(600_000);

  const T = getTarget("chatwise-global");
  const conversationId = `conv_harness_order_${Date.now()}`;
  let frame: Awaited<ReturnType<typeof openGlobalPage>> | null = null;

  const turn = async (message: string) => {
    const sent = await callResolver<{ success: boolean; jobId?: string; error?: string }>(
      frame!,
      GLOBAL_APP,
      "chat",
      { conversationId, message, personaId: "coffee-break-ai", personaLocked: true },
    );
    expect(sent?.success, `enqueue failed: ${sent?.error}`).toBeTruthy();
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const r = await callResolver<{ data?: any }>(frame!, GLOBAL_APP, "getJobStatus", {
        jobId: sent.jobId,
      });
      const st = r?.data?.status;
      if (st && ["completed", "failed", "cancelled"].includes(st)) return r!.data;
      await page.waitForTimeout(2500);
    }
    throw new Error("turn never reached a terminal status");
  };

  try {
    frame = await openGlobalPage(page, T);
    await waitForChatApp(page, frame, GLOBAL_APP);

    await callResolver(frame!, GLOBAL_APP, "createConversation", {
      conversationId,
      title: "[harness-test] message order",
      personaId: "coffee-break-ai",
    });

    // Three turns, each with a distinct marker the assertions can find. Short
    // prompts on the cheapest tier — this is a storage test, not a model test.
    await turn("Remember the marker ALPHA. Reply with one word.");
    await turn("Remember the marker BRAVO. Reply with one word.");
    await turn("The magic word is XYZZY. Reply with one word.");

    // (1) The transcript comes back chronologically, newest LAST.
    const conv = await callResolver<{ success: boolean; data?: any }>(
      frame!,
      GLOBAL_APP,
      "getConversation",
      { conversationId },
    );
    expect(conv?.success, "getConversation did not succeed").toBeTruthy();
    const msgs: any[] = conv.data?.messages || [];
    const userMsgs = msgs.filter((m) => m.role === "user").map((m) => String(m.content));
    console.log(`messages=${msgs.length} userTurns=${userMsgs.length}`);

    expect(userMsgs.length, "expected three user turns").toBe(3);
    expect(userMsgs[0]).toMatch(/ALPHA/);
    expect(userMsgs[2], "the newest user turn is not last — ordering regressed").toMatch(/XYZZY/);

    // (2) messageCount is real, not a saturated page length.
    expect(conv.data?.messageCount, "messageCount not tracked").toBeGreaterThanOrEqual(6);

    // (3) The sidebar preview is the LATEST message, not the first. This is the
    // half of the bug a user actually sees every time they open the app.
    // Shape is { success, data: [...] } — see conversation.routes.js.
    const list = await callResolver<{ success: boolean; data?: any[] }>(
      frame!,
      GLOBAL_APP,
      "getUserConversations",
    );
    const row = (list?.data || []).find((c: any) => c.id === conversationId);
    expect(row, "conversation missing from the sidebar list").toBeTruthy();
    console.log(`sidebar preview: ${JSON.stringify(row.lastMessage).slice(0, 120)}`);
    expect(
      row.lastMessage || "",
      "sidebar preview is not the newest message — it is showing the opening line again",
    ).not.toMatch(/ALPHA/);
  } finally {
    if (frame) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});
