// TESTER PROBE — confirm the DEPLOYED version from the DOM before anything else.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";

test("deployed version marker in the DOM", async ({ page }) => {
  test.setTimeout(300_000);
  const T = getTarget("chatwise-global");
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const v = (await frame.locator("#version-indicator").textContent())?.replace(/\s+/g, " ").trim();
  console.log("VERSION-INDICATOR:", JSON.stringify(v));
  const pol: any = await callResolver(frame, GLOBAL_APP, "getToolPolicy", {});
  console.log("TOOL-POLICY:", JSON.stringify(pol));
  expect(v).toContain("v6.95.0");
});
