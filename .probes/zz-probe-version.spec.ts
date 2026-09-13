// TESTER PROBE — v6.98.0 verification. Reads #version-indicator on the global page.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, assertLoggedIn, openGlobalPage, waitForChatApp } from "./chatwise-support";

const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 180_000 });

test("PROBE: version indicator", async ({ page, recorder }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  const v = await frame.locator("#version-indicator").textContent();
  console.log(`VERSION INDICATOR: "${(v || "").trim()}"`);
  expect((v || "").trim()).toContain("6.98.0");
});
