// TESTER re-verify — D1 on a USER-AUTHORED skill (editor opens with a body,
// Save succeeds, and the skill is still correct afterwards) + D8 import warnings.
import fs from "node:fs";
import path from "node:path";
import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, describeThread, openGlobalPage,
  sendMessage, setRecorderTarget, settleBootSelection, waitForChatApp, waitForThread,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester2";
const dump = (n: string, d: unknown) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(d, null, 2));

ftest.describe.configure({ retries: 0, timeout: 900_000 });

ftest("TESTER2: user skill editor round-trip + import warnings", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  await frame.locator("#skillsBtn").click();
  await page.waitForTimeout(1800);

  // ---- clean slate ----
  for (const id of ["tester-brand-probe", "tester-overcap"]) {
    console.log(`pre-delete ${id}:`, JSON.stringify(await callResolver(frame, GLOBAL_APP, "deleteSkill", { id })));
  }

  // ---- import a normal user skill through the UI ----
  await frame.locator(".skills-file-input").setInputFiles(path.join(OUT, "tester-brand-probe.zip"));
  await page.waitForTimeout(14000);
  const okNotice = await frame.locator("body").evaluate(() =>
    (document.querySelector(".skills-notice")?.textContent || "").replace(/\s+/g, " ").trim());
  console.log("CLEAN IMPORT NOTICE:", okNotice);

  // ---- D8: import a DROPPING archive and read the notice VERBATIM ----
  await frame.locator(".skills-file-input").setInputFiles(path.join(OUT, "tester-overcap.zip"));
  await page.waitForTimeout(16000);
  const warnNotice = await frame.locator("body").evaluate(() => ({
    text: (document.querySelector(".skills-notice")?.textContent || "").replace(/\s+/g, " ").trim(),
    cls: document.querySelector(".skills-notice")?.className || "",
  }));
  console.log("OVERCAP IMPORT NOTICE:", JSON.stringify(warnNotice, null, 2));
  dump("import_overcap_notice.json", warnNotice);
  await page.screenshot({ path: path.join(OUT, "import_overcap.png") });

  // the RAW route answer, so I can see what the UI was given
  const rawImport = await callResolver(frame, GLOBAL_APP, "getSkillContent", { id: "tester-overcap" });
  const oc = (rawImport as any)?.skill;
  console.log("OVERCAP STORED:", JSON.stringify({
    bodyLen: oc?.body?.length, refCount: oc?.references?.length,
    refs: (oc?.references || []).map((r: any) => ({ path: r.path, len: (r.text || "").length })),
  }, null, 2));
  dump("overcap_stored.json", rawImport);

  // ---- D1 in the UI: open the editor on the user skill ----
  await frame.locator('[data-act="back"]').first().click().catch(() => {});
  await page.waitForTimeout(800);
  await frame.locator('.skill-row[data-id="tester-brand-probe"] [data-act="edit"]').click();
  await page.waitForTimeout(6000);
  const before = await frame.locator("body").evaluate(() => {
    const host = document.querySelector('.skills-view[data-view="editor"]') as HTMLElement | null;
    if (!host) return { host: false };
    const val = (s: string) => (host.querySelector(s) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? null;
    return {
      host: true,
      id: val('[data-field="id"]'), name: val('[data-field="name"]'),
      description: val('[data-field="description"]'),
      bodyLen: (val('[data-field="body"]') || "").length,
      bodyHead: (val('[data-field="body"]') || "").slice(0, 120),
      counters: Array.from(host.querySelectorAll(".skills-counter, .skills-counter-static"))
        .map((e) => `${(e as HTMLElement).dataset.countFor || "static"}:${(e.textContent || "").trim()}/${(e as HTMLElement).dataset.max || ""}`),
      refBlocks: Array.from(host.querySelectorAll("[data-ref-index]")).map((bl) => ({
        path: (bl.querySelector('[data-field="ref-path"]') as HTMLInputElement | null)?.value ?? "(no input)",
        textLen: ((bl.querySelector('[data-field="ref-content"]') as HTMLTextAreaElement | null)?.value ?? "").length,
      })),
      loading: !!host.querySelector(".skills-body-loading"),
      bodyError: (host.querySelector(".skills-inline-error")?.textContent || "").trim(),
    };
  });
  dump("editor_user_before.json", before);
  console.log("EDITOR BEFORE SAVE:", JSON.stringify(before, null, 2));
  await page.screenshot({ path: path.join(OUT, "editor_user_before.png") });

  // ---- edit something TRIVIAL and SAVE ----
  const MARK = "\n\nTESTER-EDIT-MARKER-9134\n";
  await frame.locator('[data-field="body"]').evaluate((el, mark) => {
    const t = el as HTMLTextAreaElement;
    t.value = t.value + mark;
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }, MARK);
  await page.waitForTimeout(500);
  await frame.locator('.skills-view[data-view="editor"] [data-act="save"]').click();
  await page.waitForTimeout(7000);
  const after = await frame.locator("body").evaluate(() => ({
    stillInEditor: !!document.querySelector('.skills-view[data-view="editor"]'),
    notice: (document.querySelector(".skills-notice")?.textContent || "").replace(/\s+/g, " ").trim(),
    fieldErrors: Array.from(document.querySelectorAll(".skills-field-error, .skills-inline-error"))
      .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()),
  }));
  dump("editor_user_after.json", after);
  console.log("AFTER SAVE:", JSON.stringify(after, null, 2));
  await page.screenshot({ path: path.join(OUT, "editor_user_after.png") });

  // ---- is the skill STILL CORRECT? read it back through the route ----
  const reread = await callResolver(frame, GLOBAL_APP, "getSkillContent", { id: "tester-brand-probe" });
  const rs = (reread as any)?.skill;
  console.log("REREAD AFTER SAVE:", JSON.stringify({
    bodyLen: rs?.body?.length, hasMarker: (rs?.body || "").includes("TESTER-EDIT-MARKER-9134"),
    bytes: rs?.bytes, referenceCount: rs?.referenceCount,
    refs: (rs?.references || []).map((r: any) => ({ path: r.path, len: (r.text || "").length })),
  }, null, 2));
  dump("reread_after_save.json", reread);

  // ---- and does the MODEL still see it? quote from the body AND a reference ----
  await frame.locator('[data-act="close"]').first().click().catch(() => {});
  await page.waitForTimeout(800);
  await frame.locator("#newChatButton").click();
  await page.waitForTimeout(1500);
  await frame.locator("body").evaluate(() => (document.getElementById("personaDropdown") as HTMLElement)?.click());
  await page.waitForTimeout(600);
  await frame.locator("body").evaluate(() => {
    const opts = Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")) as HTMLElement[];
    (opts.find((o) => /coffee/i.test(o.textContent || "")) || opts[0])?.click();
  });
  await page.waitForTimeout(900);
  await sendMessage(page, frame,
    "Load the skill with id tester-brand-probe, then read its reference file references/colors.md. " +
    "Reply with exactly three lines: the hex code the skill gives for purple, the exact character " +
    "limit it states for CAPS headlines, and whether the SKILL.md body contains the string " +
    "TESTER-EDIT-MARKER-9134 (answer yes or no). Nothing else.");
  const t = await waitForThread(page, frame,
    (x) => x.length >= 2 && x[x.length - 1].role === "assistant" && !x[x.length - 1].streaming,
    { timeout: 420_000, interval: 3_000, label: "skill-read reply" });
  console.log("MODEL QUOTE THREAD:\n" + describeThread(t));
  dump("model_quote.json", t);

  expect(before.host).toBe(true);
});
