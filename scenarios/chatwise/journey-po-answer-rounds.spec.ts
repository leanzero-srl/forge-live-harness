// REGRESSION: clicking a recommended answer must ALWAYS be understood.
//
// The user clicked an answer the Facilitator itself offered and got back
// "could you rephrase that, or tell me which part of the Epic you'd like to
// work on?" — twice reported, "horribly wrong" both times. Two causes, both
// fixed and both pinned here:
//   1. The stored assistant markdown strips the options (they are UI), so the
//      rebuilt history showed the model questions WITHOUT the answers it had
//      offered — a clicked fragment arrived unrecognisable. History now
//      re-attaches the offered options to each assistant turn.
//   2. The wizard's parse-failure fallback literally said "could you rephrase
//      that" — blaming the user for a model glitch. It now owns the failure
//      and never asks the user to rephrase.
//
// The journey drives several consecutive rounds answered ONLY by clicking
// recommendations — the click-first user this feature was built for — and
// after every round asserts the reply is not confusion.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, awaitSwapSettled, callResolver, openGlobalPage, readAppState,
  settleBootSelection, waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const ROUNDS = 4;
const QUOTA_BUBBLE = /token allowance|Nothing was lost/i;

// Confusion, in any of its shapes — the model's own words or a fallback.
const CONFUSION =
  /could you (re)?phrase|rephrase that|didn'?t (quite )?(catch|understand|follow)|not sure (what|which) you (mean|meant)|which part of the epic would you like|please repeat|clarify what you meant/i;

test.describe.configure({ timeout: 1_200_000 });

async function settled(frame: any) {
  await expect
    .poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), {
      timeout: 120_000,
    })
    .toBe(false);
}

test("PO wizard: recommended clicks are always understood, round after round", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");
  let conversationId: string | null = null;

  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);

  try {
    await frame.locator('#promptCategories .welcomePrompt-category[data-category="write"], #promptCategories .welcome-prompt-category[data-category="write"]').first().click();
    await frame.locator("#welcomePrompts .welcome-prompt").filter({ hasText: /epic/i }).first().click();
    await expect(frame.locator("#dropdownSelected .selected-text")).toHaveText(/product owner/i, {
      timeout: 10_000,
    });

    await frame.locator("#chatInput").fill(
      "I want an Epic for a support-deflection knowledge base: AI-suggested " +
        "articles inside the ticket form, weekly gap reports from unresolved " +
        "tickets, and article freshness scoring.",
    );
    await frame.locator("#sendButton").click();
    conversationId = (await readAppState<string | null>(
      frame, GLOBAL_APP, "app.getActiveConversationId()",
    )) as string | null;

    let lastQuestions: string[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      // Wait for this round's reply to settle.
      await expect
        .poll(async () => frame.locator(".message.assistant").count(), { timeout: 300_000 })
        .toBeGreaterThan(round);
      await settled(frame);

      const reply = ((await frame.locator(".message.assistant").last().innerText()) || "").trim();
      if (QUOTA_BUBBLE.test(reply)) {
        test.skip(true, "site quota-blocked mid-run — the calm bubble is correct, rounds not drivable");
      }

      // THE COMPLAINT: an answer the wizard itself offered must never come
      // back as "rephrase that" — from the fallback OR from the model.
      expect(
        reply,
        `round ${round}: the Facilitator did not understand its own offered answer:\n${reply.slice(0, 400)}`,
      ).not.toMatch(CONFUSION);

      // Nor may it re-ask a question that was just answered.
      const row = frame.locator(".message.assistant").last().locator(".message-options");
      const questions: string[] =
        (await row.count()) > 0 ? await row.locator(".option-question").allTextContents() : [];
      for (const q of questions) {
        expect(
          lastQuestions.includes(q.trim()),
          `round ${round}: the wizard re-asked an already-answered question: "${q.trim()}"`,
        ).toBe(false);
      }

      if ((await row.count()) === 0 || questions.length === 0) {
        // A synthesis/preview turn with nothing to click — the rounds under
        // test are the clickable ones, and we had at least one.
        expect(round, "the wizard never offered a single clickable round").toBeGreaterThan(0);
        break;
      }
      lastQuestions = questions.map((q) => q.trim());

      // Answer ONLY with recommendations — the pure click-first user.
      await expect(row, "sheet stuck in hold state").not.toHaveClass(/decoding/, { timeout: 15_000 });
      const groups = row.locator(".option-group");
      const n = await groups.count();
      if (n > 1) {
        for (let i = 0; i < n; i++) {
          await groups.nth(i).locator(".option-btn").first().click();
        }
        const send = row.locator(".option-send-btn");
        await expect(send).toBeEnabled({ timeout: 5_000 });
        await send.click();
      } else {
        await groups.first().locator(".option-btn").first().click();
      }
    }
  } finally {
    if (conversationId) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});
