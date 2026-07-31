// LIVE BEHAVIOUR: pressing Stop mid-turn actually cancels — on BOTH surfaces.
//
// Cancellation is the feature most likely to look fine and be broken, because
// every one of its failure modes still ENDS with a page that renders. The three
// shipped defects were:
//
//   - the issue panel rendered ChatInterface's Stop button (it is drawn from the
//     component's own streaming state) while registering no cancel handler at
//     all — a live-looking button that did nothing, composer locked for the full
//     job (BaseApp.wireCancelControls, :97);
//   - the global page invoked the `cancelJob` resolver DIRECTLY, which left the
//     AsyncJobMonitor's setTimeout chain ticking; the next poll read status
//     "cancelled" and posted "Sorry, I encountered an error: Cancelled"
//     (BaseApp.cancelCurrentJob, :113 and AsyncJobMonitor.cancel);
//   - `stopMonitoring()` was called through optional chaining on a method
//     nobody had defined, so the placeholder bubble animated forever
//     (JobMonitoringHandler.stopMonitoring).
//
// So this spec asserts all four outcomes a user can actually observe, and one
// independent oracle:
//   1. the composer UNLOCKS (Stop → Send, enabled, thinking indicator off);
//   2. NO "Sorry, I encountered an error" bubble is posted — a cancellation is
//      something the user asked for, not a failure;
//   3. NO late assistant message arrives afterwards, watched for a sustained
//      window — this is what "the poller actually stopped" looks like from
//      outside, and it is checked over time rather than once;
//   4. the client's poll chain is empty (activeJobs / pending timeouts);
//   5. ORACLE — the backend job really is `cancelled` (getJobStatus), so the
//      quiet UI is a real cancellation and not just a client that stopped
//      listening.
//
// Test mode is deliberately OFF here: a scripted reply returns in ~1s, which
// would leave no in-flight window to cancel. The turn is cancelled within a
// second or two of being enqueued, so the inference cost is a single short
// Haiku-tier call at most.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import type { Page, FrameLocator } from "@playwright/test";
import type { Recorder } from "../../capture/recorder";
import { createIssue, deleteIssue } from "../../data/jira-build.mjs";
import {
  BASE_URL, GLOBAL_APP, PANEL_APP, armAutoStop, armComposerWatch, assertLoggedIn,
  callResolver, composerState, describeThread, errorBubbles, openGlobalPage, openPanel,
  readAppState, readAutoStop, readComposerWatch, readThread, sendMessage,
  setRecorderTarget, settleBootSelection, waitForChatApp, waitForThread, watchNoise,
} from "./chatwise-support";

const T_GLOBAL = getTarget("chatwise-global");
const T_PANEL = getTarget("chatwise-issue-panel");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const ISSUE_TYPE = process.env.CHATWISE_TEST_ISSUE_TYPE || "Work package";

/** Long enough that a real model would still be working when Stop is pressed. */
const PROMPT = "Write a detailed multi-paragraph retrospective of the last sprint, covering delivery, quality and team health.";
/** How long we watch for a LATE bubble after the cancel. */
const QUIET_WINDOW_MS = 45_000;

interface PollerState {
  currentJobId: string | null;
  activeJobs: string[];
  pendingTimeouts: number;
}

const POLLER_EXPR =
  "({ currentJobId: app.currentJobId ?? null," +
  "   activeJobs: Array.from(app.services?.jobMonitor?.activeJobs?.keys?.() ?? [])," +
  "   pendingTimeouts: app.services?.jobMonitor?.activeTimeouts?.size ?? -1 })";

test.describe.configure({ retries: 1, timeout: 420_000 });

/**
 * The shared cancel journey. Both surfaces run the identical assertions —
 * they shipped this broken in DIFFERENT ways, so anything asserted on only one
 * of them is a gap by construction.
 */
async function runStopJourney(
  page: Page, recorder: Recorder, frame: FrameLocator, appKey: string, surfaceLabel: string,
): Promise<void> {
  const noise = watchNoise(page);

  let jobId = "";

  await recorder.step(`[${surfaceLabel}] send a turn and press STOP the moment it is in flight`, async () => {
    await armComposerWatch(frame);
    await armAutoStop(frame, appKey); // clicks Stop in-page as soon as a job id exists
    await sendMessage(page, frame, PROMPT);

    const deadline = Date.now() + 60_000;
    let stop = await readAutoStop(frame);
    while (!stop.clicked && Date.now() < deadline) {
      await page.waitForTimeout(200);
      stop = await readAutoStop(frame);
    }
    expect(stop.clicked, "no job id ever appeared, so Stop was never pressed — the chat route returned none").toBe(true);
    jobId = stop.jobId!;
    test.info().annotations.push({
      type: "job",
      description: `${surfaceLabel}: ${jobId} — Stop clicked ${stop.latencyMs}ms after send`,
    });

    const cw = await readComposerWatch(frame);
    expect(cw.sawCancel, "the send button must offer Stop while a turn is in flight").toBe(true);
  }, {
    action: "type + send, then click #sendButton (cancel-mode) from inside the page",
    expectation: {
      assertion: "a job id appears, the send button becomes Stop, and Stop is clicked while the turn is still running",
      narrative: "A genuinely in-flight turn is cancelled — not a click that lands after the answer already arrived.",
    },
  });

  await recorder.step(`[${surfaceLabel}] the cancel reached a turn that was still running`, async () => {
    // Guard against a silently vacuous run. If the job had already COMPLETED
    // before the click, "Stop" was really "Send" and everything below would
    // pass without testing cancellation at all. Measured: a default-tier turn
    // completes in ~5s, and the in-page click lands in tens of ms — so this
    // should never trip. If it does, it is a harness/latency problem and says
    // so, rather than masquerading as a passing cancel test.
    const r = await callResolver<{ data?: { status?: string } }>(frame, appKey, "getJobStatus", { jobId });
    expect(
      ["queued", "processing", "retrying", "cancelled"],
      `job ${jobId} was already "${r?.data?.status}" when Stop was clicked — the turn finished first, so this run ` +
        "would not have exercised cancellation (make PROMPT longer-running and re-run).",
    ).toContain(r?.data?.status ?? "");
  }, {
    expectation: {
      assertion: "the job was still queued/processing (or already cancelled) at the moment Stop landed",
      narrative: "Proves the scenario is not vacuously green because the answer beat the click.",
    },
  });

  await recorder.step(`[${surfaceLabel}] the composer UNLOCKS`, async () => {
    const deadline = Date.now() + 20_000;
    let s = await composerState(frame);
    while ((s.cancelMode || s.disabled || s.thinking) && Date.now() < deadline) {
      await page.waitForTimeout(400);
      s = await composerState(frame);
    }
    expect(s.cancelMode, "the send button must leave its Stop role after a cancel").toBe(false);
    expect(s.disabled, "the send button must be enabled again after a cancel").toBe(false);
    expect(s.thinking, "the thinking indicator must switch off after a cancel").toBe(false);
    expect(s.label, "the button must read Send again").toMatch(/send/i);
    // The global page additionally covers the thread with a lock overlay while
    // sending; a cancel that leaves it up makes the whole surface dead.
    const overlayShown = await frame
      .locator("#chatLockOverlay")
      .evaluate((el) => (el as HTMLElement).style.display === "flex")
      .catch(() => false);
    expect(overlayShown, "#chatLockOverlay must come down after a cancel").toBe(false);
  }, {
    expectation: {
      assertion: "#sendButton returns to an enabled Send, the thinking indicator clears and the lock overlay comes down",
      narrative: "The user can immediately type again — the surface is not left locked for the rest of the job.",
    },
  });

  await recorder.step(`[${surfaceLabel}] the client's POLL CHAIN is stopped`, async () => {
    const deadline = Date.now() + 15_000;
    let s = await readAppState<PollerState>(frame, appKey, POLLER_EXPR);
    while ((s.currentJobId || s.activeJobs.length || s.pendingTimeouts > 0) && Date.now() < deadline) {
      await page.waitForTimeout(500);
      s = await readAppState<PollerState>(frame, appKey, POLLER_EXPR);
    }
    expect(s.currentJobId, "the app must forget the cancelled job").toBeNull();
    expect(s.activeJobs, "AsyncJobMonitor must not still be monitoring the cancelled job").toEqual([]);
    expect(s.pendingTimeouts, "no poll timeout may remain scheduled").toBe(0);
  }, {
    expectation: {
      assertion: "currentJobId is null and AsyncJobMonitor holds no active job or pending timeout",
      narrative: "The setTimeout poll chain is really torn down — the mechanism that used to turn a cancel into an error bubble.",
    },
  });

  await recorder.step(`[${surfaceLabel}] ORACLE — the BACKEND job is cancelled`, async () => {
    const deadline = Date.now() + 30_000;
    let status = "";
    for (;;) {
      const r = await callResolver<{ success?: boolean; data?: { status?: string } }>(
        frame, appKey, "getJobStatus", { jobId },
      );
      status = r?.data?.status || "";
      if (status === "cancelled" || Date.now() > deadline) break;
      await page.waitForTimeout(1_500);
    }
    expect(status, `job ${jobId} status on the backend`).toBe("cancelled");
  }, {
    expectation: {
      assertion: 'getJobStatus reports status "cancelled" for the job the user stopped',
      narrative: "The quiet UI is a real cancellation the backend knows about, not a client that merely stopped listening.",
    },
  });

  await recorder.step(`[${surfaceLabel}] NO error bubble and NO late message for ${QUIET_WINDOW_MS / 1000}s`, async () => {
    const deadline = Date.now() + QUIET_WINDOW_MS;
    let worst: Awaited<ReturnType<typeof readThread>> = [];
    for (;;) {
      const thread = await readThread(frame);
      if (thread.length > worst.length) worst = thread;

      const errors = errorBubbles(thread);
      expect(
        errors.length,
        `a cancellation was reported to the user as an ERROR — the user asked for this:\n${describeThread(thread)}`,
      ).toBe(0);

      const assistants = thread.filter((m) => m.role === "assistant");
      expect(
        assistants.length,
        `a late assistant message appeared ${Math.round((QUIET_WINDOW_MS - (deadline - Date.now())) / 1000)}s after the ` +
          `cancel — the poller did not stop, or the placeholder was never torn down:\n${describeThread(thread)}`,
      ).toBe(0);

      expect(
        thread.length,
        `the thread must hold only the user's own message after a cancel:\n${describeThread(thread)}`,
      ).toBe(1);

      if (Date.now() > deadline) break;
      await page.waitForTimeout(3_000);
    }
    expect(worst.length, "no extra bubble appeared at any point during the quiet window").toBe(1);
  }, {
    expectation: {
      assertion: `for ${QUIET_WINDOW_MS / 1000}s after the cancel the thread holds exactly the user's message — no error bubble, no late reply, no stuck placeholder`,
      narrative: "Stop leaves a clean thread. The three shipped defects each produced a visible artefact here.",
    },
  });

  await recorder.step(`[${surfaceLabel}] the composer accepts input again`, async () => {
    await frame.locator("#chatInput").fill("still usable");
    const value = await frame.locator("#chatInput").inputValue();
    expect(value, "the composer must accept typing after a cancel").toBe("still usable");
    await frame.locator("#chatInput").fill("");
    const report = noise.report();
    expect(report, `unexpected browser errors during the cancel:\n${report}`).toBe("");
  }, {
    expectation: {
      assertion: "the textarea takes input again and the cancel produced no console/page/invoke error",
      narrative: "The surface is genuinely usable after Stop, not merely repainted.",
    },
  });
}

test("ChatWise GLOBAL page — Stop cancels cleanly (no error bubble, no late reply)", async ({ page, recorder }) => {
  test.skip(!T_GLOBAL.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover` or set it in .env.");
  setRecorderTarget(recorder, T_GLOBAL, BASE_URL + T_GLOBAL.deepLink(T_GLOBAL.envId)!);

  let conversationId: string | null = null;
  try {
    await assertLoggedIn(page);
    const frame = await openGlobalPage(page, T_GLOBAL, recorder);
    await waitForChatApp(page, frame, GLOBAL_APP);

    await recorder.step("start a clean conversation", async () => {
      // See new-chat-race.spec.ts: the boot-time selection lands asynchronously
      // and would replace this conversation mid-scenario. Wait it out so this
      // spec measures cancellation and nothing else.
      await settleBootSelection(page, frame);
      await frame.locator("#newChatButton").click();
      await waitForThread(page, frame, (t) => t.length === 0, {
        timeout: 20_000, interval: 500, label: "an empty thread after New chat",
      });
    }, {
      action: "click #newChatButton",
      expectation: {
        assertion: "the thread is empty before the cancelled turn",
        narrative: "The 'exactly one message after the cancel' assertion needs a known starting point.",
      },
    });

    // Claimed BEFORE the journey: the very first send persists a conversation
    // on the shared site, so cleanup must not depend on the assertions passing.
    conversationId = await readAppState<string | null>(
      frame, GLOBAL_APP, "app.components.conversationManager?.getCurrentConversationId?.() || null",
    ).catch(() => null);

    await runStopJourney(page, recorder, frame, GLOBAL_APP, "global");
  } finally {
    if (conversationId) {
      const f = await openGlobalPage(page, T_GLOBAL).catch(() => null);
      if (f) {
        await waitForChatApp(page, f, GLOBAL_APP, 60_000).catch(() => {});
        await callResolver(f, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
        test.info().annotations.push({ type: "cleanup", description: `deleted conversation ${conversationId}` });
      }
    }
  }
});

test("ChatWise ISSUE PANEL — Stop cancels cleanly (no error bubble, no late reply)", async ({ page, recorder }) => {
  test.skip(!T_PANEL.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover` or set it in .env.");

  let issueKey: string | null = null;
  try {
    await assertLoggedIn(page);
    const created = await createIssue({
      projectKey: PROJECT,
      issueType: ISSUE_TYPE,
      summary: `ChatWise stop-cancel [harness-test] ${new Date().toISOString()}`,
    });
    issueKey = created?.key;
    expect(issueKey, "the fixture issue must be created").toBeTruthy();
    setRecorderTarget(recorder, T_PANEL, `${BASE_URL}/browse/${issueKey}`);

    const frame = await openPanel(page, T_PANEL, issueKey!, recorder);
    await waitForChatApp(page, frame, PANEL_APP);

    await runStopJourney(page, recorder, frame, PANEL_APP, "issue panel");
  } finally {
    if (issueKey) {
      await deleteIssue(issueKey).catch(() => {});
      test.info().annotations.push({ type: "cleanup", description: `deleted issue ${issueKey}` });
    }
  }
});
