// LIVE REGRESSION: the ISSUE PANEL restores its thread across a reload, with
// the right roles. This is the guard for two defects that both lived on this
// exact surface and both produced a *plausible-looking* panel:
//
//   1. `result.success` guard — IssuePanelApp.loadConversation() gated the
//      restore on a flag the resolver did not return. The guard was permanently
//      false, so the panel painted an empty welcome screen on top of a thread
//      that was sitting in KVS the whole time. Nothing errored; the history was
//      simply invisible. (IssuePanelApp.js:323, conversation.routes.js:127.)
//
//   2. role → render type — a persisted message carries `{ role: "assistant" }`
//      and no `type`, while the renderer branches on `type`. A restored
//      assistant turn fell through to the "user" default and was drawn as the
//      USER's own right-aligned bubble with raw, unformatted markdown.
//      (ChatInterface.js `_withRenderType`, :282.)
//
// Both are invisible to a render smoke: the iframe mounts, the surface is
// non-blank, nothing throws. Only a send → RELOAD → read-the-roles round-trip
// catches them, which is what this does.
//
// It runs against a FRESH Jira issue created for the run, so the conversation
// (`issue-<KEY>`) starts genuinely empty — reusing a shared issue would let a
// previous run's thread satisfy the assertions. Test mode makes the reply
// deterministic; see chat-roundtrip.spec.ts for the full rationale.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { createIssue, deleteIssue } from "../../data/jira-build.mjs";
import type { RenderedMessage } from "./chatwise-support";
import {
  BASE_URL, PANEL_APP, SCRIPTED, assertLoggedIn, describeThread, errorBubbles,
  forceTestModeOff, openPanel, readThread, reloadPanel, sendMessage,
  setRecorderTarget, setTestMode, waitForChatApp, waitForThread, watchNoise,
} from "./chatwise-support";

const T = getTarget("chatwise-issue-panel");
const GLOBAL = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const ISSUE_TYPE = process.env.CHATWISE_TEST_ISSUE_TYPE || "Work package";

test.describe.configure({ retries: 1, timeout: 420_000 });

test("ChatWise issue panel — the thread survives a reload with the correct roles", async ({ page, recorder }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover` or set it in .env.");

  const noise = watchNoise(page);
  let issueKey: string | null = null;
  let testModeOn = false;
  let bodyFailed = false;

  try {
    await assertLoggedIn(page);

    await recorder.step("create a fresh Jira issue (virgin conversation)", async () => {
      const created = await createIssue({
        projectKey: PROJECT,
        issueType: ISSUE_TYPE,
        summary: `ChatWise panel persistence [harness-test] ${new Date().toISOString()}`,
      });
      issueKey = created?.key;
      expect(issueKey, "the fixture issue must be created").toBeTruthy();
      test.info().annotations.push({ type: "fixture", description: `issue ${issueKey}` });
    }, {
      action: "REST create issue",
      expectation: {
        assertion: `a new ${PROJECT} issue exists`,
        narrative: "The panel's conversation id is derived from the issue key, so a fresh issue guarantees an empty starting thread.",
      },
    });

    setRecorderTarget(recorder, T, `${BASE_URL}/browse/${issueKey}`);

    let frame = await openPanel(page, T, issueKey!, recorder);
    await recorder.step("issue panel boots", async () => {
      await waitForChatApp(page, frame, PANEL_APP);
      const thread = await readThread(frame);
      expect(thread.length, `a fresh issue must start with an empty thread:\n${describeThread(thread)}`).toBe(0);
    }, {
      action: "navigate + expand the AI Assistant glance",
      expectation: {
        assertion: "window.chatWiseIssuePanel exists and the thread is empty",
        narrative: "The panel boots on a fresh issue with nothing to restore — the baseline the reload is compared against.",
      },
    });

    await recorder.step("enable scripted TEST MODE", async () => {
      await setTestMode(frame, PANEL_APP, true);
      testModeOn = true;
    }, {
      expectation: {
        assertion: "setTestMode({enabled:true}) succeeds from the issue-panel iframe",
        narrative: "The reply becomes a known fixture, so the post-reload assertions can be exact.",
      },
    });

    noise.reset();

    await recorder.step(`send "${SCRIPTED.prompt}" and wait for the settled reply`, async () => {
      await sendMessage(page, frame, SCRIPTED.prompt);
      const thread = await waitForThread(
        page, frame,
        (t) => t.some((m) => m.text.includes(SCRIPTED.tableCell) && !m.streaming) || errorBubbles(t).length > 0,
        { timeout: 180_000, interval: 2_000, label: "the settled scripted reply in the panel" },
      );
      expect(errorBubbles(thread).length, `the turn failed:\n${describeThread(thread)}`).toBe(0);
      expect(thread.filter((m) => m.role === "assistant" && m.text.includes(SCRIPTED.tableCell)).length)
        .toBe(1);
    }, {
      action: "type + send",
      expectation: {
        assertion: "one assistant reply lands in the panel before the reload",
        narrative: "There is a real, two-message thread in KVS for the reload to restore.",
      },
    });

    // ---- THE RELOAD ----
    await recorder.step("RELOAD the surface (proven fresh JS context)", async () => {
      // reloadPanel stamps the live context, forces a browser reload and
      // refuses to continue unless the stamp is gone. Without that proof this
      // whole spec could pass on a surface that never reloaded — Jira's SPA
      // router sometimes swallows a re-navigation to the same issue URL.
      frame = await reloadPanel(page, T, recorder);
      await waitForChatApp(page, frame, PANEL_APP);
    }, {
      action: "page.reload() + re-enter the panel",
      expectation: {
        assertion: "the panel boots again in a genuinely new JS context on the same issue",
        narrative: "Everything after this point comes from KVS, not from client state — and that is verified, not assumed.",
      },
    });

    let restored: RenderedMessage[] = [];
    await recorder.step("the thread is RESTORED (not an empty welcome screen)", async () => {
      // Guard #1's failure mode is an empty panel, so poll for content and let
      // the timeout be the diagnosis rather than reading once and guessing.
      restored = await waitForThread(
        page, frame, (t) => t.length >= 2,
        { timeout: 60_000, interval: 1_000, label: "both persisted messages to be restored" },
      );
      expect(restored.length, `expected exactly the 2 persisted messages:\n${describeThread(restored)}`).toBe(2);
      const welcomeVisible = await frame.locator("#welcomeMessage").isVisible().catch(() => false);
      expect(welcomeVisible, "the welcome card must be hidden once a restored thread exists").toBe(false);
    }, {
      expectation: {
        assertion: "both persisted messages are rendered after the reload and the welcome card is hidden",
        narrative: "REGRESSION GUARD for the `result.success` bug: history in KVS is actually shown instead of a blank panel.",
      },
    });

    await recorder.step("the USER turn is restored as the USER", async () => {
      const mine = restored.filter((m) => m.text.includes(SCRIPTED.prompt));
      expect(mine.length, `exactly one restored bubble should carry my text:\n${describeThread(restored)}`).toBe(1);
      expect(mine[0].role, `my message came back as "${mine[0].role}" (class="${mine[0].className}")`).toBe("user");
    }, {
      expectation: {
        assertion: "the restored user message renders as .message.user",
        narrative: "Attribution survives persistence in the direction that was already correct.",
      },
    });

    await recorder.step("the ASSISTANT turn is restored as the ASSISTANT (not as my own bubble)", async () => {
      const replies = restored.filter((m) => m.text.includes(SCRIPTED.tableCell));
      expect(replies.length, `exactly one restored bubble should carry the reply:\n${describeThread(restored)}`).toBe(1);
      const reply = replies[0];
      expect(reply.role, `the restored reply rendered as "${reply.role}" (class="${reply.className}")`)
        .toBe("assistant");
      // Structural proof independent of the class: a message drawn down the
      // USER path is painted with textContent and cannot contain markdown DOM.
      // This is what "raw, unformatted markdown in a user bubble" looked like.
      expect(reply.hasTable, "the restored reply must contain a rendered <table>").toBe(true);
      expect(reply.hasCode, "the restored reply must contain a rendered <pre><code>").toBe(true);
      expect(reply.text, "raw markdown fences must not survive into the rendered bubble").not.toContain("```");
      const misattributed = restored.filter((m) => m.role === "user" && m.text.includes(SCRIPTED.tableCell));
      expect(misattributed.length, "a restored assistant message rendered as a USER bubble — the role→type regression")
        .toBe(0);
    }, {
      expectation: {
        assertion: "the restored assistant message renders as .message.assistant with formatted markdown",
        narrative: "REGRESSION GUARD for the role→type bug: a restored assistant turn is never drawn as the user's own.",
      },
    });

    await recorder.step("the restored thread is in the right ORDER", async () => {
      expect(restored[0].role, `restored order:\n${describeThread(restored)}`).toBe("user");
      expect(restored[1].role, `restored order:\n${describeThread(restored)}`).toBe("assistant");
    }, {
      expectation: {
        assertion: "user turn first, assistant turn second",
        narrative: "getRecentMessages()'s reverse-to-chronological actually produces a readable conversation.",
      },
    });

    await recorder.step("no console errors, uncaught exceptions or failed invokes", async () => {
      const report = noise.report();
      expect(report, `unexpected browser errors during send + reload:\n${report}`).toBe("");
    }, {
      expectation: {
        assertion: "the send + restore round-trip produces no app-level browser error",
        narrative: "Restoration is clean, not 'it renders and throws'.",
      },
    });
  } catch (e) {
    bodyFailed = true;
    throw e;
  } finally {
    if (testModeOn) {
      const verdict = await forceTestModeOff(page, GLOBAL);
      test.info().annotations.push({ type: "cleanup", description: verdict });
      if (!verdict.includes("OFF")) console.error("[chatwise] LEFT TEST MODE ON:", verdict);
      if (!bodyFailed) expect(verdict, "test mode must be restored to OFF").toContain("OFF");
    }
    if (issueKey) {
      // NOTE: this removes the Jira issue. The KVS conversation `issue-<KEY>`
      // is deliberately left alone — `deleteConversation` does not clean up the
      // incremental `conv:<id>:meta` / `conv:<id>:msg:*` rows anyway (see the
      // report), and an orphan keyed to a deleted issue is unreachable.
      await deleteIssue(issueKey).catch(() => {});
      test.info().annotations.push({ type: "cleanup", description: `deleted issue ${issueKey}` });
    }
  }
});
