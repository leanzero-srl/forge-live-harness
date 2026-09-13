// TESTER re-verify — D3: build a deck NAMING an issue. Exactly one attachment,
// no blank slides.
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
const ISSUE = "WFH-2218";
const dump = (n: string, d: unknown) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(d, null, 2));

ftest.describe.configure({ retries: 0, timeout: 1_200_000 });

ftest("TESTER2: deck named to an issue attaches exactly once", async ({ page, recorder }) => {
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

  await frame.locator("body").evaluate((_e, key) => {
    const api = (window as any)[key].services.forgeAPI;
    (window as any).__cwCalls = [];
    if (!(api as any).__wrapped) {
      const orig = api.call.bind(api);
      api.call = async (m: string, p: any) => {
        const r = await orig(m, p);
        try { (window as any).__cwCalls.push({ m, p, r: JSON.parse(JSON.stringify(r)) }); } catch { /* */ }
        return r;
      };
      (api as any).__wrapped = true;
    }
  }, GLOBAL_APP);

  await sendMessage(page, frame,
    'Create a diconium-branded PowerPoint deck titled "Tester Attach Probe" with exactly five ' +
    'slides: a cover, a section divider, a cards slide, a stats slide and a timeline slide, about ' +
    `a customer data platform migration. Attach it to ${ISSUE}.`);
  const t = await waitForThread(page, frame,
    (x) => x.length >= 2 && x[x.length - 1].role === "assistant" && !x[x.length - 1].streaming,
    { timeout: 600_000, interval: 3_000, label: "deck + attach turn" });
  console.log("THREAD:\n" + describeThread(t));
  dump("t3_thread.json", t);

  const calls = await frame.locator("body").evaluate(() => (window as any).__cwCalls || []);
  const js = (calls as any[]).filter((c) => c.m === "getJobStatus");
  const fin = js[js.length - 1];
  dump("t3_jobstatus.json", fin);
  console.log("T3 decks:", JSON.stringify(fin?.r?.data?.result?.decks, null, 2));

  const ui = await frame.locator("body").evaluate(() => {
    const msgs = Array.from(document.querySelectorAll("#chatMessages .message"));
    const last = msgs[msgs.length - 1];
    return {
      cards: Array.from(last?.querySelectorAll(".deck-card") || []).map((c) => ({
        name: (c.querySelector(".deck-card-name")?.textContent || "").trim(),
        meta: (c.querySelector(".deck-card-meta")?.textContent || "").trim(),
        buttons: Array.from(c.querySelectorAll(".deck-btn")).map((b) => (b.textContent || "").trim()),
      })),
    };
  });
  dump("t3_ui.json", ui);
  console.log("T3 UI:", JSON.stringify(ui, null, 2));
  await page.screenshot({ path: path.join(OUT, "t3_deckcard.png") });
  expect(t.length).toBeGreaterThanOrEqual(2);
});
