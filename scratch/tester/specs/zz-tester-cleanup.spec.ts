import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, openGlobalPage, setRecorderTarget, settleBootSelection, waitForChatApp } from "./chatwise-support";
const T = getTarget("chatwise-global");
ftest.describe.configure({ retries: 0, timeout: 300_000 });
ftest("TESTER: restore fixtures", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  for (const id of ["tester-brand-probe", "tester-spoof-probe"]) {
    console.log(`delete ${id}:`, JSON.stringify(await callResolver(frame, GLOBAL_APP, "deleteSkill", { id })));
  }
  console.log("reset built-ins:", JSON.stringify(await callResolver(frame, GLOBAL_APP, "resetBuiltinSkill")));
  const rows = await callResolver(frame, GLOBAL_APP, "getSkills");
  console.log("FINAL ROSTER:", JSON.stringify((rows as any).skills.map((r: any) => ({ id: r.id, vis: r.visibility, builtin: r.builtin, enabled: r.enabled }))));
  console.log("FINAL policy:", JSON.stringify(await callResolver(frame, GLOBAL_APP, "getToolPolicy")));
  console.log("FINAL testMode:", JSON.stringify(await callResolver(frame, GLOBAL_APP, "getTestMode")));
  expect(1).toBe(1);
});
