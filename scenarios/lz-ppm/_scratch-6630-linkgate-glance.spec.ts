// TESTER (6.63.0 items 2 + 6).
//  2. The Gantt's link-creation gate REFUSES a loop that closes through an
//     INHERITED edge, with the reason in the user's words, and writes nothing to
//     Jira; a legitimate link on the same chart still stages.
//  6. The issue glance's new loop sentence on a `via` loop (shape A).
// Seeds ONLY [harness-test] WFH issues + hook fixture plans; deletes both in finally.
import { test, expect } from "@playwright/test";
import { getTarget } from "../../config/targets";
import { assertLoggedIn, launchHarnessContext } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { request, get, searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import { BASE_URL } from "../../config/env";

const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const T = getTarget("lz-ppm-dashboard");
const OUT = process.env.SHOT_DIR || "/tmp";
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });

type Spec = { id: string; epic: boolean; parent?: string; start?: string; due?: string; preds?: string[] };

async function seed(tag: string, specs: Spec[]) {
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const map: Record<string, string> = {}; const created: string[] = [];
  for (const s of specs) {
    const j = await createIssue({ projectKey: PROJECT, issueType: s.epic ? "Epic" : "Work package", summary: `[harness-test] ${tag} ${s.id}` });
    map[s.id] = j.key; created.push(j.key);
  }
  for (const s of specs) if (s.start || s.due) await setDates(map[s.id], { start: s.start, due: s.due }, fc);
  for (const s of specs) for (const p of s.preds || []) await linkBlocks(map[p], map[s.id]);
  for (const s of specs) if (s.parent) await request("PUT", `/rest/api/3/issue/${map[s.id]}`, { raw: true, body: { fields: { parent: { key: map[s.parent] } } } });
  const jql = `key in (${Object.values(map).join(",")})`;
  await waitForTerminal(async () => {
    const found = await searchJql(jql, ["summary"], 100);
    if (new Set(found.map((i: any) => i.key)).size < specs.length) return false;
    for (const s of specs) {
      const want = (s.preds || []).length + specs.filter((o) => (o.preds || []).includes(s.id)).length;
      const issue: any = await get(`/rest/api/3/issue/${map[s.id]}?fields=issuelinks,parent`);
      if ((issue.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length < want) return false;
      if (s.parent && !issue.fields.parent) return false;
    }
    return true;
  }, { timeout: 60_000, interval: 2_000, label: `${tag} propagation` });
  const cf = await getTestState("lz-ppm", { what: "createFixture", name: `[harness-test] ${tag}`, jql });
  return { map, created, planId: cf.planId as string, jql };
}

const blocksLinks = async (key: string) => {
  const i: any = await get(`/rest/api/3/issue/${key}?fields=issuelinks`);
  return (i.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks")
    .map((l: any) => l.outwardIssue ? `${key}->${l.outwardIssue.key}` : `${l.inwardIssue.key}->${key}`).sort();
};

test("2 — the Gantt refuses a loop through an inherited edge, and says why", async () => {
  const tag = `LG-${Date.now().toString(36)}`;
  // TOP (Epic) is blocked by OUT; MID lives inside TOP, so the chained-summary
  // rule gives MID an INHERITED predecessor OUT. MID -> OUT therefore closes a
  // loop that the DECLARED graph does not contain.
  const specs: Spec[] = [
    { id: "TOP", epic: true, start: "2026-07-13", due: "2026-07-31", preds: ["OUT"] },
    { id: "MID", epic: false, parent: "TOP", start: "2026-07-20", due: "2026-07-24" },
    { id: "OUT", epic: false, start: "2026-07-06", due: "2026-07-10" },
    { id: "FREE", epic: false, start: "2026-08-03", due: "2026-08-07" },
  ];
  let s: any = null;
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    s = await seed(tag, specs);
    console.log("LG PLAN =", s.planId, JSON.stringify(s.map));
    const linksBefore: any = {};
    for (const id of ["TOP", "MID", "OUT", "FREE"]) linksBefore[id] = await blocksLinks(s.map[id]);
    console.log("JIRA BLOCKS LINKS BEFORE =", JSON.stringify(linksBefore));

    await page.setViewportSize({ width: 1700, height: 1100 });
    await assertLoggedIn(page);
    await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
    const su = await enterForgeSurface(page, { surface: "custom" });
    const frame: any = (su as any).frame;
    await page.waitForTimeout(2500);
    await frame.getByText(tag, { exact: false }).first().click({ timeout: 40_000 });
    await page.waitForTimeout(5000);
    await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
    await page.waitForTimeout(6000);
    const rf = await (await frame.locator(":root").elementHandle())!.ownerFrame();
    const bodyText = async () => (await frame.locator("body").innerText().catch(() => "")) || "";
    const isStaged = async () => /Apply \d+ change|Save \(\d+\)/i.test(await bodyText());
    const arrow = (f: string, t: string) => rf!.evaluate(({ f, t }: any) => !!document.querySelector(`[data-testid="dep-arrow-hit"][data-link="${f}-${t}"]`), { f, t });
    const barBox = async (k: string) => await frame.locator(`[data-testid="gantt-bar"][data-key="${k}"]`).first().boundingBox().catch(() => null);
    const drag = async (from: string, to: string) => {
      const a = await barBox(from), b = await barBox(to);
      if (!a || !b) throw new Error(`bars missing ${from}/${to}`);
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
      await page.waitForTimeout(500);
      const dx = a.x + a.width + 4, dy = a.y + a.height / 2;
      await page.mouse.move(dx, dy);
      await page.mouse.down();
      const tx = b.x + b.width / 2, ty = b.y + b.height / 2;
      for (const fr of [0.3, 0.6, 0.9, 1]) await page.mouse.move(dx + (tx - dx) * fr, dy + (ty - dy) * fr, { steps: 6 });
      await page.waitForTimeout(250);
      await page.mouse.up();
      await page.waitForTimeout(2200);
    };
    const toasts = () => rf!.evaluate(() => Array.from(document.querySelectorAll('[data-testid="toast"], [class*="toast"], [role="alert"]')).map((e: any) => ({ t: e.innerText.trim(), cls: (e.className || "").toString() })).filter((x: any) => x.t));
    console.log("BARS =", await frame.locator('[data-testid="gantt-bar"]').evaluateAll((e: any[]) => e.map((x) => x.getAttribute("data-key"))));
    await page.screenshot({ path: `${OUT}/20-linkgate-before.png` });
    console.log("STAGED BEFORE =", await isStaged());

    // ---- the REFUSAL: MID -> OUT ----
    await drag(s.map.MID, s.map.OUT);
    const tRefuse = await toasts();
    console.log("TOAST AFTER MID->OUT =", JSON.stringify(tRefuse, null, 1));
    await page.screenshot({ path: `${OUT}/21-linkgate-refusal.png` });
    console.log("ARROW MID->OUT =", await arrow(s.map.MID, s.map.OUT), " STAGED =", await isStaged());
    const linksAfterRefusal: any = {};
    for (const id of ["TOP", "MID", "OUT", "FREE"]) linksAfterRefusal[id] = await blocksLinks(s.map[id]);
    console.log("JIRA BLOCKS LINKS AFTER REFUSAL =", JSON.stringify(linksAfterRefusal));
    expect(await arrow(s.map.MID, s.map.OUT), "no arrow for the refused link").toBeFalsy();
    expect(JSON.stringify(linksAfterRefusal)).toBe(JSON.stringify(linksBefore));
    expect(tRefuse.length, "a toast explains the refusal").toBeGreaterThan(0);

    // ---- the LEGITIMATE link: MID -> FREE ----
    await page.waitForTimeout(6000);
    await drag(s.map.MID, s.map.FREE);
    console.log("TOAST AFTER MID->FREE =", JSON.stringify(await toasts()));
    console.log("ARROW MID->FREE =", await arrow(s.map.MID, s.map.FREE), " STAGED =", await isStaged());
    await page.screenshot({ path: `${OUT}/22-linkgate-legit.png` });
    expect(await arrow(s.map.MID, s.map.FREE), "the legitimate link stages and renders").toBeTruthy();
    const linksAfterLegit: any = {};
    for (const id of ["MID", "FREE"]) linksAfterLegit[id] = await blocksLinks(s.map[id]);
    console.log("JIRA BLOCKS LINKS AFTER LEGIT DRAG (staged only, not applied) =", JSON.stringify(linksAfterLegit));

    // ---- delete the legitimate link again through the bar popup ----
    await frame.locator(`[data-testid="gantt-bar"][data-key="${s.map.FREE}"]`).first().click();
    await page.waitForTimeout(1200);
    await frame.locator(`[aria-label="Remove dependency ${s.map.MID}"]`).first().dispatchEvent("click");
    await page.waitForTimeout(800);
    await frame.getByRole("button", { name: /^Remove$/i }).first().dispatchEvent("click").catch(() => {});
    await page.waitForTimeout(2000);
    console.log("ARROW MID->FREE AFTER REMOVE =", await arrow(s.map.MID, s.map.FREE));
    await page.screenshot({ path: `${OUT}/23-linkgate-removed.png` });
    expect(await arrow(s.map.MID, s.map.FREE), "the legitimate link is removed again").toBeFalsy();
  } finally {
    await ctx.close();
    if (s) {
      await getTestState("lz-ppm", { what: "clearDrafts", planId: s.planId }).catch(() => {});
      await getTestState("lz-ppm", { what: "deleteFixture", planId: s.planId }).catch(() => {});
      for (const k of s.created) await deleteIssue(k).catch(() => {});
      const plans: any = await getTestState("lz-ppm", { what: "plans" });
      console.log("LG STILL_EXISTS =", (plans.plans || []).some((p: any) => p.id === s.planId));
    }
  }
});

test("6 — the glance's loop sentence names the PARENT that carries the wait", async () => {
  const tag = `GLN-${Date.now().toString(36)}`;
  const specs: Spec[] = [
    { id: "P1", epic: true, start: "2026-03-02", due: "2026-03-31", preds: ["X"] },
    { id: "P2", epic: true, start: "2026-03-02", due: "2026-03-31", preds: ["Y"] },
    { id: "C1", epic: false, parent: "P1", start: "2026-03-09", due: "2026-03-13" },
    { id: "Y", epic: false, parent: "P1", start: "2026-03-16", due: "2026-03-20" },
    { id: "X", epic: false, parent: "P2", start: "2026-03-02", due: "2026-03-06" },
  ];
  let s: any = null;
  const ctx = await launchHarnessContext();
  const page = await ctx.newPage();
  try {
    s = await seed(tag, specs);
    console.log("GLN PLAN =", s.planId, JSON.stringify(s.map));
    const r = await getTestState("lz-ppm", { what: "settle", planId: s.planId });
    const inv = Object.fromEntries(Object.entries(s.map).map(([a, b]: any) => [b, a]));
    console.log("GLN cycleEdges =", JSON.stringify((r.meta?.cycleEdges || []).map((e: any) => `${inv[e.from]}>${inv[e.to]}`)));
    await page.setViewportSize({ width: 1600, height: 1100 });
    await assertLoggedIn(page);
    for (const id of ["X", "Y", "C1"]) {
      const key = s.map[id];
      await page.goto(`${BASE_URL}/browse/${key}`, { waitUntil: "domcontentloaded" });
      let f: any = null;
      const find = async (ms: number) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { for (const fr of page.frames()) { const hit = await fr.evaluate(() => !!document.querySelector('[data-testid="issue-glance"]')).catch(() => false); if (hit) return fr; } await page.waitForTimeout(1500); } return null; };
      f = await find(25_000);
      if (!f) {
        await page.getByRole("button", { name: /View app actions/i }).first().click({ timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(2000);
        await page.getByRole("menuitem", { name: /LeanZero Management Position/i }).first().click({ timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(4000);
        f = await find(90_000);
      }
      if (!f) { console.log(`GLANCE ${id} (${key}) = NOT MOUNTED`); continue; }
      await page.waitForTimeout(2500);
      const read = await f.evaluate(() => {
        const root = document.querySelector('[data-testid="issue-glance"]') as any;
        if (!root) return null;
        return {
          plan: (root.querySelector('[role="group"] button[aria-pressed="true"]') as any)?.textContent?.trim() || null,
          plans: Array.from(root.querySelectorAll('[role="group"] button')).map((b: any) => b.textContent.trim()),
          items: Array.from(root.querySelectorAll("[data-item]")).map((li: any) => ({ id: li.getAttribute("data-item"), chip: li.querySelector(".lz-badge")?.textContent?.trim() || null, text: li.innerText.trim().replace(/\n+/g, " ") })),
          full: root.innerText.trim().replace(/\n+/g, " | "),
        };
      });
      console.log(`GLANCE ${id} (${key}) =`, JSON.stringify(read, null, 1));
      await page.screenshot({ path: `${OUT}/24-glance-${id}.png` });
    }
  } finally {
    await ctx.close();
    if (s) {
      await getTestState("lz-ppm", { what: "deleteFixture", planId: s.planId }).catch(() => {});
      for (const k of s.created) await deleteIssue(k).catch(() => {});
      const plans: any = await getTestState("lz-ppm", { what: "plans" });
      console.log("GLN STILL_EXISTS =", (plans.plans || []).some((p: any) => p.id === s.planId));
    }
  }
});
