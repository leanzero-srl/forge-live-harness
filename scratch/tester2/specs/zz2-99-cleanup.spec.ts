import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, openGlobalPage,
  setRecorderTarget, settleBootSelection, waitForChatApp,
} from "./chatwise-support";
const T = getTarget("chatwise-global");
ftest.describe.configure({ retries: 0, timeout: 300_000 });
ftest("TESTER2: restore fixtures", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  for (const id of ["tester-brand-probe", "tester-overcap"]) {
    console.log(`delete ${id}:`, JSON.stringify(await callResolver(frame, GLOBAL_APP, "deleteSkill", { id })));
  }
  const rows: any = await callResolver(frame, GLOBAL_APP, "getSkills");
  console.log("FINAL ROSTER:", JSON.stringify(rows.skills.map((r: any) => ({
    id: r.id, vis: r.visibility, builtin: r.builtin, enabled: r.enabled, refs: r.referenceCount, bytes: r.bytes,
  })), null, 2));
  console.log("FINAL policy:", JSON.stringify(await callResolver(frame, GLOBAL_APP, "getToolPolicy")));
  console.log("FINAL testMode:", JSON.stringify(await callResolver(frame, GLOBAL_APP, "getTestMode")));
  expect(rows.skills.length).toBe(2);
});
