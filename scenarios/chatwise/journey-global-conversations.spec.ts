// JOURNEY: the global page, driven the way a person drives it.
//
// One continuous flow in one window — welcome screen → persona pick → chat →
// message actions → second conversation → sidebar search/switch → delete —
// because that is what the harness never had: every behavioural spec either
// probed a resolver or exercised exactly one interaction in isolation. The
// defects that slip through that net are the SEAMS (a deleted message coming
// back after a conversation switch, a persona pill not following the sidebar),
// and seams only exist in a journey.
//
// Deterministic on purpose: the app's own scripted test mode replies (same
// fixture chat-roundtrip.spec.ts uses), so every assertion is exact and the
// run costs zero model tokens.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  GLOBAL_APP, SCRIPTED, awaitSwapSettled, callResolver, forceTestModeOff, openGlobalPage,
  readAppState, readThread, sendMessage, setTestMode, settleBootSelection,
  waitForChatApp, waitForThread,
} from "./chatwise-support";

const T = getTarget("chatwise-global");

test.describe.configure({ timeout: 420_000 });

test("global page journey: welcome → persona → chat → message actions → sidebar → delete", async ({ page }) => {
  test.skip(!T.envId, "CHATWISE_ENV_ID unresolved — run `npm run discover`.");

  let frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  let testModeOn = false;
  const madeConversations: string[] = [];
  try {
    // ---- A fresh chat, so the welcome screen and persona picker are live ----
    await frame.locator("#newChatButton").click();
    await awaitSwapSettled(frame);
    await frame.locator("#welcomeMessage .welcome-prompt").first().waitFor({ timeout: 15_000 });
    const convA = (await readAppState<string | null>(
      frame, GLOBAL_APP, "app.getActiveConversationId()",
    )) as string | null;
    if (convA) madeConversations.push(convA);

    // ---- Welcome screen: category tabs re-render the prompt list -----------
    const firstPrompt = await frame.locator("#welcomePrompts .welcome-prompt-text").first().innerText();
    await frame.locator('#promptCategories .welcome-prompt-category[data-category="write"]').click();
    await expect(
      frame.locator('#promptCategories .welcome-prompt-category[data-category="write"]'),
    ).toHaveClass(/active/);
    const writePrompt = await frame.locator("#welcomePrompts .welcome-prompt-text").first().innerText();
    expect(writePrompt, "switching category did not change the prompt list").not.toBe(firstPrompt);

    // A prompt click FILLS the composer and sends nothing — the user still
    // owns the send.
    await frame.locator("#welcomePrompts .welcome-prompt").first().click();
    const filled = await frame.locator("#chatInput").inputValue();
    expect(filled.length, "the starter prompt did not reach the composer").toBeGreaterThan(10);
    expect(await readThread(frame), "a starter click must not SEND").toHaveLength(0);
    await frame.locator("#chatInput").fill(""); // clear — we drive our own turn

    // ---- Persona: the CUSTOM dropdown (this app bans native <select>) ------
    const pill = frame.locator("#dropdownSelected .selected-text");
    const current = (await pill.innerText()).trim();
    await frame.locator("#dropdownSelected").click();
    await expect(frame.locator("#dropdownOptions")).toHaveClass(/open/);
    const options = frame.locator("#dropdownOptions .dropdown-option");
    expect(await options.count(), "persona menu is empty").toBeGreaterThan(1);

    // Pick a persona that is NOT the current one — clicking the selected row
    // proves nothing, which is exactly what this spec's first draft did.
    const target = options.filter({ hasNot: frame.locator(`text="${current}"`) }).first();
    // textContent, not innerText: innerText is rendering-aware and returns ""
    // while the menu's open-animation is still painting.
    const pickedName = ((await target.locator(".option-text").textContent()) || "").trim();
    expect(pickedName, "could not read the option label").not.toBe("");
    await target.click();
    await expect(pill).toHaveText(pickedName);

    // Reopen and PROVE the menu marks the choice. The .selected marker had
    // never applied in the app's entire life — a phantom constant made
    // classList.add(undefined) paint the literal class "undefined" — so this
    // line is the regression test for that fix.
    await frame.locator("#dropdownSelected").click();
    await expect(frame.locator("#dropdownOptions")).toHaveClass(/open/);
    const marked = frame.locator("#dropdownOptions .dropdown-option.selected");
    await expect(marked, "the selected persona has no .selected marker in the menu").toHaveCount(1);
    await expect(marked.locator(".option-text")).toHaveText(pickedName);
    const phantom = await frame.locator('#dropdownOptions .dropdown-option[class*="undefined"]').count();
    expect(phantom, 'the literal class "undefined" is back on a menu row').toBe(0);
    await frame.locator("#dropdownSelected").click(); // close

    // ---- One scripted turn -------------------------------------------------
    await setTestMode(frame, GLOBAL_APP, true);
    testModeOn = true;
    await sendMessage(page, frame, SCRIPTED.prompt);
    let thread = await waitForThread(page, frame, (t) => t.some((m) => m.role === "assistant" && !m.streaming), {
      label: "scripted assistant reply in conversation A",
    });
    const reply = thread.find((m) => m.role === "assistant");
    expect(reply, "no assistant reply rendered").toBeTruthy();
    expect(reply!.hasCode, "the scripted reply's code block is missing — wrong render path").toBe(true);

    // Persona is LOCKED once the thread has messages.
    await expect(frame.locator("#personaDropdown")).toHaveClass(/disabled|locked/);

    // ---- Copy an assistant reply (button flips only after the clipboard
    //      write RESOLVES, so .copied is a real success signal) --------------
    const assistantMsg = frame.locator(".message.assistant").last();
    await assistantMsg.hover();
    const copyBtn = assistantMsg.locator(".message-action-btn").first();
    await copyBtn.click();
    await expect(copyBtn, "copy did not confirm — clipboard write failed").toHaveClass(/copied/, { timeout: 5000 });

    // ---- Delete the USER message through the custom modal ------------------
    const before = (await readThread(frame)).length;
    const userMsg = frame.locator(".message.user").last();
    await userMsg.hover();
    await userMsg.locator(".message-action-btn.danger").click();
    // ModalManager builds its modal dynamically; the dead static copies that
    // used to shadow this selector are gone from the markup now, and this
    // stays scoped to the visible one regardless.
    await frame.locator(".modal-button-danger:visible").click();
    await expect
      .poll(async () => (await readThread(frame)).length, { timeout: 10_000 })
      .toBe(before - 1);

    // ---- Second conversation ----------------------------------------------
    await frame.locator("#newChatButton").click();
    await awaitSwapSettled(frame);
    await frame.locator("#welcomeMessage .welcome-prompt").first().waitFor({ timeout: 15_000 });
    const convB = (await readAppState<string | null>(
      frame, GLOBAL_APP, "app.getActiveConversationId()",
    )) as string | null;
    if (convB) madeConversations.push(convB);
    expect(convB, "new chat did not produce a fresh conversation").not.toBe(convA);
    await sendMessage(page, frame, "Second conversation. " + SCRIPTED.prompt);
    await waitForThread(page, frame, (t) => t.some((m) => m.role === "assistant" && !m.streaming), {
      label: "scripted assistant reply in conversation B",
    });

    // ---- Sidebar: search filters, clearing restores ------------------------
    const rows = frame.locator("#conversationsList .conversation-item");
    const total = await rows.count();
    expect(total, "expected both conversations in the sidebar").toBeGreaterThanOrEqual(2);
    // The filter hides rows with display:none — the nodes stay in the DOM, so
    // count VISIBLE ones, and expect the dedicated empty state.
    await frame.locator("#conversationSearch").fill("zzz-no-such-conversation");
    await expect.poll(async () => frame.locator("#conversationsList .conversation-item:visible").count()).toBe(0);
    await expect(frame.locator("#conversationsList .conversations-empty")).toBeVisible();
    await frame.locator("#conversationSearch").fill("");
    await expect
      .poll(async () => frame.locator("#conversationsList .conversation-item:visible").count())
      .toBeGreaterThanOrEqual(2);

    // ---- Switch back to conversation A and PROVE the thread followed -------
    await frame.locator(`#conversationsList .conversation-item[data-conversation-id="${convA}"]`).click();
    await awaitSwapSettled(frame);
    await expect(
      frame.locator(`#conversationsList .conversation-item[data-conversation-id="${convA}"]`),
    ).toHaveClass(/active/, { timeout: 10_000 });
    await expect
      .poll(async () => readAppState<string | null>(frame, GLOBAL_APP, "app.getActiveConversationId()"))
      .toBe(convA);
    // Conversation A had its user turn DELETED — the switch must render the
    // surviving message only. A resurrected message here is the seam bug this
    // journey exists to catch.
    thread = await waitForThread(page, frame, (t) => t.length > 0, {
      timeout: 30_000, label: "conversation A's surviving thread after the switch",
    });
    expect(thread.length, "the deleted message came back after a conversation switch").toBe(before - 1);

    // ---- Delete conversation B through the sidebar's own UI ----------------
    const rowB = frame.locator(`#conversationsList .conversation-item[data-conversation-id="${convB}"]`);
    await rowB.hover();
    await rowB.locator(".delete-button").click();
    await frame.locator(".modal-button-danger:visible").click();
    await expect
      .poll(
        async () =>
          frame.locator(`#conversationsList .conversation-item[data-conversation-id="${convB}"]`).count(),
        { timeout: 15_000 },
      )
      .toBe(0);
    // ...and the backend agrees it is gone.
    const gone = await callResolver<any>(frame, GLOBAL_APP, "getConversation", { conversationId: convB });
    const goneCount = gone?.data?.messages?.length ?? gone?.messages?.length ?? 0;
    expect(goneCount, "the deleted conversation still has messages server-side").toBe(0);
    if (convB) madeConversations.splice(madeConversations.indexOf(convB), 1);

    // ---- Sidebar collapse --------------------------------------------------
    await frame.locator("#sidebarToggle").click();
    await expect(frame.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
    await frame.locator("#sidebarToggle").click();
    await expect(frame.locator(".app-shell")).not.toHaveClass(/sidebar-collapsed/);
  } finally {
    if (testModeOn) {
      // Re-enter from scratch if the body died mid-flight — wolfaenpak is a
      // shared site and a stuck test mode replaces everyone's answers.
      try {
        await setTestMode(frame, GLOBAL_APP, false);
      } catch {
        await forceTestModeOff(page, T);
      }
    }
    for (const id of madeConversations) {
      await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: id }).catch(() => {});
    }
  }
});
