import fs from "node:fs"; import path from "node:path";
import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, describeThread, openGlobalPage, sendMessage, setRecorderTarget, settleBootSelection, waitForChatApp, waitForThread } from "./chatwise-support";
const T = getTarget("chatwise-global");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester";
ftest.describe.configure({ retries: 0, timeout: 600_000 });

ftest("TESTER: deck with NO issue named (German) + ownership spoof probes", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  // --- the payload-injection the routes' own comment claims is closed ---
  console.log("saveSkill w/ spoofed ownerAccountId:", JSON.stringify(await callResolver(frame, GLOBAL_APP, "saveSkill", {
    skill: { id: "tester-spoof-probe", name: "spoof", description: "a probe that checks the owner is taken from the session, not the payload", body: "# spoof\n\nnothing useful here." },
    ownerAccountId: "712020:0000-not-me",
  })));
  const after = await callResolver(frame, GLOBAL_APP, "getSkills");
  const spoof = (after as any)?.skills?.find((r: any) => r.id === "tester-spoof-probe");
  console.log("SPOOF ROW:", JSON.stringify(spoof));

  // --- German, no issue named ---
  await frame.locator("#newChatButton").click();
  await page.waitForTimeout(1500);
  await frame.locator("body").evaluate(() => { (document.getElementById("personaDropdown") as HTMLElement)?.click(); });
  await page.waitForTimeout(600);
  await frame.locator("body").evaluate(() => {
    const o = Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")) as HTMLElement[];
    (o.find((x) => /coffee/i.test(x.textContent || "")) || o[0])?.click();
  });
  await page.waitForTimeout(800);

  await frame.locator("body").evaluate((_e, key) => {
    const api = (window as any)[key].services.forgeAPI;
    (window as any).__cwCalls = [];
    if (!api.__wrapped) { const o = api.call.bind(api); api.call = async (m: string, p: any) => { const r = await o(m, p); try { (window as any).__cwCalls.push({ m, r: JSON.parse(JSON.stringify(r)) }); } catch {} return r; }; api.__wrapped = true; }
  }, GLOBAL_APP);

  await sendMessage(page, frame,
    "Erstelle bitte eine PowerPoint-Präsentation im diconium-Design mit zwei Folien (cover und stats) " +
    "über unsere Cloud-Migration. Nenne kein Jira-Ticket — ich möchte die Datei nur herunterladen.");
  const t = await waitForThread(page, frame,
    (x) => x.length >= 2 && x[x.length - 1].role === "assistant" && !x[x.length - 1].streaming,
    { timeout: 400_000, interval: 3_000, label: "German no-issue deck reply" });
  console.log("GERMAN THREAD:\n" + describeThread(t));

  const ui = await frame.locator("body").evaluate(() => {
    const m = Array.from(document.querySelectorAll("#chatMessages .message"));
    const last = m[m.length - 1];
    return {
      chips: Array.from(last.querySelectorAll(".message-meta-chip")).map((c) => (c.textContent || "").trim()),
      deckRow: !!last.querySelector(".message-decks"),
      deckCards: last.querySelectorAll(".deck-card").length,
      anyDownloadControl: last.querySelectorAll("a[download], .deck-btn").length,
      fullText: (last.querySelector(".message-bubble")?.textContent || "").replace(/\s+/g, " ").trim(),
    };
  });
  console.log("GERMAN UI:", JSON.stringify(ui, null, 2));
  fs.writeFileSync(path.join(OUT, "german.json"), JSON.stringify({ thread: t, ui }, null, 2));
  const calls = await frame.locator("body").evaluate(() => (window as any).__cwCalls || []);
  const last = (calls as any[]).filter((c) => c.m === "getJobStatus").pop();
  console.log("decks field:", JSON.stringify(last?.r?.data?.result?.decks), "skillsUsed:", JSON.stringify(last?.r?.data?.result?.skillsUsed));
  expect(1).toBe(1);
});
