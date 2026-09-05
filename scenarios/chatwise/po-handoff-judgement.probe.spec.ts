// PROBE (not a journey): does the model still INTERVIEW an Epic-intent message
// when the handoff release valve is on the table?
//
// The Product Owner wizard used to be forbidden from handing off an OPENING
// turn (routing.js handoffAllowed: history <= 2). That ban was added because
// the regression it guards could not be measured — and it cost the original
// complaint: the colleague's message 1 was "can you create a work item in my
// name?" and the interview had to answer it, so it framed a work item as an
// Epic.
//
// The DEPLOYED build still carries that ban, so turn 1 cannot be measured here.
// What CAN be measured on the deployed build is the thing the ban was actually
// protecting against: given the handoff direction in its prompt (which the
// deployed build appends from the second user message onward), does the model
// hand away an Epic idea it should interview?
//
// DISCRIMINATOR IS STRUCTURAL, not a reading of the prose: every wizard turn
// renders through renderMarkdown.js and opens with "## 🧭 Epic Facilitator" or
// "## 📋 Epic Preview". A handed-over turn is an ordinary agent reply and
// carries neither.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, awaitSwapSettled, callResolver, openGlobalPage,
  readAppState, settleBootSelection, waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const WIZARD = /🧭 Epic Facilitator|📋 Epic Preview/;
const QUOTA = /token allowance|Nothing was lost/i;

test.describe.configure({ timeout: 1_800_000 });

async function turn(frame: any, text: string): Promise<string> {
  const before = await frame.locator(".message.assistant").count();
  await frame.locator("#chatInput").fill(text);
  await frame.locator("#sendButton").click();
  await expect
    .poll(async () => frame.locator(".message.assistant").count(), { timeout: 300_000 })
    .toBeGreaterThan(before);
  await expect
    .poll(async () => readAppState<boolean>(frame, GLOBAL_APP, "app.components.chat.isStreaming"), { timeout: 120_000 })
    .toBe(false);
  return ((await frame.locator(".message.assistant").last().innerText()) || "").trim();
}

/** One fresh PO conversation; returns the reply to `second`, plus its options. */
async function probe(page: any, first: string, second: string) {
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);
  await frame.locator('#promptCategories .welcome-prompt-category[data-category="write"]').click();
  await frame.locator("#welcomePrompts .welcome-prompt").filter({ hasText: /epic/i }).first().click();
  await expect(frame.locator("#dropdownSelected .selected-text")).toHaveText(/product owner/i, { timeout: 10_000 });

  const conversationId = (await readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()")) as string | null;
  const r1 = await turn(frame, first);
  const r2 = await turn(frame, second);
  const last = frame.locator(".message.assistant").last();
  const optRow = last.locator(".message-options");
  const opts = (await optRow.count())
    ? await optRow.locator(".option-btn .option-btn-text").allInnerTexts()
    : [];
  const question = (await optRow.count()) ? await optRow.locator(".option-question").first().innerText() : "";
  return { frame, conversationId, r1, r2, opts, question };
}

const ROUNDS = Number(process.env.PROBE_ROUNDS || 3);

test("EPIC INTENT with the release valve available is still INTERVIEWED", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const seen: string[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const { conversationId, r2 } = await probe(
      page,
      "hello",
      "I want to create an epic for supplier onboarding",
    );
    if (QUOTA.test(r2)) test.skip(true, "site quota-blocked");
    seen.push(WIZARD.test(r2) ? "INTERVIEWED" : "HANDED OFF");
    console.log(`round ${i + 1}: ${WIZARD.test(r2) ? "INTERVIEWED" : "HANDED OFF"} :: ${r2.slice(0, 220).replace(/\n/g, " ⏎ ")}`);
    if (conversationId) await callResolver(page.frameLocator("iframe").first(), GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  console.log(`EPIC-INTENT verdicts: ${JSON.stringify(seen)}`);
  expect(seen.filter((s) => s === "INTERVIEWED").length, `epic intent was handed away: ${JSON.stringify(seen)}`).toBe(ROUNDS);
});

test("WORK-ITEM intent with the release valve available is HANDED OFF", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved");
  const seen: string[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const { conversationId, r2, opts, question } = await probe(
      page,
      "hello",
      "can you create a work item in my name? you choose the space",
    );
    if (QUOTA.test(r2)) test.skip(true, "site quota-blocked");
    const verdict = WIZARD.test(r2) ? "INTERVIEWED" : "HANDED OFF";
    seen.push(verdict);
    console.log(`round ${i + 1}: ${verdict} :: ${r2.slice(0, 260).replace(/\n/g, " ⏎ ")}`);
    console.log(`  options(${opts.length}) q="${question.replace(/\n/g, " ")}" :: ${JSON.stringify(opts)}`);
    if (conversationId) await callResolver(page.frameLocator("iframe").first(), GLOBAL_APP, "deleteConversation", { conversationId }).catch(() => {});
  }
  console.log(`WORK-ITEM verdicts: ${JSON.stringify(seen)}`);
  expect(seen.filter((s) => s === "HANDED OFF").length, `a work item was answered by an Epic interview: ${JSON.stringify(seen)}`).toBeGreaterThan(0);
});
