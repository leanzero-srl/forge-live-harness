// TESTER PROBE — v6.98.0 ITEM 4, the sharpest form of the reported bubble:
// the user asks for a LINK and forbids Jira. The v6.97.0 bubble was
// "I can't hand you a download link — the only delivery route I have is
//  attaching the file to a Jira issue, and you asked me not to touch Jira."
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, assertLoggedIn, awaitSwapSettled, callResolver, deliverMessage,
  openGlobalPage, readAppState, waitForChatApp, waitForThread,
} from "./chatwise-support";
const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 900_000 });

test("PROBE: asks for a link, forbids Jira", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);
  const conv = await readAppState<string>(frame, GLOBAL_APP, "app.getActiveConversationId()");
  try {
    await deliverMessage(page, frame,
      "Make me a 3-slide deck called 'Control Deck' about quarterly planning and give me a " +
      "download link for it. You are NOT allowed to touch Jira — do not create an issue, do not " +
      "update one, do not attach anything anywhere. Just the file.", "deck link");
    const t = await waitForThread(page, frame,
      (x) => x.some((m) => m.role === "assistant" && !m.streaming && m.text.length > 20),
      { timeout: 600_000, interval: 3_000, label: "deck-link reply" });
    const reply = t.filter((m) => m.role === "assistant").pop()!.text;
    const cards = await frame.locator("#chatMessages .deck-card").count();
    console.log(`--- REPLY ---\n${reply}\n--- CARDS: ${cards} ---`);
    if (/token allowance|Nothing was lost/i.test(reply)) test.skip(true, "tenant quota");
    expect(cards, "no download card was rendered at all").toBeGreaterThan(0);
    const denies = /can'?t (hand|give|provide).{0,40}(download|link)|no (download|way to).{0,30}(link|give)|only (delivery )?route|only way (to get|I have)|cannot (give|provide) you (a|the) (download|file|link)/i;
    const m = reply.match(denies);
    console.log(`DENIAL SENTENCE FOUND: ${m ? JSON.stringify(m[0]) : "none"}`);
    expect(m, `the model denied a download beside a working Download button: ${reply.slice(0, 400)}`).toBeNull();
    const claimsJira = /(attach|attaching) (it |the file )?to (a |an )?Jira issue is the only|need(s)? (a |an )?Jira|have to (attach|put) it (in|on) Jira/i;
    expect(reply.match(claimsJira), `the reply claims a Jira write is needed: ${reply.slice(0, 400)}`).toBeNull();
  } finally {
    if (conv) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: conv }).catch(() => {});
  }
});
