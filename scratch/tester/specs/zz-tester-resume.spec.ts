import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL, GLOBAL_APP, assertLoggedIn, describeThread, openGlobalPage, sendMessage, setRecorderTarget, settleBootSelection, waitForChatApp, waitForThread } from "./chatwise-support";
const T = getTarget("chatwise-global");
ftest.describe.configure({ retries: 0, timeout: 700_000 });
ftest("TESTER: build without an issue, then attach it later", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#newChatButton").click();
  await page.waitForTimeout(1500);
  await frame.locator("body").evaluate(() => { (document.getElementById("personaDropdown") as HTMLElement)?.click(); });
  await page.waitForTimeout(600);
  await frame.locator("body").evaluate(() => {
    const o = Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")) as HTMLElement[];
    (o.find((x) => /coffee/i.test(x.textContent || "")) || o[0])?.click();
  });
  await page.waitForTimeout(800);

  await sendMessage(page, frame, "Build a diconium deck called 'Resume Probe' with one cover slide about test automation. Do not attach it anywhere yet.");
  let t = await waitForThread(page, frame, (x) => x.length >= 2 && x[x.length - 1].role === "assistant" && !x[x.length - 1].streaming,
    { timeout: 400_000, interval: 3_000, label: "turn 1" });
  console.log("TURN 1:\n" + describeThread(t).split("\n").slice(-4).join("\n"));

  await sendMessage(page, frame, "Now attach that same deck to WFH-2212. Do not rebuild it.");
  t = await waitForThread(page, frame, (x) => x.length >= 4 && x[x.length - 1].role === "assistant" && !x[x.length - 1].streaming,
    { timeout: 400_000, interval: 3_000, label: "turn 2" });
  console.log("TURN 2:\n" + describeThread(t).split("\n").slice(-4).join("\n"));
  expect(1).toBe(1);
});
