// TESTER probe — does a deck actually render in Forge, and do the skills routes work?
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, describeThread,
  openGlobalPage, readAppState, readThread, sendMessage, setRecorderTarget,
  settleBootSelection, waitForChatApp, waitForThread, watchNoise,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester";
const ISSUE = "WFH-2212";

const dump = (name: string, data: unknown) =>
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(data, null, 2));

test.describe.configure({ retries: 0, timeout: 600_000 });

test("TESTER: deck renders in Forge + skills routes", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  const noise = watchNoise(page);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  // FRESH conversation on a NON-Epic-Facilitator persona: an existing thread
  // routes into the Epic wizard, which has no tools at all.
  await frame.locator("#newChatButton").click();
  await page.waitForTimeout(1500);
  const personas = await frame.locator("body").evaluate(() => {
    const dd = document.getElementById("personaDropdown") as HTMLElement | null;
    dd?.click();
    return Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")).map((el) => ({
      id: (el as HTMLElement).dataset.personaId || "", label: (el.textContent || "").trim(),
      selected: el.className.includes("selected"),
    }));
  });
  console.log("PERSONAS:", JSON.stringify(personas));
  await page.waitForTimeout(500);
  await frame.locator("body").evaluate(() => {
    const opts = Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")) as HTMLElement[];
    const pick = opts.find((o) => !/product|epic|owner/i.test(o.textContent || "")) || opts[0];
    pick?.click();
  });
  await page.waitForTimeout(1000);
  const activePersona = await readAppState(frame, GLOBAL_APP, "app.services.persona?.getSelectedPersonaId?.() || null");
  console.log("ACTIVE PERSONA:", activePersona);

  // --- which build am I actually testing?
  const version = await frame.locator("body").evaluate(() => {
    const el = Array.from(document.querySelectorAll("div")).find((d) =>
      /^v\d+\.\d+\.\d+$/.test((d.textContent || "").trim()));
    return el ? (el.textContent || "").trim() : "(no version chip)";
  });
  console.log("VERSION CHIP:", version);

  const testMode = await callResolver(frame, GLOBAL_APP, "getTestMode");
  console.log("TEST MODE:", JSON.stringify(testMode));

  const policy = await callResolver(frame, GLOBAL_APP, "getToolPolicy");
  dump("policy.json", policy);
  console.log("POLICY:", JSON.stringify(policy));

  const skills = await callResolver(frame, GLOBAL_APP, "getSkills");
  dump("skills.json", skills);
  console.log("SKILLS:", JSON.stringify(skills).slice(0, 2000));

  // --- instrument the bridge so I see the RAW getJobStatus payload
  await frame.locator("body").evaluate((_e, key) => {
    const app = (window as any)[key];
    const api = app.services.forgeAPI;
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

  const prompt =
    `Create a diconium-branded PowerPoint deck titled "Tester Probe Deck" with exactly four slides: ` +
    `a cover, a cards slide, a stats slide and a timeline slide, about a platform migration. ` +
    `Attach it to ${ISSUE}. Use the createPresentation tool.`;
  await sendMessage(page, frame, prompt);

  const thread = await waitForThread(page, frame,
    (t) => t.length >= 2 && t[t.length - 1].role === "assistant" && !t[t.length - 1].streaming,
    { timeout: 420_000, interval: 3_000, label: "assistant reply to the deck request" });
  console.log("THREAD:\n" + describeThread(thread));
  dump("thread.json", thread);

  // --- everything the user can see on that last message
  const ui = await frame.locator("body").evaluate(() => {
    const msgs = Array.from(document.querySelectorAll("#chatMessages .message"));
    const last = msgs[msgs.length - 1];
    if (!last) return null;
    return {
      metaChips: Array.from(last.querySelectorAll(".message-meta-chip")).map((c) => ({
        cls: c.className, text: (c.textContent || "").trim(), title: (c as HTMLElement).title,
      })),
      deckRowPresent: !!last.querySelector(".message-decks"),
      deckCards: Array.from(last.querySelectorAll(".deck-card")).map((c) => ({
        name: (c.querySelector(".deck-card-name")?.textContent || "").trim(),
        meta: (c.querySelector(".deck-card-meta")?.textContent || "").trim(),
        buttons: Array.from(c.querySelectorAll(".deck-btn")).map((b) => (b.textContent || "").trim()),
        note: (c.querySelector(".deck-card-note")?.textContent || "").trim(),
      })),
      html: (last.querySelector(".message-body") as HTMLElement)?.innerHTML?.slice(0, 4000) || "",
    };
  });
  dump("ui.json", ui);
  console.log("UI:", JSON.stringify({ ...ui, html: undefined }, null, 2));

  const calls = await frame.locator("body").evaluate(() => (window as any).__cwCalls || []);
  const jobStatuses = (calls as any[]).filter((c) => c.m === "getJobStatus");
  dump("jobStatuses.json", jobStatuses.slice(-4));
  const finalJob = jobStatuses[jobStatuses.length - 1];
  console.log("FINAL getJobStatus RESULT KEYS:", finalJob ? Object.keys(finalJob.r?.data?.result || {}) : "(none)");
  console.log("skillsUsed:", JSON.stringify(finalJob?.r?.data?.result?.skillsUsed));
  console.log("decks:", JSON.stringify(finalJob?.r?.data?.result?.decks));

  // --- getDeckContent with a garbage handle: does the route exist and refuse?
  const bogus = await callResolver(frame, GLOBAL_APP, "getDeckContent", { handle: "deck_not_a_real_handle" });
  console.log("getDeckContent(bogus):", JSON.stringify(bogus));
  dump("deckBogus.json", bogus);

  dump("noise.json", { errors: noise.consoleErrors, pageErrors: noise.pageErrors, failed: noise.failedRequests });
  expect(thread.length).toBeGreaterThanOrEqual(2);
});
