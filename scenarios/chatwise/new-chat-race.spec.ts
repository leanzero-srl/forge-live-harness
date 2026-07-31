// LIVE BUG SCENARIO (found by this campaign, not previously known): on the
// GLOBAL page, an in-flight conversation SELECTION lands unconditionally and
// overwrites whatever the user has done since — hijacking the conversation they
// are actually in and wiping the message they just sent.
//
// MECHANISM
// ---------
//   `ConversationManager.selectConversation()` (ConversationManager.js:152-188)
//   is async: it makes a `getConversation` invoke round trip and only THEN sets
//   `currentConversationId` and emits `conversation-selected`. Nothing in it,
//   and nothing in `GlobalPageApp.handleConversationSelected()` (:578), checks
//   whether that selection is still the one the user wants by the time it
//   resolves. The handler unconditionally sets the current id, calls
//   `clearMessages()` and repaints the thread from the fetched conversation.
//
//   So ANY user action taken during that round trip is silently reverted. Two
//   ways to reach it, both ordinary:
//
//   (a) sidebar → New chat. Click a conversation in the sidebar, then click
//       New chat before the fetch returns. THIS is what the spec drives,
//       because the two clicks are a deliberate user sequence and the window
//       between them is a real network round trip.
//
//   (b) boot → New chat. `init()` awaits `loadConversations()`, whose handler
//       fires `selectConversation(conversations[0].id)` WITHOUT awaiting it
//       (GlobalPageApp.js:565-572). `init()` therefore resolves — and the UI
//       becomes interactive — with a selection still in flight. Measured live
//       on wolfaenpak:
//           0.03s  New chat clicked → conv_…548880 created and selected
//           0.03s  the user's message rendered in it
//           0.12s  conversation-selected fires for conv_1780290848179_… (8 msgs)
//                  → thread wiped, current id replaced
//       Not driven here because it depends on beating a boot round trip, and a
//       bug scenario that only sometimes reproduces is worse than none — it
//       goes green while the defect is still there. Every other ChatWise
//       scenario calls `settleBootSelection()` specifically to sit out (b).
//
// USER IMPACT: you click New chat, type, hit send — and a fraction of a second
// later your question is gone and you are looking at an older thread. The
// message really was sent (the job carries the id of the conversation you were
// in), so the reply is written into a conversation the UI is no longer showing:
// the answer never appears anywhere the user can see. Nothing errors and
// nothing is logged.
//
// EXPECTED TO FAIL until the selection is made cancellable (drop a result whose
// conversation is no longer the current one). This is the regression guard.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, describeThread, openGlobalPage,
  readAppState, readThread, sendMessage, setRecorderTarget, settleBootSelection,
  waitForChatApp, waitForThread,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const PROBE = "PROBE-new-chat-race-do-not-answer";
/** How long we watch for the in-flight selection to land on top of us. */
const WATCH_MS = 20_000;

test.describe.configure({ retries: 1, timeout: 300_000 });

test("ChatWise global page — an in-flight conversation selection must not hijack the chat the user moved to", async ({ page, recorder }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);

  let myConversationId: string | null = null;

  try {
    await assertLoggedIn(page);
    const frame = await openGlobalPage(page, T, recorder);
    await waitForChatApp(page, frame, GLOBAL_APP);
    const settled = await settleBootSelection(page, frame);
    test.skip(!settled, "this account has no existing conversations, so there is no sidebar row to select");

    // Both clicks are dispatched IN-PAGE, in the same task, so the second lands
    // while the first one's `getConversation` is still in flight. Driving them
    // through two Playwright round trips would sometimes miss the window, and a
    // bug scenario that intermittently goes green is worse than no scenario.
    let picked: { sidebarId: string; newChatId: string | null } | null = null;
    await recorder.step("click a sidebar conversation, then New chat before the fetch returns", async () => {
      const rows = frame.locator("#conversationsList .conversation-item");
      await expect(rows.first()).toBeVisible({ timeout: 20_000 });

      const sidebarId = await frame.locator("body").evaluate(() => {
        const app = (window as unknown as Record<string, any>).chatWiseGlobal;
        const current = app.components.conversationManager.getCurrentConversationId();
        const items = Array.from(
          document.querySelectorAll<HTMLElement>("#conversationsList .conversation-item"),
        );
        // A row OTHER than the one already selected, so the selection genuinely changes.
        const target = items.find((el) => el.dataset.conversationId && el.dataset.conversationId !== current)
          || items[0];
        const id = target?.dataset.conversationId || "";
        target?.click();                                        // starts the async selectConversation
        document.getElementById("newChatButton")?.click();      // …and the user moves on immediately
        return id;
      });

      // The New chat click is synchronous (createConversation builds the
      // conversation in memory), so the current id is already the new one.
      myConversationId = await readAppState<string | null>(
        frame, GLOBAL_APP, "app.components.conversationManager?.getCurrentConversationId?.() || null",
      );
      picked = { sidebarId, newChatId: myConversationId };
      test.info().annotations.push({ type: "race", description: JSON.stringify(picked) });

      expect(sidebarId, "a sidebar row must exist to select").toBeTruthy();
      expect(myConversationId, "New chat must have produced a conversation id").toBeTruthy();
      expect(
        myConversationId,
        "New chat must move the user off the sidebar row they had just clicked",
      ).not.toBe(sidebarId);

      await waitForThread(page, frame, (t) => t.length === 0, {
        timeout: 20_000, interval: 200, label: "an empty thread in the brand-new chat",
      });
    }, {
      action: "click .conversation-item then #newChatButton in the same task",
      expectation: {
        assertion: "the user ends up in a brand-new, empty conversation",
        narrative: "An ordinary double interaction: pick an old chat, change your mind, start a new one.",
      },
    });

    await recorder.step("send a message into the brand-new conversation", async () => {
      await sendMessage(page, frame, PROBE);
      const t = await readThread(frame);
      expect(t.filter((m) => m.role === "user" && m.text.includes(PROBE)).length).toBe(1);
    }, {
      action: "type + send",
      expectation: {
        assertion: "the message renders in the new conversation",
        narrative: "The user has asked their question and can see it.",
      },
    });

    await recorder.step(`the conversation is NOT swapped out from under the user (watched ${WATCH_MS / 1000}s)`, async () => {
      const deadline = Date.now() + WATCH_MS;
      let current = myConversationId;
      let thread = await readThread(frame);
      for (;;) {
        current = await readAppState<string | null>(
          frame, GLOBAL_APP, "app.components.conversationManager?.getCurrentConversationId?.() || null",
        );
        thread = await readThread(frame);
        const lostMessage = !thread.some((m) => m.role === "user" && m.text.includes(PROBE));
        if (current !== myConversationId || lostMessage) break;
        if (Date.now() > deadline) break;
        await page.waitForTimeout(250);
      }
      expect(
        current,
        `the current conversation changed by itself from ${myConversationId} to ${current} — the earlier ` +
          `selectConversation(${picked?.sidebarId}) resolved after the user had already started a new chat and ` +
          "overwrote it. ConversationManager.js:152 sets currentConversationId with no staleness check, and " +
          "GlobalPageApp.js:578 clears + repaints the thread unconditionally.",
      ).toBe(myConversationId);
      expect(
        thread.some((m) => m.role === "user" && m.text.includes(PROBE)),
        `the user's own message vanished from the thread — it was sent to ${myConversationId}, so its reply will be ` +
          `written somewhere the UI is no longer showing:\n${describeThread(thread)}`,
      ).toBe(true);
    }, {
      expectation: {
        assertion: "the current conversation id and the user's message both survive the in-flight selection landing",
        narrative: "A question the user just asked does not disappear into a conversation they are no longer looking at.",
      },
    });
  } finally {
    if (myConversationId) {
      const f = await openGlobalPage(page, T).catch(() => null);
      if (f) {
        await waitForChatApp(page, f, GLOBAL_APP, 60_000).catch(() => {});
        await callResolver(f, GLOBAL_APP, "deleteConversation", { conversationId: myConversationId }).catch(() => {});
        test.info().annotations.push({ type: "cleanup", description: `deleted conversation ${myConversationId}` });
      }
    }
  }
});
