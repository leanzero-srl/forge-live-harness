import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, openGlobalPage, openPanel, waitForChatApp, PANEL_APP } from "./chatwise-support";
const T = getTarget("chatwise-global");
const P = getTarget("chatwise-issue-panel");
test("VERSION MARKERS IN THE DOM, right now", async ({ page }) => {
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  console.log(`GLOBAL PAGE MARKER: ${(await frame.locator("#version-indicator").innerText()).trim()} at ${new Date().toISOString()}`);
  try {
    const pf = await openPanel(page, P, "WFH-2197");
    await waitForChatApp(page, pf, PANEL_APP);
    console.log(`ISSUE PANEL MARKER: ${(await pf.locator("#version-indicator").innerText()).trim()}`);
  } catch (e: any) { console.log(`panel read failed: ${String(e).slice(0, 200)}`); }
  expect(true).toBe(true);
});
