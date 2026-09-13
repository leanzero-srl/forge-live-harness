// TESTER PROBE — v6.98.0. ITEM 4 (PO handoff path) + ITEM 1 (re-render / eviction).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, assertLoggedIn, awaitSwapSettled, callResolver, deliverMessage,
  describeThread, openGlobalPage, readAppState, readThread, settleBootSelection,
  waitForChatApp, waitForThread, watchNoise,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 900_000 });

const PROMPT =
  "Forget epics for a moment. Build me a 3 slide PowerPoint titled Handoff Probe Deck " +
  "about quarterly planning — a cover, a points slide with three bullets and a closing " +
  "section. Do NOT touch Jira: create nothing, update nothing, attach nothing.";

test("PROBE handoff deck: PO persona hands off, deck survives, re-render keeps cards", async ({ page, recorder }) => {
  const noise = watchNoise(page);
  const made: string[] = [];
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  try {
    await frame.locator("#newChatButton").click();
    await awaitSwapSettled(frame);
    // pick Product Owner
    await frame.locator("#dropdownSelected").click();
    await expect(frame.locator("#dropdownOptions")).toHaveClass(/open/);
    await frame.locator("#dropdownOptions .dropdown-option").filter({ hasText: /Product Owner/ }).first().click();
    await expect(frame.locator("#dropdownSelected .selected-text")).toHaveText(/Product Owner/);

    const conv = await readAppState<string>(frame, GLOBAL_APP, "app.getActiveConversationId()");
    if (conv) made.push(conv);
    console.log("CONV: " + conv);

    await deliverMessage(page, frame, PROMPT, "handoff deck");
    const thread = await waitForThread(page, frame,
      (t) => t.some((m) => m.role === "assistant" && !m.streaming && m.text.length > 20),
      { timeout: 600_000, interval: 3_000, label: "handoff deck reply" });
    console.log("=== THREAD ===\n" + describeThread(thread));
    const reply = thread.filter((m) => m.role === "assistant").pop()!;
    console.log("=== HANDOFF REPLY (verbatim) ===\n" + reply.text);
    console.log("=== META ===\n" + reply.meta);

    const cards = async () => frame.locator("body").evaluate(() => {
      const c = Array.from(document.querySelectorAll("#chatMessages .deck-card"));
      return c.map((x) => ({
        name: (x.querySelector(".deck-card-name")?.textContent || "").trim(),
        meta: (x.querySelector(".deck-card-meta")?.textContent || "").trim(),
        id: (x as HTMLElement).dataset.deckId,
      }));
    });
    const metas = async () => frame.locator("body").evaluate(() =>
      Array.from(document.querySelectorAll("#chatMessages .message-meta")).map((m) => (m.textContent || "").replace(/\s+/g, " ").trim()));

    console.log("CARDS (live): " + JSON.stringify(await cards()));
    console.log("METAS (live): " + JSON.stringify(await metas()));

    const stored = await (async () => {
      const r = await callResolver<any>(frame, GLOBAL_APP, "getConversation", { conversationId: conv });
      const ms = r?.data?.messages ?? r?.messages ?? [];
      return ms.filter((m: any) => m.role === "assistant").pop();
    })();
    console.log("STORED keys: " + Object.keys(stored || {}).join(","));
    console.log("STORED decks: " + JSON.stringify(stored?.decks));
    console.log("STORED skillsUsed: " + JSON.stringify(stored?.skillsUsed));
    console.log("STORED truncated: " + JSON.stringify(stored?.truncated));

    // ---- THE FULL RE-RENDER PATH (the second bug) --------------------------
    const beforeCards = (await cards()).length;
    const beforeMetas = (await metas()).length;
    await frame.locator("body").evaluate(() => {
      (window as any).chatWiseGlobal.components.chat.renderMessages();
    });
    await page.waitForTimeout(600);
    const afterCards = (await cards()).length;
    const afterMetas = (await metas()).length;
    console.log(`RE-RENDER: cards ${beforeCards} -> ${afterCards}, metas ${beforeMetas} -> ${afterMetas}`);

    // ---- THE EVICTION PATH: maxMessages trip + updateMessage ---------------
    const evictionReport = await frame.locator("body").evaluate(() => {
      const chat = (window as any).chatWiseGlobal.components.chat;
      const orig = chat.options.maxMessages;
      const deckMsg = chat.messages.filter((m: any) => m.decks && m.decks.length).pop();
      const targetId = deckMsg?.id ?? null;
      chat.options.maxMessages = chat.messages.length; // next add evicts the OLDEST
      chat.addMessage({ type: "user", content: "eviction filler" });
      const nodesAfterEvict = chat._messageNodes.size;
      // update the deck message → node may be gone → full renderMessages()
      chat.updateMessage(targetId, { content: (deckMsg?.content || "") + " " });
      const cards = document.querySelectorAll("#chatMessages .deck-card").length;
      const metas = document.querySelectorAll("#chatMessages .message-meta").length;
      chat.options.maxMessages = orig;
      return { targetId, nodesAfterEvict, cards, metas };
    });
    console.log("EVICTION REPORT: " + JSON.stringify(evictionReport));

    // ---------------- assertions -------------------------------------------
    expect(afterCards, "FULL RE-RENDER DESTROYED THE DECK CARD").toBe(beforeCards);
    expect(afterMetas, "FULL RE-RENDER DESTROYED THE META ROW").toBe(beforeMetas);
    expect(evictionReport.cards, "eviction + update destroyed the deck card").toBeGreaterThan(0);
    expect(evictionReport.metas, "eviction + update destroyed the meta row").toBeGreaterThan(0);
  } finally {
    console.log("NOISE: " + noise.report());
    for (const id of made) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: id }).catch(() => {});
    }
  }
});
