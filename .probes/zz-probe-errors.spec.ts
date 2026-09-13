// TESTER PROBE — v6.98.0 ITEM 6, model-free regressions:
//   the issue-panel 404 sentence, and TF at the BOTTOM of the project ranking.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { GLOBAL_APP, assertLoggedIn, openGlobalPage, waitForChatApp, callResolver } from "./chatwise-support";
const T = getTarget("chatwise-global");
test.describe.configure({ timeout: 300_000 });

test("PROBE errors: getIssueDetails on an unreadable issue says WHY", async ({ page }) => {
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T);
  await waitForChatApp(page, frame, GLOBAL_APP);
  for (const key of ["WFH-999999", "NOSUCHPROJ-1", "WFH-2539"]) {
    const r = await callResolver<any>(frame, GLOBAL_APP, "getIssueDetails", { issueKey: key });
    console.log(`getIssueDetails(${key}) -> ${JSON.stringify(r).slice(0, 500)}`);
    const msg = JSON.stringify(r);
    expect(msg, `the bare-statusText sentence is back for ${key}`).not.toMatch(/404 "\s*[,}]/);
    expect(msg, `"Failed to fetch issue: 404 " with nothing after it, for ${key}`)
      .not.toMatch(/Failed to fetch issue: \d+ ?["']/);
  }
});
