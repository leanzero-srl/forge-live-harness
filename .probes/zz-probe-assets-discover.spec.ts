import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, assertLoggedIn, awaitSwapSettled, callResolver, deliverMessage,
  describeThread, openGlobalPage, readAppState, waitForChatApp, waitForThread } from "./chatwise-support";
const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 900_000 });
test("PROBE assets: discover the site's Assets shape", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await frame.locator("#newChatButton").click();
  await awaitSwapSettled(frame);
  const conv = await readAppState<string>(frame, GLOBAL_APP, "app.getActiveConversationId()");
  try {
    await deliverMessage(page, frame,
      "In Assets, object type 77 (Confluence Space) in schema IGOV: list ALL its attributes with " +
      "name, data type, required, editable, and for any reference or option attribute list the " +
      "allowed values. Then search that object type with AQL and show me every existing object " +
      "with all its attributes. Do not create or change anything.", "assets discover");
    const t = await waitForThread(page, frame,
      (x) => x.some((m) => m.role === "assistant" && !m.streaming && m.text.length > 20),
      { timeout: 600_000, interval: 3000, label: "assets discovery" });
    console.log("=== DISCOVERY ===\n" + describeThread(t));
    console.log("=== FULL TEXT ===\n" + t.filter((m) => m.role === "assistant").map((m) => m.text).join("\n---\n"));
  } finally {
    if (conv) await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: conv }).catch(() => {});
  }
});
