import fs from "node:fs"; import path from "node:path";
import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, openGlobalPage, setRecorderTarget, settleBootSelection, waitForChatApp } from "./chatwise-support";
const T = getTarget("chatwise-global");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester";
ftest.describe.configure({ retries: 0, timeout: 300_000 });
ftest("TESTER: what does Save do on an editor that opened empty", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);
  await frame.locator("#skillsBtn").click();
  await page.waitForTimeout(1500);
  const badges = await frame.locator("body").evaluate(() => ({
    counts: Array.from(document.querySelectorAll("[data-count]")).map((e) => `${(e as HTMLElement).dataset.count}=${e.textContent}`),
    badges: Array.from(document.querySelectorAll(".skill-row")).map((r) => ({
      id: (r as HTMLElement).dataset.id,
      badges: Array.from(r.querySelectorAll(".skill-badge")).map((b) => `${b.className}|${b.textContent}`),
      meta: Array.from(r.querySelectorAll(".skill-row-meta span")).map((m) => m.textContent),
    })),
  }));
  console.log("BADGES:", JSON.stringify(badges, null, 2));
  fs.writeFileSync(path.join(OUT, "badges.json"), JSON.stringify(badges, null, 2));

  await frame.locator('.skill-row[data-id="tester-brand-probe"] [data-act="edit"]').click();
  await page.waitForTimeout(4000);
  await frame.locator('[data-act="save"]').click();
  await page.waitForTimeout(3000);
  const res = await frame.locator("body").evaluate(() => {
    const host = document.querySelector('.skills-view[data-view="editor"]') as HTMLElement | null;
    return {
      stillInEditor: !!host,
      fieldErrors: Array.from(document.querySelectorAll(".skills-field.is-invalid, .skills-error, .skills-field-error"))
        .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 8),
      visibleText: (host?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 900),
      notice: (document.querySelector(".skills-notice")?.textContent || "").replace(/\s+/g, " ").trim(),
    };
  });
  console.log("AFTER SAVE CLICK:", JSON.stringify(res, null, 2));
  await page.screenshot({ path: path.join(OUT, "editor_save.png") });
  const rows = await callResolver(frame, GLOBAL_APP, "getSkills");
  console.log("ROWS:", JSON.stringify((rows as any).skills.map((r: any) => ({ id: r.id, vis: r.visibility, refs: r.referenceCount, assets: r.assetCount, upd: r.updatedAt }))));
  expect(1).toBe(1);
});
