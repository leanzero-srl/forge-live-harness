// JOURNEY: the FULL Product Owner flow, THE DIRECT WAY — from a blank chat
// to a CREATED Jira Epic with every wizard question answered through the
// real UI, the way the click-first user actually drives it. No trust-command
// shortcuts through the probing rounds: sheets are answered by clicking, a
// field the wizard presents is approved ("lock it in"), and creation is
// approved only when the wizard offers it. This is the persona's whole
// purpose, exercised as its designed conversation.
//
// Also under test on every turn: the app NEVER shows a red error. The
// per-model token quota (429) is this flow's natural predator — a long
// wizard run is exactly what exhausts a tier mid-conversation. The client
// walks the model ladder; a fully-blocked site must produce the friendly
// wait bubble, not an error.
//
// Model-variance tolerant by design: each turn answers whatever the wizard
// dealt, so the spec asserts the contract, not a fixed transcript.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { get, del } from "../../data/jira.mjs";
import {
  ERROR_BUBBLE, GLOBAL_APP, awaitSwapSettled, callResolver, openGlobalPage,
  readAppState, readThread, settleBootSelection, waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const PROJECT = process.env.CHATWISE_TEST_PROJECT || "WFH";
const MAX_TURNS = 14;
const QUOTA_BUBBLE = /token allowance|Nothing was lost/i;

test.describe.configure({ timeout: 1_500_000 });

/** Send text and wait for the NEXT settled assistant turn; returns its text. */
async function turn(_page: any, frame: any, text: string): Promise<string> {
  const before = await frame.locator(".message.assistant").count();
  await frame.locator("#chatInput").fill(text);
  await frame.locator("#sendButton").click();
  await expect
    .poll(async () => frame.locator(".message.assistant").count(), { timeout: 300_000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), {
      timeout: 120_000,
    })
    .toBe(false);
  return ((await frame.locator(".message.assistant").last().innerText()) || "").trim();
}

/** THE INVARIANT: whatever just happened, it was not a red error bubble. */
async function assertNoErrorBubble(frame: any) {
  const thread = await readThread(frame);
  const red = thread.filter((m) => ERROR_BUBBLE.test(m.text || ""));
  expect(
    red.length,
    `the app errored out mid-flow — 429s and failures must produce calm replies, got: ${red[0]?.text?.slice(0, 200)}`,
  ).toBe(0);
}

/** Answer a live options sheet, whatever its size; returns false if none. */
async function answerSheet(_page: any, frame: any): Promise<boolean> {
  const row = frame.locator(".message.assistant").last().locator(".message-options");
  if ((await row.count()) === 0) return false;
  if (/answered/.test((await row.getAttribute("class")) || "")) return false;
  await expect(row, "sheet never resolved from decoding").not.toHaveClass(/decoding/, { timeout: 15_000 });

  const groups = row.locator(".option-group");
  const n = await groups.count();
  const before = await frame.locator(".message.assistant").count();
  if (n > 1) {
    for (let i = 0; i < n; i++) {
      await groups.nth(i).locator(".option-btn").first().click();
    }
    const send = row.locator(".option-send-btn");
    await expect(send, "Send did not arm after answering every question").toBeEnabled({ timeout: 5_000 });
    await send.click();
  } else {
    await groups.first().locator(".option-btn").first().click();
  }
  await expect
    .poll(async () => frame.locator(".message.assistant").count(), { timeout: 300_000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), {
      timeout: 120_000,
    })
    .toBe(false);
  return true;
}

test("PO full flow: initiative → wizard → approval → a real Epic in Jira, no errors ever", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");
  const stamp = Date.now().toString(36);
  let conversationId: string | null = null;
  let epicKey: string | null = null;

  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);

  try {
    // The Epic-wizard starter flips the persona to Product Owner.
    await frame.locator('#promptCategories .welcome-prompt-category[data-category="write"]').click();
    await frame.locator("#welcomePrompts .welcome-prompt").filter({ hasText: /epic/i }).first().click();
    await expect(frame.locator("#dropdownSelected .selected-text")).toHaveText(/product owner/i, {
      timeout: 10_000,
    });

    let sheetRounds = 0;
    let reply = await turn(
      page, frame,
      `I want an Epic in project ${PROJECT} for an internal "meeting-free deep work" program: ` +
        `calendar guards for 4-hour focus blocks, a team-level no-meeting-day policy tracker, and ` +
        `a monthly report of reclaimed hours. [harness ${stamp}]`,
    );
    conversationId = (await readAppState<string | null>(
      frame, GLOBAL_APP, "app.getActiveConversationId()",
    )) as string | null;
    await assertNoErrorBubble(frame);

    // A fully quota-blocked site is a legitimate outcome — but it must look
    // like the calm wait bubble, never an error. That IS the 429 contract.
    if (QUOTA_BUBBLE.test(reply)) {
      await assertNoErrorBubble(frame);
      test.skip(true, "site fully quota-blocked right now — friendly wait bubble verified, full flow not drivable");
    }

    // ---- Drive the wizard to creation, answering whatever it deals --------
    for (let i = 0; i < MAX_TURNS && !epicKey; i++) {
      // Created already? The reply announces the key.
      const keys = reply.match(new RegExp(`${PROJECT}-\\d+`, "g")) || [];
      for (const k of Array.from(new Set(keys))) {
        const issue: any = await get(`/rest/api/3/issue/${k}?fields=issuetype,summary,description`).catch(() => null);
        if (issue?.fields?.issuetype?.hierarchyLevel === 1) {
          epicKey = k;
          break;
        }
      }
      if (epicKey) break;

      // THE DIRECT FLOW: a live sheet is answered by CLICKING — never by
      // typing around it, never by a trust command that skips the probing.
      // A prose turn is either the wizard offering creation (approve it) or
      // presenting a drafted field (approve THAT and move on) — both are the
      // designed user actions at those steps.
      if (await answerSheet(page, frame)) {
        sheetRounds += 1;
        reply = ((await frame.locator(".message.assistant").last().innerText()) || "").trim();
      } else if (/creat|preview|final|ready|approv/i.test(reply)) {
        reply = await turn(
          page, frame,
          `Approved — create the Epic in project ${PROJECT} now.`,
        );
      } else {
        reply = await turn(page, frame, "That looks right — lock it in and move on.");
      }
      await assertNoErrorBubble(frame);
      if (QUOTA_BUBBLE.test(reply)) {
        // Mid-flow exhaustion of EVERY tier: the calm bubble is the correct
        // behaviour. Verified — but the creation cannot be driven further.
        test.skip(true, "all model tiers quota-blocked mid-flow — friendly wait bubble verified in situ");
      }
    }

    // ---- The point of the whole persona: a real Epic exists ---------------
    expect(epicKey, `no Epic was created after ${MAX_TURNS} turns — last reply: ${reply.slice(0, 300)}`).toBeTruthy();
    const epic: any = await get(`/rest/api/3/issue/${epicKey}?fields=issuetype,summary,description,labels`);
    expect(epic.fields.issuetype.hierarchyLevel, `${epicKey} is not an Epic`).toBe(1);
    expect((epic.fields.summary || "").length, "the Epic has no summary").toBeGreaterThan(8);
    expect(epic.fields.description, "the Epic has an empty description — the wizard's fields never landed").toBeTruthy();

    // The final reply tells the user what was created, by key.
    expect(reply).toContain(epicKey!);
    // And the road there was the GUIDED one: the wizard's questions were
    // really answered through the UI, not steered around.
    expect(
      sheetRounds,
      "the Epic was created without answering any question sheets — this was not the direct flow",
    ).toBeGreaterThanOrEqual(2);
    console.log(`direct flow: ${sheetRounds} question sheets answered by clicking, epic ${epicKey}`);
  } finally {
    if (epicKey) await del(`/rest/api/3/issue/${epicKey}`).catch(() => {});
    if (conversationId) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});
