// TESTER re-verify — D1 (getSkillContent body/refs) + D5/D6/D7 (roster fields).
import fs from "node:fs";
import path from "node:path";
import { test as ftest, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import {
  BASE_URL, GLOBAL_APP, assertLoggedIn, callResolver, openGlobalPage,
  setRecorderTarget, settleBootSelection, waitForChatApp, watchNoise,
} from "./chatwise-support";

const T = getTarget("chatwise-global");
const OUT = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/tester2";
const dump = (n: string, d: unknown) => fs.writeFileSync(path.join(OUT, n), JSON.stringify(d, null, 2));

ftest.describe.configure({ retries: 0, timeout: 600_000 });

ftest("TESTER2: roster fields + getSkillContent hydration + editor DOM", async ({ page, recorder }) => {
  setRecorderTarget(recorder, T, BASE_URL + T.deepLink(T.envId)!);
  const noise = watchNoise(page);
  await assertLoggedIn(page);
  const frame = await openGlobalPage(page, T, recorder);
  await waitForChatApp(page, frame, GLOBAL_APP);
  await settleBootSelection(page, frame);

  const version = await frame.locator("body").evaluate(() => {
    const el = Array.from(document.querySelectorAll("div")).find((d) =>
      /^v\d+\.\d+\.\d+$/.test((d.textContent || "").trim()));
    return el ? (el.textContent || "").trim() : "(no version chip)";
  });
  console.log("VERSION CHIP:", version);

  // ---- RAW ROUTE: getSkills roster ----
  const roster = await callResolver(frame, GLOBAL_APP, "getSkills");
  dump("roster_raw.json", roster);
  const rows = (roster as any)?.skills || [];
  console.log("ROSTER RAW:", JSON.stringify(rows.map((r: any) => ({
    id: r.id, visibility: r.visibility, scope: r.scope, builtin: r.builtin,
    referenceCount: r.referenceCount, assetCount: r.assetCount, bytes: r.bytes, enabled: r.enabled,
  })), null, 2));

  // ---- RAW ROUTE: getSkillContent on the BUILT-IN ----
  const c = await callResolver(frame, GLOBAL_APP, "getSkillContent", { id: "diconium-brand" });
  dump("content_diconium.json", c);
  const s = (c as any)?.skill;
  console.log("getSkillContent(diconium-brand):", JSON.stringify({
    ok: (c as any)?.success, error: (c as any)?.error,
    id: s?.id, name: s?.name, visibility: s?.visibility, canEdit: s?.canEdit,
    bodyLen: s?.body?.length, bodyHead: (s?.body || "").slice(0, 100),
    bytes: s?.bytes, referenceCount: s?.referenceCount, assetCount: s?.assetCount,
    refs: (s?.references || []).map((r: any) => ({ path: r.path, textLen: (r.text || "").length })),
  }, null, 2));

  // ---- THE UI: open the Skills panel, read EVERY visible field ----
  await frame.locator("#skillsBtn").click();
  await page.waitForTimeout(2000);
  const panel = await frame.locator("body").evaluate(() => {
    const rowsEl = Array.from(document.querySelectorAll(".skill-row"));
    return {
      filters: Array.from(document.querySelectorAll(".skills-filter, [data-filter]")).map((f) => ({
        cls: f.className, dataFilter: (f as HTMLElement).dataset.filter,
        text: (f.textContent || "").replace(/\s+/g, " ").trim(),
      })),
      counts: Array.from(document.querySelectorAll("[data-count]")).map(
        (e) => `${(e as HTMLElement).dataset.count}=${(e.textContent || "").trim()}`),
      rows: rowsEl.map((r) => ({
        id: (r as HTMLElement).dataset.id,
        badges: Array.from(r.querySelectorAll(".skill-badge, .skills-badge")).map(
          (b) => `${b.className}|${(b.textContent || "").trim()}`),
        meta: Array.from(r.querySelectorAll(".skill-row-meta span, .skill-meta span")).map(
          (m) => (m.textContent || "").trim()),
        fullText: (r.textContent || "").replace(/\s+/g, " ").trim().slice(0, 260),
        actions: Array.from(r.querySelectorAll("[data-act]")).map((a) => (a as HTMLElement).dataset.act),
      })),
    };
  });
  dump("panel_ui.json", panel);
  console.log("PANEL UI:", JSON.stringify(panel, null, 2));
  await page.screenshot({ path: path.join(OUT, "panel.png"), fullPage: false });

  // ---- click the Site-wide filter, count rows ----
  const siteFilter = frame.locator('[data-filter="site"]');
  const hasSite = await siteFilter.count();
  console.log("site filter present:", hasSite);
  if (hasSite) {
    await siteFilter.first().click();
    await page.waitForTimeout(900);
    const siteRows = await frame.locator("body").evaluate(() =>
      Array.from(document.querySelectorAll(".skill-row")).map((r) => (r as HTMLElement).dataset.id));
    console.log("SITE-WIDE FILTER ROWS:", JSON.stringify(siteRows));
    dump("site_filter_rows.json", siteRows);
    await frame.locator('[data-filter="all"]').first().click().catch(() => {});
    await page.waitForTimeout(600);
  }

  // ---- open the EDITOR on the built-in and read every field the user sees ----
  await frame.locator('.skill-row[data-id="diconium-brand"] [data-act="edit"], .skill-row[data-id="diconium-brand"] [data-act="view"]').first().click();
  await page.waitForTimeout(5000);
  const editor = await frame.locator("body").evaluate(() => {
    const host = document.querySelector('.skills-view[data-view="editor"]') as HTMLElement | null;
    if (!host) return { host: false, bodyText: document.body.innerText.slice(0, 400) };
    const val = (sel: string) =>
      (host.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null)?.value ?? null;
    return {
      host: true,
      id: val('[data-field="id"]'),
      name: val('[data-field="name"]'),
      description: val('[data-field="description"]'),
      bodyLen: (val('[data-field="body"]') || "").length,
      bodyHead: (val('[data-field="body"]') || "").slice(0, 160),
      counters: Array.from(host.querySelectorAll(".skills-counter, .skills-count, [data-counter]"))
        .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()),
      allSmallText: Array.from(host.querySelectorAll("label, .skills-hint, .skills-sub, small"))
        .map((e) => (e.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40),
      refBlocks: Array.from(host.querySelectorAll("[data-ref-index]")).map((bl) => ({
        path: (bl.querySelector('[data-field="ref-path"]') as HTMLInputElement | null)?.value ?? "(no input)",
        textLen: ((bl.querySelector('[data-field="ref-content"]') as HTMLTextAreaElement | null)?.value ?? "").length,
      })),
      readonly: !!host.querySelector("[readonly], [disabled]"),
      saveButtons: Array.from(host.querySelectorAll('[data-act="save"], button.primary')).map(
        (b) => (b.textContent || "").trim()),
    };
  });
  dump("editor_builtin.json", editor);
  console.log("EDITOR (diconium-brand):", JSON.stringify(editor, null, 2));
  await page.screenshot({ path: path.join(OUT, "editor_builtin.png"), fullPage: false });

  dump("noise_01.json", { errors: noise.consoleErrors, pageErrors: noise.pageErrors, failed: noise.failedRequests });
  expect(rows.length).toBeGreaterThan(0);
});
