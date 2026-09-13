// TESTER re-verify — D8: does the UI actually SAY something was truncated?
// The "ok" notice self-dismisses after 6s, so this OBSERVES it instead of
// sampling once.
import fs from "node:fs";
import path from "node:path";
import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, openGlobalPage,
  setRecorderTarget, settleBootSelection, waitForChatApp,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester2";
const dump = (n: string, d: unknown) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(d, null, 2));

ftest.describe.configure({ retries: 0, timeout: 600_000 });

ftest("TESTER2: import warnings reach the user", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  await frame.locator("#skillsBtn").click();
  await page.waitForTimeout(1800);
  console.log("pre-delete tester-overcap:",
    JSON.stringify(await callResolver(frame, GLOBAL_APP, "deleteSkill", { id: "tester-overcap" })));
  await page.waitForTimeout(1500);

  // RECORD every notice the strip ever shows
  await frame.locator("body").evaluate(() => {
    const host = document.querySelector(".skills-notice");
    (window as any).__notices = [];
    if (!host) return;
    new MutationObserver(() => {
      const t = (host.textContent || "").replace(/\s+/g, " ").trim();
      const c = host.className;
      const arr = (window as any).__notices;
      if (t && (!arr.length || arr[arr.length - 1].text !== t)) arr.push({ text: t, cls: c, at: Date.now() });
    }).observe(host, { childList: true, subtree: true, characterData: true, attributes: true });
  });

  // ALSO capture the raw route answer the UI was handed
  await frame.locator("body").evaluate((_e, key) => {
    const api = (window as any)[key].services.forgeAPI;
    (window as any).__imp = [];
    if (!(api as any).__impWrapped) {
      const orig = api.call.bind(api);
      api.call = async (m: string, p: any) => {
        const r = await orig(m, p);
        if (m === "importSkillArchive") {
          try { (window as any).__imp.push(JSON.parse(JSON.stringify(r))); } catch { /* */ }
        }
        return r;
      };
      (api as any).__impWrapped = true;
    }
  }, GLOBAL_APP);

  await frame.locator(".skills-file-input").setInputFiles(path.join(OUT, "tester-overcap.zip"));

  // poll the observer for up to 60s
  let notices: any[] = [];
  for (let i = 0; i < 60; i += 1) {
    notices = await frame.locator("body").evaluate(() => (window as any).__notices || []);
    if (notices.some((n: any) => /is-ok|is-error/.test(n.cls))) break;
    await page.waitForTimeout(1000);
  }
  dump("import_notices.json", notices);
  console.log("ALL NOTICES:", JSON.stringify(notices, null, 2));

  const raw = await frame.locator("body").evaluate(() => (window as any).__imp || []);
  dump("import_raw_route.json", raw);
  console.log("RAW importSkillArchive ANSWER:", JSON.stringify(raw, null, 2));

  const stored = await callResolver(frame, GLOBAL_APP, "getSkillContent", { id: "tester-overcap" });
  const s = (stored as any)?.skill;
  console.log("STORED:", JSON.stringify({
    bodyLen: s?.body?.length, refCount: (s?.references || []).length,
    refs: (s?.references || []).map((r: any) => ({ path: r.path, len: (r.text || "").length })),
  }, null, 2));

  expect(notices.length).toBeGreaterThan(0);
});
