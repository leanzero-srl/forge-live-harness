// JOURNEY: the Product Owner wizard's answer options, in the DEPLOYED app.
//
// The option buttons had exhaustive coverage in the offline stub (structure,
// a11y, escaping, once-only clicks) and ZERO coverage where a user meets them:
// a live wizard turn returning answerOptions through the consumer, the job
// row, the allow-list, and ChatMessageHandler. This is the spec that would
// have caught the allow-list dropping the field — the stub never could.
//
// Live model on purpose (the wizard runs its strict-JSON flow on Sonnet):
// deterministic test mode cannot produce answerOptions. Kept to two turns.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, awaitSwapSettled, callResolver, openGlobalPage, readAppState,
  settleBootSelection, waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-global");

test.describe.configure({ timeout: 600_000 });

test("PO wizard journey: starter flips persona, options render, a click answers", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");

  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);
  await frame.locator("#welcomeMessage .welcome-prompt").first().waitFor({ timeout: 15_000 });

  let conversationId: string | null = null;
  try {
    // ---- The Epic-wizard starter: flips the persona AND fills the composer --
    await frame.locator('#promptCategories .welcome-prompt-category[data-category="write"]').click();
    const wizardStarter = frame
      .locator("#welcomePrompts .welcome-prompt")
      .filter({ hasText: /epic/i })
      .first();
    await expect(wizardStarter, "no Epic-wizard starter on the write tab").toBeVisible();
    await wizardStarter.click();

    await expect(
      frame.locator("#dropdownSelected .selected-text"),
      "the starter did not switch the persona",
    ).toHaveText(/product owner/i, { timeout: 10_000 });
    const filled = await frame.locator("#chatInput").inputValue();
    expect(filled.length, "the starter did not fill the composer").toBeGreaterThan(10);

    // Make the initiative concrete so the wizard has something to ask about.
    await frame.locator("#chatInput").fill(
      "I want an Epic for a customer-facing status page: real-time incident " +
        "banners, per-component uptime history, and email subscriptions for outages.",
    );
    await frame.locator("#sendButton").click();

    conversationId = (await readAppState<string | null>(
      frame, GLOBAL_APP, "app.getActiveConversationId()",
    )) as string | null;

    // ---- The wizard's reply carries CLICKABLE options ----------------------
    const optionsRow = frame.locator(".message.assistant .message-options").first();
    await expect(optionsRow, "no answer options rendered in the deployed app").toBeVisible({
      timeout: 300_000,
    });

    const buttons = optionsRow.locator(".option-btn:not(.option-btn-own)");
    expect(await buttons.count(), "a question with fewer than 2 options").toBeGreaterThanOrEqual(2);
    // options[0] is the recommendation, and says so accessibly.
    await expect(buttons.first()).toHaveClass(/recommended/);
    expect(await buttons.first().getAttribute("aria-label")).toMatch(/\(recommended\)$/);
    // The client always appends its own escape hatch.
    await expect(optionsRow.locator(".option-btn-own").first()).toHaveText(/type your own answer/i);

    // ---- Click the recommendation ------------------------------------------
    // The options attach a beat before the streaming flag clears, and
    // _chooseAnswer refuses clicks mid-stream. Wait for the composer to
    // unlock, the way a person's read of the question naturally does.
    await expect
      .poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"))
      .toBe(false);
    const chosen = ((await buttons.first().locator(".option-btn-text").textContent()) || "").trim();
    const userBubblesBefore = await frame.locator(".message.user").count();
    await buttons.first().click();

    // The click IS a send: a user bubble appears carrying the answer…
    await expect
      .poll(async () => frame.locator(".message.user").count(), { timeout: 15_000 })
      .toBe(userBubblesBefore + 1);
    const sentText = (await frame.locator(".message.user").last().textContent()) || "";
    expect(sentText, "the clicked answer is not what was sent").toContain(chosen);

    // …the menu is spent immediately (no double-answering)…
    await expect(buttons.first()).toBeDisabled();
    await expect(optionsRow).toHaveClass(/answered/);

    // …and the wizard moves on: a SECOND assistant turn arrives.
    await expect
      .poll(async () => frame.locator(".message.assistant").count(), { timeout: 300_000 })
      .toBeGreaterThanOrEqual(2);
  } finally {
    if (conversationId) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
    }
  }
});
