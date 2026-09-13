import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, describeThread, openGlobalPage, sendMessage, setRecorderTarget, settleBootSelection, waitForChatApp, waitForThread } from "./chatwise-support";
const T = getTarget("chatwise-global");
ftest.describe.configure({ retries: 0, timeout: 600_000 });
ftest("TESTER: allowDocuments=false withdraws the deck tools", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  const before = await callResolver(frame, GLOBAL_APP, "getToolPolicy");
  console.log("policy before:", JSON.stringify(before));
  try {
    const off = await callResolver(frame, GLOBAL_APP, "saveToolPolicy", { policy: { ...(before as any).policy, allowDocuments: false } });
    console.log("saveToolPolicy(off):", JSON.stringify(off));
    console.log("readback:", JSON.stringify(await callResolver(frame, GLOBAL_APP, "getToolPolicy")));

    await frame.locator("#newChatButton").click();
    await page.waitForTimeout(1500);
    await frame.locator("body").evaluate(() => { (document.getElementById("personaDropdown") as HTMLElement)?.click(); });
    await page.waitForTimeout(600);
    await frame.locator("body").evaluate(() => {
      const o = Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")) as HTMLElement[];
      (o.find((x) => /coffee/i.test(x.textContent || "")) || o[0])?.click();
    });
    await page.waitForTimeout(800);
    await sendMessage(page, frame, "Build me a diconium deck with one cover slide about anything. Use createPresentation.");
    const t = await waitForThread(page, frame, (x) => x.length >= 2 && x[x.length - 1].role === "assistant" && !x[x.length - 1].streaming,
      { timeout: 400_000, interval: 3_000, label: "gated deck reply" });
    console.log("GATED THREAD:\n" + describeThread(t));
    const chips = await frame.locator("body").evaluate(() => {
      const m = Array.from(document.querySelectorAll("#chatMessages .message")); const l = m[m.length - 1];
      return { chips: Array.from(l.querySelectorAll(".message-meta-chip")).map((c) => (c.textContent || "").trim()), decks: l.querySelectorAll(".deck-card").length };
    });
    console.log("GATED UI:", JSON.stringify(chips));
  } finally {
    const restore = await callResolver(frame, GLOBAL_APP, "saveToolPolicy", { policy: { allowDestructive: false, allowBulk: true, allowAgile: true, allowBacklog: true, allowDocuments: true } });
    console.log("RESTORE:", JSON.stringify(restore));
    console.log("policy after restore:", JSON.stringify(await callResolver(frame, GLOBAL_APP, "getToolPolicy")));
  }
  expect(1).toBe(1);
});
