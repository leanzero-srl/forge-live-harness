// TESTER — what state is tester-brand-probe in after the editor Save?
import fs from "node:fs";
import path from "node:path";
import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, describeThread, openGlobalPage,
  sendMessage, setRecorderTarget, settleBootSelection, waitForChatApp, waitForThread,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester";
ftest.describe.configure({ retries: 0, timeout: 600_000 });

ftest("TESTER: post-save damage assessment", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  const rows = await callResolver(frame, GLOBAL_APP, "getSkills");
  fs.writeFileSync(path.join(OUT, "rows_now.json"), JSON.stringify(rows, null, 2));
  console.log("ROWS NOW:", JSON.stringify((rows as any).skills.map((r: any) => ({
    id: r.id, vis: r.visibility, refs: r.referenceCount, assets: r.assetCount, upd: r.updatedAt })), null, 2));

  await frame.locator("#newChatButton").click();
  await page.waitForTimeout(1500);
  await frame.locator("body").evaluate(() => { (document.getElementById("personaDropdown") as HTMLElement)?.click(); });
  await page.waitForTimeout(600);
  await frame.locator("body").evaluate(() => {
    const o = Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")) as HTMLElement[];
    (o.find((x) => /coffee/i.test(x.textContent || "")) || o[0])?.click();
  });
  await page.waitForTimeout(800);

  await sendMessage(page, frame,
    "Load the skill with id tester-brand-probe and tell me, in one short line, what its body text says " +
    "about the CAPS character limit, and list the reference files it has. If the body is empty or there " +
    "are no references, say exactly: EMPTY.");
  const t = await waitForThread(page, frame,
    (x) => x.length >= 2 && x[x.length - 1].role === "assistant" && !x[x.length - 1].streaming,
    { timeout: 400_000, interval: 3_000, label: "post-save skill read" });
  console.log("POST-SAVE READ:\n" + describeThread(t));
  fs.writeFileSync(path.join(OUT, "postsave.json"), JSON.stringify(t, null, 2));
  expect(1).toBe(1);
});
