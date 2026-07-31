// LIVE BEHAVIOUR: ChatWise global page — a chat turn actually COMPLETES.
//
// This is the scenario the four render smokes cannot express. They prove the
// iframe mounts; this proves the product works: type → send → enqueue → async
// consumer → poll → an ASSISTANT reply rendered as an assistant.
//
// WHY TEST MODE
// -------------
// The turn is driven with the app's own scripted-reply mode ON
// (src/shared/forge-llm/testMode.js — KVS `chatwise-test-mode`, consumed at
// asyncConsumer.js:266). Two reasons, and neither is "it's easier":
//
//   1. DETERMINISM. `buildTestResponse()` pins a template from the prompt's
//      trigger words, so the expected reply is known CHARACTER FOR CHARACTER.
//      Asserting on live Claude output would mean asserting on something vague
//      ("the reply is non-empty"), which is exactly the proxy assertion that
//      passes while the feature is broken.
//   2. IT EXERCISES MORE. The scripted fixture contains a GFM table and a
//      fenced code block. Those only exist in the DOM if `formatAIMessage()`
//      ran — i.e. if the message went down the ASSISTANT render path. A user
//      bubble is painted with `bubble.textContent = content` and can never
//      contain a <table> or a <pre><code>. So "the reply rendered as an
//      assistant" is proven structurally, not by trusting a CSS class alone.
//
// Test mode is flipped through the SAME resolver the admin UI's Connection tab
// calls (`setTestMode`; admin-uikit/src/index.jsx:140) rather than by driving
// the UI Kit 2 widget, because the resolver is the contract and the widget is
// a second, flakier way of reaching it. It is turned back OFF in a `finally`
// that re-enters the page from scratch if the test died mid-flight —
// wolfaenpak is shared, and a stuck test mode would silently replace every
// real answer on the site with a fixture.
//
// The whole turn is watched for console errors, uncaught exceptions and failed
// invoke() calls; any that survive the ignore list fail the scenario.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import type { RenderedMessage } from "./chatwise-support";
import {
  BASE_URL, GLOBAL_APP, SCRIPTED, armComposerWatch, assertLoggedIn, callResolver,
  composerState, describeThread, errorBubbles, forceTestModeOff, openGlobalPage,
  readAppState, readComposerWatch, readThread, sendMessage, setRecorderTarget,
  setTestMode, settleBootSelection, waitForChatApp, waitForThread, watchNoise,
} from "./chatwise-support";

const T = getTarget("chatwise-global");

// Live UI + an async queue round-trip: retry transient iframe/queue flakes.
// Generous timeout — the consumer is a real Forge async event, and the spec
// polls rather than sleeping.
test.describe.configure({ retries: 1, timeout: 420_000 });

test("ChatWise global page — a chat turn round-trips and renders as an ASSISTANT reply", async ({ page, recorder }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);

  const noise = watchNoise(page);
  let testModeOn = false;
  let conversationId: string | null = null;
  // Set when the body threw, so cleanup never masks the real failure with its
  // own assertion (a finally-thrown error would replace the diagnosis).
  let bodyFailed = false;

  try {
    await assertLoggedIn(page);

    let frame = await openGlobalPage(page, T, recorder);
    await recorder.step("global page boots (app instance published, gate passed)", async () => {
      await waitForChatApp(page, frame, GLOBAL_APP);
    }, {
      action: "navigate",
      expectation: {
        assertion: "window.chatWiseGlobal exists — init() resolved past the beta gate",
        narrative: "The chat app finishes booting, rather than mounting a static shell over a crashed bundle.",
      },
    });

    await recorder.step("enable scripted TEST MODE via the app's own resolver", async () => {
      await setTestMode(frame, GLOBAL_APP, true);
      testModeOn = true;
      const check = await callResolver<{ success?: boolean; enabled?: boolean }>(frame, GLOBAL_APP, "getTestMode");
      expect(check?.enabled, "getTestMode must read back the value setTestMode wrote").toBe(true);
    }, {
      expectation: {
        assertion: "setTestMode({enabled:true}) succeeds and getTestMode reads it back",
        narrative: "The admin-only test-mode toggle works end to end, making the reply deterministic.",
      },
    });

    // Reload so the surface picks up test mode in its status probe, and so the
    // turn below starts from a genuinely fresh boot (no state carried over
    // from the resolver call above).
    frame = await openGlobalPage(page, T, recorder);
    await waitForChatApp(page, frame, GLOBAL_APP);

    await recorder.step("the surface reports test mode (status probe agrees with KVS)", async () => {
      const status = await callResolver<{ status?: string }>(frame, GLOBAL_APP, "lmstudioStatus");
      expect(status?.status, "lmstudioStatus must reflect the test-mode flag").toBe("test-mode");
      await expect(frame.locator("#statusIndicator")).toContainText(/test mode/i, { timeout: 30_000 });
    }, {
      expectation: {
        assertion: 'lmstudioStatus returns "test-mode" and the header status label says so',
        narrative: "The chat header tells the user their answers are scripted — the state is visible, not silent.",
      },
    });

    await recorder.step("start a clean conversation", async () => {
      // Wait for the boot-time selection to land FIRST. It is fired without
      // being awaited, and lands ~100ms-2s after the app is interactive; a New
      // chat created before it lands is silently replaced (new-chat-race.spec.ts
      // isolates that defect). This scenario is about the chat turn, so it does
      // not compete with it.
      await settleBootSelection(page, frame);
      await frame.locator("#newChatButton").click();
      await page.waitForTimeout(1_500);
      const thread = await waitForThread(page, frame, (t) => t.length === 0, {
        timeout: 20_000, interval: 500, label: "an empty thread after New chat",
      });
      expect(thread.length, "New chat must clear the message list").toBe(0);
    }, {
      action: "click #newChatButton",
      expectation: {
        assertion: "the thread is empty after New chat",
        narrative: "The turn under test starts from a clean conversation, so nothing is inherited from earlier runs.",
      },
    });

    noise.reset(); // everything from here is the turn itself

    await recorder.step(`send: "${SCRIPTED.prompt}"`, async () => {
      await armComposerWatch(frame); // record the in-flight transition, don't race it
      await sendMessage(page, frame, SCRIPTED.prompt);
      const thread = await readThread(frame);
      const mine = thread.filter((m) => m.text.includes(SCRIPTED.prompt));
      expect(mine.length, `exactly one bubble should carry the sent text:\n${describeThread(thread)}`).toBe(1);
      expect(mine[0].role, "the message I typed must render as MY bubble").toBe("user");
      // Claim the id NOW, not at the end: the send has already persisted a
      // conversation on the shared site, so every path from here — including a
      // failed assertion — has to be able to clean it up.
      conversationId = await readAppState<string | null>(
        frame, GLOBAL_APP, "app.components.conversationManager?.getCurrentConversationId?.() || null",
      ).catch(() => null);
    }, {
      action: "type + click #sendButton",
      expectation: {
        assertion: "the typed text lands in exactly one bubble, rendered as the user's own",
        narrative: "Sending works and the user's own message is attributed to the user.",
      },
    });

    // THE assertion. Poll (never sleep) for the scripted reply's TABLE CELL —
    // a string that only exists inside an assistant-rendered <table>.
    let thread: RenderedMessage[] = [];
    await recorder.step("an ASSISTANT reply arrives and renders (async: enqueue → consumer → poll)", async () => {
      // Wait for the reply to have SETTLED, not merely to have appeared. While
      // StreamingAnimation is running the bubble is filled with plain
      // textContent (ChatInterface.updateMessage's `streaming` branch), so the
      // reply text is on screen a good second before formatAIMessage() has
      // rendered any markdown. Keying off `.composing` avoids asserting on a
      // half-painted bubble — and if it never settles, that IS the finding.
      thread = await waitForThread(
        page, frame,
        (t) =>
          t.some((m) => m.text.includes(SCRIPTED.tableCell) && !m.streaming) ||
          errorBubbles(t).length > 0,
        { timeout: 180_000, interval: 2_000, label: `a SETTLED scripted reply containing "${SCRIPTED.tableCell}"` },
      );
      const errors = errorBubbles(thread);
      expect(errors.length, `the turn failed with an error bubble:\n${describeThread(thread)}`).toBe(0);
    }, {
      expectation: {
        assertion: "the scripted assistant reply is rendered in the thread within 3 minutes",
        narrative: "The full async pipeline (chat → queue → consumer → getJobStatus poll → render) completes.",
      },
    });

    await recorder.step("the reply is an ASSISTANT bubble, not the user's own", async () => {
      const replies = thread.filter((m) => m.text.includes(SCRIPTED.tableCell));
      expect(replies.length, `exactly one bubble should carry the reply:\n${describeThread(thread)}`).toBe(1);
      const reply = replies[0];
      // 1. The renderer's own role decision.
      expect(reply.role, `the reply rendered as "${reply.role}" (class="${reply.className}")`).toBe("assistant");
      // 2. Structural proof, independent of the class: a user bubble is
      //    painted with textContent and can NEVER contain markdown DOM.
      expect(reply.hasTable, "the reply must contain a rendered <table> (assistant markdown path)").toBe(true);
      expect(reply.hasCode, "the reply must contain a rendered <pre><code> (assistant markdown path)").toBe(true);
      // 3. And nothing user-rendered may carry the assistant's text.
      const misattributed = thread.filter((m) => m.role === "user" && m.text.includes(SCRIPTED.tableCell));
      expect(misattributed.length, "an assistant reply rendered as a USER bubble — the role→type regression").toBe(0);
      // 4. The prose lead-in, so a stray table elsewhere can't satisfy this.
      expect(reply.text).toContain(SCRIPTED.lead);
      expect(reply.text).toContain(SCRIPTED.code);
    }, {
      expectation: {
        assertion: "the reply bubble is .message.assistant AND contains markdown DOM only the assistant path produces",
        narrative: "Assistant answers are attributed to the assistant — the bug where a restored reply was drawn as the user's own cannot recur unnoticed.",
      },
    });

    await recorder.step("the reply is stamped with the model that produced it", async () => {
      const reply = thread.find((m) => m.text.includes(SCRIPTED.tableCell))!;
      expect(reply.meta, `meta chips under the reply (got "${reply.meta}")`).toContain(SCRIPTED.modelChip);
    }, {
      expectation: {
        assertion: `the meta-chip row names the model (${SCRIPTED.modelChip})`,
        narrative: "The answer really came from the backend job (the model + token chips are the job's own metadata), not from a client-side placeholder.",
      },
    });

    await recorder.step("the composer LOCKED while the turn was in flight", async () => {
      const w = await readComposerWatch(frame);
      expect(w.sawCancel, "the send button must switch to its Stop role while a turn is in flight").toBe(true);
      expect(w.sawThinking, "the thinking indicator must go active while a turn is in flight").toBe(true);
    }, {
      expectation: {
        assertion: "#sendButton entered cancel-mode and #thinkingIndicator went active during the turn",
        narrative: "The user gets unambiguous in-flight feedback and cannot fire a second turn on top of the first.",
      },
    });

    await recorder.step("the composer UNLOCKS after the turn", async () => {
      const deadline = Date.now() + 30_000;
      let s = await composerState(frame);
      while ((s.cancelMode || s.disabled) && Date.now() < deadline) {
        await page.waitForTimeout(500);
        s = await composerState(frame);
      }
      expect(s.cancelMode, "the send button must leave cancel-mode once the turn is done").toBe(false);
      expect(s.disabled, "the send button must be enabled once the turn is done").toBe(false);
      expect(s.thinking, "the thinking indicator must switch off once the turn is done").toBe(false);
      expect(s.label).toMatch(/send/i);
    }, {
      expectation: {
        assertion: "#sendButton returns to an enabled Send and the thinking indicator clears",
        narrative: "The user can send a second message — the surface does not stay locked after a completed turn.",
      },
    });

    await recorder.step("no console errors, uncaught exceptions or failed invokes during the turn", async () => {
      const report = noise.report();
      expect(report, `unexpected browser errors during the chat turn:\n${report}`).toBe("");
    }, {
      expectation: {
        assertion: "the turn produces no app-level console error, page error or failed invoke",
        narrative: "The feature works cleanly, not 'it renders but throws on every poll'.",
      },
    });
  } catch (e) {
    bodyFailed = true;
    throw e;
  } finally {
    // Cleanup. Test mode FIRST — it is SITE-WIDE state on a shared instance,
    // so it has to come down even when the assertions above blew up. This path
    // deliberately re-enters the page from scratch rather than reusing a frame
    // handle that may be dead.
    if (testModeOn) {
      const verdict = await forceTestModeOff(page, T);
      test.info().annotations.push({ type: "cleanup", description: verdict });
      if (!verdict.includes("OFF")) console.error("[chatwise] LEFT TEST MODE ON:", verdict);
      if (!bodyFailed) expect(verdict, "test mode must be restored to OFF").toContain("OFF");
    }
    if (conversationId) {
      const cleanupFrame = await openGlobalPage(page, T).catch(() => null);
      if (cleanupFrame) {
        await waitForChatApp(page, cleanupFrame, GLOBAL_APP, 60_000).catch(() => {});
        const r = await callResolver(cleanupFrame, GLOBAL_APP, "deleteConversation", { conversationId })
          .catch((e) => ({ success: false, error: String(e?.message) }));
        test.info().annotations.push({
          type: "cleanup",
          description: `deleteConversation(${conversationId}) → ${JSON.stringify(r)}`,
        });
      }
    }
  }
});
