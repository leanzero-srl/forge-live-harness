// TESTER re-verify — D2 (the deck download exists, end to end) and D4 (attach on
// a LATER turn without rebuilding).
import fs from "node:fs";
import path from "node:path";
import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, describeThread, openGlobalPage,
  readAppState, sendMessage, setRecorderTarget, settleBootSelection, waitForChatApp,
  waitForThread, watchNoise,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester2";
const ISSUE = "WFH-2219";
const dump = (n: string, d: unknown) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(d, null, 2));

ftest.describe.configure({ retries: 0, timeout: 1_200_000 });

ftest("TESTER2: deck without an issue -> download; then attach without rebuild", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  const noise = watchNoise(page);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  await frame.locator("#newChatButton").click();
  await page.waitForTimeout(1500);
  await frame.locator("body").evaluate(() => (document.getElementById("personaDropdown") as HTMLElement)?.click());
  await page.waitForTimeout(700);
  const picked = await frame.locator("body").evaluate(() => {
    const opts = Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")) as HTMLElement[];
    const p = opts.find((o) => !/product|epic|owner/i.test(o.textContent || "")) || opts[0];
    p?.click();
    return (p?.textContent || "").trim();
  });
  console.log("PERSONA:", picked);
  await page.waitForTimeout(1000);
  const convId = await readAppState(frame, GLOBAL_APP, "app.state?.currentConversationId || app.currentConversationId || null");
  console.log("CONVERSATION:", convId);

  // instrument the bridge AND the blob download
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
    (window as any).__blobs = [];
    const oc = URL.createObjectURL.bind(URL);
    (URL as any).createObjectURL = (b: Blob) => { (window as any).__blobs.push(b); return oc(b); };
    const ac = HTMLAnchorElement.prototype.click;
    (window as any).__anchors = [];
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      (window as any).__anchors.push({ download: this.download, href: String(this.href).slice(0, 60) });
      return ac.call(this);
    };
  }, GLOBAL_APP);

  // ============ TURN 1 — build a deck with NO issue named ============
  await sendMessage(page, frame,
    'Create a diconium-branded PowerPoint deck titled "Tester Download Probe" with exactly four ' +
    'slides: a cover, a cards slide, a stats slide and a timeline slide, about a warehouse ' +
    'automation rollout. Do NOT attach it to any Jira issue — I only want to download it.');
  const t1 = await waitForThread(page, frame,
    (t) => t.length >= 2 && t[t.length - 1].role === "assistant" && !t[t.length - 1].streaming,
    { timeout: 600_000, interval: 3_000, label: "turn 1 (build, no issue)" });
  console.log("TURN 1:\n" + describeThread(t1));
  dump("t1_thread.json", t1);

  // --- the RAW job payload ---
  const calls1 = await frame.locator("body").evaluate(() => (window as any).__cwCalls || []);
  const js1 = (calls1 as any[]).filter((c) => c.m === "getJobStatus");
  const final1 = js1[js1.length - 1];
  dump("t1_jobstatus.json", final1);
  console.log("T1 result keys:", JSON.stringify(Object.keys(final1?.r?.data?.result || {})));
  console.log("T1 decks:", JSON.stringify(final1?.r?.data?.result?.decks, null, 2));

  // --- the DOM the user sees ---
  const ui1 = await frame.locator("body").evaluate(() => {
    const msgs = Array.from(document.querySelectorAll("#chatMessages .message"));
    const last = msgs[msgs.length - 1];
    if (!last) return null;
    return {
      deckRow: !!last.querySelector(".message-decks"),
      cards: Array.from(last.querySelectorAll(".deck-card")).map((c) => ({
        deckId: (c as HTMLElement).dataset.deckId,
        name: (c.querySelector(".deck-card-name")?.textContent || "").trim(),
        meta: (c.querySelector(".deck-card-meta")?.textContent || "").trim(),
        buttons: Array.from(c.querySelectorAll(".deck-btn")).map((b) => ({
          cls: b.className, text: (b.textContent || "").trim(), disabled: (b as HTMLButtonElement).disabled,
          title: (b as HTMLElement).title,
        })),
        note: (c.querySelector(".deck-card-note")?.textContent || "").trim(),
      })),
    };
  });
  dump("t1_ui.json", ui1);
  console.log("T1 UI:", JSON.stringify(ui1, null, 2));
  await page.screenshot({ path: path.join(OUT, "t1_deckcard.png"), fullPage: false });

  // --- CLICK the download button ---
  if (ui1?.cards?.length) {
    await page.waitForTimeout(3000); // let the fetch arm it
    const btn = frame.locator(".deck-card .deck-btn.solid").first();
    console.log("button before click:", await btn.textContent(), await btn.getAttribute("class"));
    const dl = page.waitForEvent("download", { timeout: 25_000 }).catch(() => null);
    await btn.click();
    await page.waitForTimeout(4000);
    const download = await dl;
    if (download) {
      const p = path.join(OUT, "downloaded.pptx");
      await download.saveAs(p);
      console.log("DOWNLOAD EVENT:", download.suggestedFilename(), fs.statSync(p).size, "bytes");
    } else {
      console.log("NO playwright download event fired");
    }
    const anchors = await frame.locator("body").evaluate(() => (window as any).__anchors || []);
    console.log("ANCHOR CLICKS:", JSON.stringify(anchors));
    // belt and braces: read the blob the app made, straight off the page
    const b64 = await frame.locator("body").evaluate(async () => {
      const blobs = (window as any).__blobs || [];
      const b = blobs[blobs.length - 1];
      if (!b) return null;
      const buf = await b.arrayBuffer();
      let s = ""; const u = new Uint8Array(buf);
      for (let i = 0; i < u.length; i += 1) s += String.fromCharCode(u[i]);
      return { size: u.length, type: b.type, b64: btoa(s) };
    });
    if (b64) {
      fs.writeFileSync(path.join(OUT, "blob.pptx"), Buffer.from(b64.b64, "base64"));
      console.log("BLOB CAPTURED:", b64.size, "bytes, type:", b64.type);
    } else {
      console.log("NO blob was created by the app");
    }
    console.log("button after click:", await btn.textContent(), await btn.getAttribute("class"));
  }

  // ============ TURN 2 — attach that same deck, do not rebuild ============
  await sendMessage(page, frame,
    `Attach that same deck to ${ISSUE}. Do not rebuild it — use the deck you already made.`);
  const t2 = await waitForThread(page, frame,
    (t) => t.length >= 4 && t[t.length - 1].role === "assistant" && !t[t.length - 1].streaming,
    { timeout: 600_000, interval: 3_000, label: "turn 2 (attach, no rebuild)" });
  console.log("TURN 2:\n" + describeThread(t2));
  dump("t2_thread.json", t2);

  const calls2 = await frame.locator("body").evaluate(() => (window as any).__cwCalls || []);
  const js2 = (calls2 as any[]).filter((c) => c.m === "getJobStatus");
  const final2 = js2[js2.length - 1];
  dump("t2_jobstatus.json", final2);
  console.log("T2 result keys:", JSON.stringify(Object.keys(final2?.r?.data?.result || {})));
  console.log("T2 decks:", JSON.stringify(final2?.r?.data?.result?.decks, null, 2));
  console.log("T2 toolCalls:", JSON.stringify(final2?.r?.data?.result?.toolCalls ?? final2?.r?.data?.result?.toolsUsed ?? null));

  const ui2 = await frame.locator("body").evaluate(() => {
    const msgs = Array.from(document.querySelectorAll("#chatMessages .message"));
    const last = msgs[msgs.length - 1];
    return {
      deckRow: !!last?.querySelector(".message-decks"),
      cards: Array.from(last?.querySelectorAll(".deck-card") || []).map((c) => ({
        name: (c.querySelector(".deck-card-name")?.textContent || "").trim(),
        meta: (c.querySelector(".deck-card-meta")?.textContent || "").trim(),
        buttons: Array.from(c.querySelectorAll(".deck-btn")).map((b) => (b.textContent || "").trim()),
      })),
    };
  });
  dump("t2_ui.json", ui2);
  console.log("T2 UI:", JSON.stringify(ui2, null, 2));

  dump("noise_04.json", { errors: noise.consoleErrors, pageErrors: noise.pageErrors, failed: noise.failedRequests });
  expect(t1.length).toBeGreaterThanOrEqual(2);
});
