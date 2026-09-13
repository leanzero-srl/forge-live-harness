// TESTER — after an editor SAVE, can the TURN PATH still read the skill?
// readSkillFull (editor) and loadSkillForTurn (model) are two different readers
// of the same KVS parts; a save that only one can read back is still a defect.
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

ftest.describe.configure({ retries: 0, timeout: 900_000 });

ftest("TESTER2: the model can still read a skill that was saved through the editor", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  try {
    await frame.locator("#skillsBtn").click();
    await page.waitForTimeout(1800);
    await callResolver(frame, GLOBAL_APP, "deleteSkill", { id: "tester-brand-probe" });
    await page.waitForTimeout(1000);
    await frame.locator(".skills-file-input").setInputFiles(path.join(OUT, "tester-brand-probe.zip"));
    await page.waitForTimeout(15000);

    await frame.locator('.skill-row[data-id="tester-brand-probe"] [data-act="edit"]').click();
    await page.waitForTimeout(6000);
    const MARK = "\n\nThe tester canary phrase is BLUE-OTTER-7741.\n";
    await frame.locator('[data-field="body"]').evaluate((el, mark) => {
      const t = el as HTMLTextAreaElement;
      t.value = t.value + mark;
      t.dispatchEvent(new Event("input", { bubbles: true }));
    }, MARK);
    await page.waitForTimeout(400);
    await frame.locator('.skills-view[data-view="editor"] [data-act="save"]').click();
    await page.waitForTimeout(6000);
    console.log("SAVE NOTICE:", await frame.locator("body").evaluate(() =>
      (document.querySelector(".skills-notice")?.textContent || "").replace(/\s+/g, " ").trim()));

    await frame.locator("#skillsModal .modal-close").click();
    await page.waitForTimeout(1200);
    await frame.locator("#newChatButton").click();
    await page.waitForTimeout(1500);
    await frame.locator("body").evaluate(() => (document.getElementById("personaDropdown") as HTMLElement)?.click());
    await page.waitForTimeout(700);
    await frame.locator("body").evaluate(() => {
      const opts = Array.from(document.querySelectorAll("#dropdownOptions .dropdown-option")) as HTMLElement[];
      (opts.find((o) => /coffee/i.test(o.textContent || "")) || opts[0])?.click();
    });
    await page.waitForTimeout(900);

    await sendMessage(page, frame,
      "Load the skill with id tester-brand-probe. Then read its reference file references/colors.md. " +
      "Reply with exactly three lines and nothing else: (1) the tester canary phrase written in the " +
      "SKILL.md body, (2) the hex code the skill gives for purple, (3) the character limit it states " +
      "for CAPS headlines.");
    const t = await waitForThread(page, frame,
      (x) => x.length >= 2 && x[x.length - 1].role === "assistant" && !x[x.length - 1].streaming,
      { timeout: 500_000, interval: 3_000, label: "model quote after save" });
    console.log("THREAD:\n" + describeThread(t));
    console.log("FULL REPLY:\n" + (t[t.length - 1]?.text || ""));
    fs.writeFileSync(path.join(OUT, "model_quote_after_save.json"), JSON.stringify(t, null, 2));
    expect(t.length).toBeGreaterThanOrEqual(2);
  } finally {
    console.log("cleanup:", JSON.stringify(await callResolver(frame, GLOBAL_APP, "deleteSkill", { id: "tester-brand-probe" })));
    const rows: any = await callResolver(frame, GLOBAL_APP, "getSkills");
    console.log("FINAL ROSTER:", JSON.stringify(rows.skills.map((r: any) => r.id)));
  }
});
