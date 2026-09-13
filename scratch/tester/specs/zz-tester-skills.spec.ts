// TESTER probe — the skills panel, the import path and the skill routes.
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { test as ftest } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, PANEL_APP, assertLoggedIn, callResolver, openGlobalPage, openPanel,
  setRecorderTarget, settleBootSelection, waitForChatApp, watchNoise,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const TP = getTarget("chatwise-issue-panel");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester";
const dump = (n: string, d: unknown) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(d, null, 2));
const log = (...a: unknown[]) => console.log(...a);

ftest.describe.configure({ retries: 0, timeout: 600_000 });

ftest("TESTER: skills panel + import + routes", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  const noise = watchNoise(page);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  // ---------- 1. the entry point exists on the GLOBAL page ----------
  const btn = frame.locator("#skillsBtn");
  await expect(btn, "global page must offer a Skills entry point").toHaveCount(1);
  await btn.click();
  await page.waitForTimeout(1200);
  const listBefore = await frame.locator("body").evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".skill-row"));
    return {
      modalVisible: !!document.querySelector(".skills-view"),
      counts: Array.from(document.querySelectorAll("[data-count]")).map((e) => `${(e as HTMLElement).dataset.count}=${e.textContent}`),
      rows: rows.map((r) => ({
        id: (r as HTMLElement).dataset.id,
        text: (r.textContent || "").replace(/\s+/g, " ").trim().slice(0, 220),
        actions: Array.from(r.querySelectorAll("[data-act]")).map((a) => (a as HTMLElement).dataset.act),
      })),
    };
  });
  dump("panel_before.json", listBefore);
  log("PANEL BEFORE:", JSON.stringify(listBefore, null, 2));

  // ---------- 2. import a colliding id -> must be refused ----------
  await frame.locator(".skills-file-input").setInputFiles(path.join(OUT, "diconium-brand.zip"));
  await page.waitForTimeout(9000);
  const collide = await frame.locator("body").evaluate(() =>
    (document.querySelector(".skills-notice")?.textContent || "").replace(/\s+/g, " ").trim());
  log("COLLIDING IMPORT NOTICE:", collide);

  // ---------- 3. import the real folder under a fresh id ----------
  await frame.locator(".skills-file-input").setInputFiles(path.join(OUT, "tester-brand-probe.zip"));
  await page.waitForTimeout(12000);
  const okNotice = await frame.locator("body").evaluate(() =>
    (document.querySelector(".skills-notice")?.textContent || "").replace(/\s+/g, " ").trim());
  log("IMPORT NOTICE:", okNotice);

  const after = await frame.locator("body").evaluate(() =>
    Array.from(document.querySelectorAll(".skill-row")).map((r) => ({
      id: (r as HTMLElement).dataset.id,
      text: (r.textContent || "").replace(/\s+/g, " ").trim().slice(0, 300),
      actions: Array.from(r.querySelectorAll("[data-act]")).map((a) => (a as HTMLElement).dataset.act),
    })));
  dump("panel_after.json", after);
  log("PANEL AFTER:", JSON.stringify(after, null, 2));

  // ---------- 4. what actually landed in KVS ----------
  const content = await callResolver(frame, GLOBAL_APP, "getSkillContent", { id: "tester-brand-probe" });
  dump("imported_skill.json", content);
  const s = (content as any)?.skill;
  log("IMPORTED:", JSON.stringify({
    ok: (content as any)?.success, error: (content as any)?.error,
    id: s?.id, name: s?.name, visibility: s?.visibility, canEdit: s?.canEdit,
    descLen: s?.description?.length, desc: s?.description,
    bodyLen: s?.body?.length, refCount: s?.references?.length,
    refs: s?.references?.map((r: any) => ({ path: r.path, len: r.text?.length })),
    assetCount: s?.assetCount, bytes: s?.bytes,
  }, null, 2));

  // ---------- 5. the other routes ----------
  log("setSkillEnabled(off):", JSON.stringify(await callResolver(frame, GLOBAL_APP, "setSkillEnabled", { id: "tester-brand-probe", enabled: false })));
  log("setSkillEnabled(on):", JSON.stringify(await callResolver(frame, GLOBAL_APP, "setSkillEnabled", { id: "tester-brand-probe", enabled: true })));
  log("saveSkill(builtin edit attempt):", JSON.stringify(await callResolver(frame, GLOBAL_APP, "saveSkill", { skill: { id: "diconium-brand", name: "hijack", description: "x".repeat(40), body: "y".repeat(40) } })));
  log("deleteSkill(builtin):", JSON.stringify(await callResolver(frame, GLOBAL_APP, "deleteSkill", { id: "diconium-brand" })));
  log("promoteSkill(as ADMIN):", JSON.stringify(await callResolver(frame, GLOBAL_APP, "promoteSkill", { id: "tester-brand-probe" })));
  const afterPromote = await callResolver(frame, GLOBAL_APP, "getSkills");
  log("AFTER PROMOTE:", JSON.stringify((afterPromote as any)?.skills?.map((r: any) => ({ id: r.id, vis: r.visibility, owner: r.ownerAccountId, canEdit: r.canEdit }))));
  log("resetBuiltinSkill(as ADMIN):", JSON.stringify(await callResolver(frame, GLOBAL_APP, "resetBuiltinSkill")));
  log("getSkillContent(nonexistent):", JSON.stringify(await callResolver(frame, GLOBAL_APP, "getSkillContent", { id: "no-such-skill-xyz" })));
  log("saveSkill(no id/junk):", JSON.stringify(await callResolver(frame, GLOBAL_APP, "saveSkill", { skill: { name: "", description: "", body: "" } })));
  log("putSkillArchiveChunk(bad id):", JSON.stringify(await callResolver(frame, GLOBAL_APP, "putSkillArchiveChunk", { uploadId: "../../etc/passwd", index: 0, base64: "AA==" })));
  log("beginSkillArchiveUpload(huge):", JSON.stringify(await callResolver(frame, GLOBAL_APP, "beginSkillArchiveUpload", { uploadId: "skz_test_abc", size: 99999999, filename: "x.zip" })));

  dump("noise_skills.json", { errors: noise.consoleErrors, pageErrors: noise.pageErrors, failed: noise.failedRequests });

  // ---------- 6. the ISSUE PANEL surface ----------
  const pframe = await openPanel(page, TP, "WFH-2212", recorder);
  await waitForChatApp(page, pframe, PANEL_APP);
  const panelBtn = await pframe.locator("#skillsBtn").count();
  log("ISSUE PANEL #skillsBtn count:", panelBtn);
  if (panelBtn > 0) {
    await pframe.locator("#skillsBtn").click();
    await page.waitForTimeout(1500);
    const pRows = await pframe.locator("body").evaluate(() => ({
      modal: !!document.querySelector(".skills-view"),
      rows: Array.from(document.querySelectorAll(".skill-row")).map((r) => (r.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120)),
      importBtn: !!document.querySelector('[data-act="import"]'),
      styles: (() => {
        const el = document.querySelector(".skill-row") as HTMLElement | null;
        if (!el) return null;
        const c = getComputedStyle(el);
        return { bg: c.backgroundColor, color: c.color, border: c.border, pad: c.padding, h: el.getBoundingClientRect().height };
      })(),
    }));
    dump("panel_issuepanel.json", pRows);
    log("ISSUE PANEL SKILLS:", JSON.stringify(pRows, null, 2));
  }
  expect(1).toBe(1);
});
