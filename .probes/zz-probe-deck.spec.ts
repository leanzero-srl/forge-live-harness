// TESTER PROBE — v6.98.0.
//  ITEM 1: deck + skills + truncated survive a conversation switch; download bytes real.
//  ITEM 4: "build a deck AND do not touch Jira" must not deny a download.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, assertLoggedIn, awaitSwapSettled, callResolver, deliverMessage,
  describeThread, openGlobalPage, readAppState, readThread, waitForChatApp,
  waitForThread, watchNoise,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 900_000 });

const PROMPT =
  "Build me a 3 slide presentation titled Harness Probe Q3 about quarterly planning: " +
  "a cover, one points slide with three bullets, and a closing section slide. " +
  "IMPORTANT: do NOT touch Jira at all. Do not create, update, or attach anything to any " +
  "Jira issue. I only want the file itself.";

test("PROBE deck: persistence across a switch + no denied download", async ({ page, recorder }) => {
  const noise = watchNoise(page);
  const made: string[] = [];
  let frame = await (async () => {
    await assertLoggedIn(page);
    const f = await openGlobalPage(page, T, recorder);
    await waitForChatApp(page, f, GLOBAL_APP);
    return f;
  })();

  try {
    const v = (await frame.locator("#version-indicator").textContent())?.trim();
    console.log(`VERSION BEFORE: ${v}`);
    expect(v).toContain("6.98.0");

    await frame.locator("#newChatButton").click();
    await awaitSwapSettled(frame);
    const convA = await readAppState<string>(frame, GLOBAL_APP, "app.getActiveConversationId()");
    if (convA) made.push(convA);
    console.log(`CONV A: ${convA}`);

    await deliverMessage(page, frame, PROMPT, "deck prompt");
    const thread = await waitForThread(page, frame,
      (t) => t.some((m) => m.role === "assistant" && !m.streaming && m.text.length > 20),
      { timeout: 600_000, interval: 3_000, label: "the deck reply" });
    console.log("=== THREAD AFTER DECK TURN ===\n" + describeThread(thread));

    const reply = thread.filter((m) => m.role === "assistant").pop()!;
    console.log("=== ASSISTANT TEXT (verbatim) ===\n" + reply.text);
    console.log("=== META ROW (verbatim) ===\n" + reply.meta);

    // ---- the download card on the LIVE turn --------------------------------
    const cardInfo = async () => frame.locator("body").evaluate(() => {
      const cards = Array.from(document.querySelectorAll("#chatMessages .deck-card"));
      return cards.map((c) => ({
        name: (c.querySelector(".deck-card-name")?.textContent || "").trim(),
        meta: (c.querySelector(".deck-card-meta")?.textContent || "").trim(),
        deckId: (c as HTMLElement).dataset.deckId || null,
        buttons: Array.from(c.querySelectorAll(".deck-btn")).map((b) => (b.textContent || "").trim()),
      }));
    });
    const liveCards = await cardInfo();
    console.log("LIVE DECK CARDS: " + JSON.stringify(liveCards));

    // ---- the STORED row: the exact keys, as read back last time ------------
    const readStored = async () => {
      const res = await callResolver<any>(frame, GLOBAL_APP, "getConversation", { conversationId: convA });
      const msgs = res?.data?.messages ?? res?.messages ?? [];
      return msgs.filter((m: any) => m.role === "assistant").pop();
    };
    const stored = await readStored();
    console.log("STORED assistant keys: " + Object.keys(stored || {}).join(","));
    console.log("STORED decks: " + JSON.stringify(stored?.decks));
    console.log("STORED skillsUsed: " + JSON.stringify(stored?.skillsUsed));
    console.log("STORED truncated: " + JSON.stringify(stored?.truncated));
    console.log("STORED contextNote: " + JSON.stringify(stored?.contextNote));
    console.log("STORED model: " + JSON.stringify(stored?.model));

    // ---- download the bytes BEFORE the switch ------------------------------
    const handle = liveCards[0]?.deckId || stored?.decks?.[0]?.handle;
    console.log("DECK HANDLE: " + handle);
    const grab = async (h: string) => {
      const r = await callResolver<any>(frame, GLOBAL_APP, "getDeckContent", { handle: h, deckId: h });
      const b64 = r?.base64 || r?.data?.base64 || null;
      return {
        ok: !!b64, success: r?.success, error: r?.error,
        filename: r?.filename || r?.data?.filename,
        b64len: b64 ? b64.length : 0,
        bytes: b64 ? Math.floor((b64.length * 3) / 4) : 0,
        magic: b64 ? b64.slice(0, 4) : null,
      };
    };
    const before = handle ? await grab(handle) : null;
    console.log("DOWNLOAD BEFORE SWITCH: " + JSON.stringify(before));

    // ---- SWITCH AWAY AND BACK ---------------------------------------------
    await frame.locator("#newChatButton").click();
    await awaitSwapSettled(frame);
    const convB = await readAppState<string>(frame, GLOBAL_APP, "app.getActiveConversationId()");
    if (convB) made.push(convB);
    await frame.locator(`#conversationsList .conversation-item[data-conversation-id="${convA}"]`).click();
    await awaitSwapSettled(frame);
    await expect.poll(async () => readAppState<string>(frame, GLOBAL_APP, "app.getActiveConversationId()"))
      .toBe(convA);
    await waitForThread(page, frame, (t) => t.length >= 2, { timeout: 30_000, label: "restored thread" });

    const restored = await readThread(frame);
    console.log("=== THREAD AFTER SWITCH ===\n" + describeThread(restored));
    const restoredCards = await cardInfo();
    console.log("RESTORED DECK CARDS: " + JSON.stringify(restoredCards));
    const restoredMeta = restored.filter((m) => m.role === "assistant").pop()?.meta;
    console.log("RESTORED META ROW: " + restoredMeta);

    const after = handle ? await grab(handle) : null;
    console.log("DOWNLOAD AFTER SWITCH: " + JSON.stringify(after));

    // ---- also RELOAD the whole page and check again ------------------------
    await page.reload({ waitUntil: "domcontentloaded" });
    frame = await openGlobalPage(page, T, recorder);
    await waitForChatApp(page, frame, GLOBAL_APP);
    await frame.locator(`#conversationsList .conversation-item[data-conversation-id="${convA}"]`)
      .click({ timeout: 30_000 });
    await awaitSwapSettled(frame);
    await waitForThread(page, frame, (t) => t.length >= 2, { timeout: 30_000, label: "thread after reload" });
    const afterReloadCards = await cardInfo();
    const afterReloadThread = await readThread(frame);
    console.log("AFTER RELOAD DECK CARDS: " + JSON.stringify(afterReloadCards));
    console.log("AFTER RELOAD META: " + afterReloadThread.filter((m) => m.role === "assistant").pop()?.meta);
    console.log("VERSION AFTER: " + (await frame.locator("#version-indicator").textContent())?.trim());

    // ---------- assertions -------------------------------------------------
    expect(liveCards.length, "no download card on the live turn").toBeGreaterThan(0);
    expect(stored?.decks, "STORED decks is still undefined/null").toBeTruthy();
    expect(stored?.truncated, "STORED truncated missing").not.toBeUndefined();
    expect(restoredCards.length, "DECK DID NOT SURVIVE THE SWITCH").toBeGreaterThan(0);
    expect(afterReloadCards.length, "DECK DID NOT SURVIVE A RELOAD").toBeGreaterThan(0);
    expect(after?.ok, "the file no longer downloads after the switch").toBe(true);
    expect(after?.magic, "not a zip — pptx magic PK missing").toBe("UEsD");
    expect(after?.bytes, "suspiciously small file").toBeGreaterThan(10_000);
  } finally {
    console.log("NOISE: " + JSON.stringify(noise.report()));
    for (const id of made) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: id }).catch(() => {});
    }
  }
});
