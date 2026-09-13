// TESTER probe — does the skill EDITOR show the skill, and what does Save do?
import fs from "node:fs";
import path from "node:path";
import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, describeThread, openGlobalPage, readAppState,
  sendMessage, setRecorderTarget, settleBootSelection, waitForChatApp, waitForThread,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester";
const dump = (n: string, d: unknown) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(d, null, 2));

ftest.describe.configure({ retries: 0, timeout: 600_000 });

ftest("TESTER: editor round-trip + does the skill body really exist", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  // CONTROL: the BUILT-IN reads back the same way?
  const builtin = await callResolver(frame, GLOBAL_APP, "getSkillContent", { id: "diconium-brand" });
  const b = (builtin as any)?.skill;
  console.log("BUILTIN getSkillContent:", JSON.stringify({
    bodyLen: b?.body?.length, refs: b?.references, bytes: b?.bytes,
  }, null, 2));

  // PROOF THE DATA IS REALLY THERE: make the model load the imported skill and
  // read one of its reference files. If it can quote them, the WRITE was fine
  // and only the read route is broken.
  await frame.locator("#newChatButton").click();
  await page.waitForTimeout(1500);
  await frame.locator("body").evaluate(() => {
    (document.getElementById("personaDropdown") as HTMLElement)?.click();
  });
  await page.waitForTimeout(600);
  await frame.locator("body").evaluate(() => {
    const opts = Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")) as HTMLElement[];
    (opts.find((o) => /coffee/i.test(o.textContent || "")) || opts[0])?.click();
  });
  await page.waitForTimeout(800);

  await sendMessage(page, frame,
    "Load the skill with id tester-brand-probe, then read its reference file references/colors.md. " +
    "Reply with exactly two lines: the hex code the skill gives for purple, and the exact character " +
    "limit it states for CAPS headlines. Nothing else.");
  const t = await waitForThread(page, frame,
    (x) => x.length >= 2 && x[x.length - 1].role === "assistant" && !x[x.length - 1].streaming,
    { timeout: 400_000, interval: 3_000, label: "skill-read reply" });
  console.log("SKILL READ THREAD:\n" + describeThread(t));
  dump("skillread.json", t);

  // ---- now the EDITOR, through the UI, on my own scratch skill ----
  await frame.locator("#skillsBtn").click();
  await page.waitForTimeout(1500);
  await frame.locator('.skill-row[data-id="tester-brand-probe"] [data-act="edit"]').click();
  await page.waitForTimeout(4000);
  const editorState = await frame.locator("body").evaluate(() => {
    const host = document.querySelector('.skills-view[data-view="editor"]') as HTMLElement | null;
    if (!host) return { host: false };
    const val = (sel: string) => (host.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? null;
    return {
      host: true,
      id: val('[data-field="id"]'),
      name: val('[data-field="name"]'),
      description: val('[data-field="description"]'),
      bodyLen: (val('[data-field="body"]') || "").length,
      bodyHead: (val('[data-field="body"]') || "").slice(0, 120),
      refBlocks: Array.from(host.querySelectorAll("[data-ref-index]")).map((bl) => ({
        path: (bl.querySelector('[data-field="ref-path"]') as HTMLInputElement | null)?.value ?? "(binary/no input)",
        textLen: ((bl.querySelector('[data-field="ref-content"]') as HTMLTextAreaElement | null)?.value ?? "").length,
      })),
      loadingMarker: host.innerHTML.includes("loading") || host.innerHTML.includes("Loading"),
    };
  });
  dump("editor.json", editorState);
  console.log("EDITOR STATE:", JSON.stringify(editorState, null, 2));
  await page.screenshot({ path: path.join(OUT, "editor.png"), fullPage: false });

  // ---- press SAVE and see what survives (my own scratch skill) ----
  const saveSel = '.skills-view[data-view="editor"] [data-act="save"], .skills-view[data-view="editor"] button.primary';
  const saveCount = await frame.locator(saveSel).count();
  console.log("save buttons found:", saveCount);
  if (saveCount) {
    await frame.locator(saveSel).first().click();
    await page.waitForTimeout(5000);
    const notice = await frame.locator("body").evaluate(() =>
      (document.querySelector(".skills-notice")?.textContent || "").replace(/\s+/g, " ").trim());
    console.log("SAVE NOTICE:", notice);
  }
  const afterSave = await callResolver(frame, GLOBAL_APP, "getSkills");
  const row = (afterSave as any)?.skills?.find((r: any) => r.id === "tester-brand-probe");
  console.log("ROW AFTER SAVE:", JSON.stringify(row, null, 2));
  dump("rowAfterSave.json", row);
  expect(1).toBe(1);
});
