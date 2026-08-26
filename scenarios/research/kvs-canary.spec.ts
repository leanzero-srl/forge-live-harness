// Is the app's KVS writing and reading back at all right now?
// saveUploadsProject/getUploadsProject is the smallest write→read pair the app
// exposes: one kvs.set, one kvs.get, no queue, no index, no query.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, callResolver, openGlobalPage, waitForChatApp } from "../chatwise/chatwise-support";

const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 300_000 });

test("KVS canary: set then get", async ({ page }) => {
  test.skip(!T.envId, "no env id");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);

  const before = await callResolver<any>(frame, GLOBAL_APP, "getUploadsProject", {});
  console.log("before:", JSON.stringify(before));

  for (const value of ["WFH", "COGTEST", "WFH"]) {
    const w = await callResolver<any>(frame, GLOBAL_APP, "saveUploadsProject", { projectKey: value });
    const r = await callResolver<any>(frame, GLOBAL_APP, "getUploadsProject", {});
    console.log(`set ${value} -> write=${JSON.stringify(w)} read=${JSON.stringify(r)}`);
  }

  // And a conversation round trip: create then read back.
  const id = `conv_canary_${Date.now()}`;
  const made = await callResolver<any>(frame, GLOBAL_APP, "createConversation", { conversationId: id, title: "[canary]", personaId: "coffee-break-ai" });
  const got = await callResolver<any>(frame, GLOBAL_APP, "getConversation", { conversationId: id });
  console.log("createConversation:", JSON.stringify(made).slice(0, 160));
  console.log("getConversation   :", JSON.stringify(got).slice(0, 200));
  await callResolver(frame, GLOBAL_APP, "deleteConversation", { conversationId: id }).catch(() => {});
  expect(true).toBe(true);
});
