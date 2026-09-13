// TESTER — WHY does createPresentation still run twice? Make the model report
// the tool's own refusal verbatim.
import fs from "node:fs";
import path from "node:path";
import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, describeThread, openGlobalPage,
  sendMessage, setRecorderTarget, settleBootSelection, waitForChatApp, waitForThread,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester2";

ftest.describe.configure({ retries: 0, timeout: 900_000 });

ftest("TESTER2: what does createPresentation refuse on the first attempt", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  await frame.locator("#newChatButton").click();
  await page.waitForTimeout(1500);
  await frame.locator("body").evaluate(() => (document.getElementById("personaDropdown") as HTMLElement)?.click());
  await page.waitForTimeout(700);
  await frame.locator("body").evaluate(() => {
    const opts = Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")) as HTMLElement[];
    (opts.find((o) => !/product|epic|owner/i.test(o.textContent || "")) || opts[0])?.click();
  });
  await page.waitForTimeout(1000);

  await sendMessage(page, frame,
    'Create a two-slide diconium deck titled "Slot Diagnostic": a cover and a section divider, ' +
    'about anything. Do NOT attach it to any issue. Then, in your reply, quote VERBATIM every ' +
    'error or refusal message any tool returned to you during this turn, and say how many times ' +
    'you called createPresentation and what slot names you used on each attempt. Be exact.');
  const t = await waitForThread(page, frame,
    (x) => x.length >= 2 && x[x.length - 1].role === "assistant" && !x[x.length - 1].streaming,
    { timeout: 600_000, interval: 3_000, label: "slot diagnostic" });
  console.log("DIAG THREAD:\n" + describeThread(t));
  fs.writeFileSync(path.join(OUT, "slotdiag.json"), JSON.stringify(t, null, 2));
  console.log("FULL REPLY:\n" + (t[t.length - 1]?.text || ""));
  expect(t.length).toBeGreaterThanOrEqual(2);
});
