// SCRATCH 6.69.0 — items 2/3/4: NAMING under the new bar, the Storyline page, and
// Gantt AI structure at Segments depth, on a purpose-seeded WFH plan with THREE
// chains: 16 homogeneous ("Payments gateway — step NN"), 8 deliberately MIXED
// subjects, 4 homogeneous. Writes only [harness-test] WFH issues; deletes them,
// the aiview and the fixture plan in the -Z test.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { get, searchJql } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const SHOT = "/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6690";
const STATE = `${SHOT}/naming-state.json`;
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const bodyText = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const readState = () => JSON.parse(fs.readFileSync(STATE, "utf8"));

const A_SUBJ = (i: number) => `Payments gateway — step ${String(i + 1).padStart(2, "0")}`;
const B_SUBJ = [
  "Warehouse relabelling in Rotterdam",
  "Legal review of the vendor terms",
  "Server room UPS swap",
  "Recruit a data steward",
  "Translate the onboarding emails",
  "Retire the fax line",
  "Rebadge the company vehicles",
  "Archive the 2019 tape backups",
];
const C_SUBJ = (i: number) => `Tax residency filing — part ${i + 1}`;

function dates(i: number) {
  const s = new Date(Date.UTC(2027, 0, 4) + i * 7 * 86400000);
  const e = new Date(s.getTime() + 4 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(s), due: iso(e) };
}

test("N-A seed three chains (16 homogeneous / 8 mixed / 4) + fixture plan", async () => {
  const tag = `NM-${Date.now().toString(36)}`;
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const mk = async (summaries: string[]) => {
    const keys: string[] = [];
    for (const s of summaries) {
      const j: any = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `[harness-test] ${tag} ${s}` });
      keys.push(j.key);
    }
    for (let i = 0; i < keys.length; i++) await setDates(keys[i], { ...dates(i), duration: undefined, buffer: undefined } as any, fc);
    for (let i = 1; i < keys.length; i++) await linkBlocks(keys[i - 1], keys[i]);
    return keys;
  };
  const A = await mk(Array.from({ length: 16 }, (_, i) => A_SUBJ(i)));
  const B = await mk(B_SUBJ);
  const C = await mk(Array.from({ length: 4 }, (_, i) => C_SUBJ(i)));
  const all = [...A, ...B, ...C];
  const jql = `key in (${all.join(",")})`;
  await waitForTerminal(async () => {
    const found = await searchJql(jql, ["summary"], 100);
    if (new Set(found.map((i: any) => i.key)).size < all.length) return false;
    for (const grp of [A, B, C]) for (let i = 0; i < grp.length; i++) {
      const issue: any = await get(`/rest/api/3/issue/${grp[i]}?fields=issuelinks`);
      const want = (i > 0 ? 1 : 0) + (i < grp.length - 1 ? 1 : 0);
      if ((issue.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length < want) return false;
    }
    return true;
  }, { timeout: 180_000, interval: 3_000, label: "naming seed propagation" });
  const planName = `[harness-test] ${tag} naming`;
  const cf: any = await getTestState("lz-ppm", { what: "createFixture", name: planName, jql });
  const summaries: Record<string, string> = {};
  for (const grp of [[A, A_SUBJ], [C, C_SUBJ]] as any[]) grp[0].forEach((k: string, i: number) => { summaries[k] = grp[1](i); });
  B.forEach((k, i) => { summaries[k] = B_SUBJ[i]; });
  fs.writeFileSync(STATE, JSON.stringify({ tag, A, B, C, all, planId: cf.planId, planName, jql, summaries }, null, 2));
  console.log("SEEDED", cf.planId, "A16:", A.join(","), "| B8:", B.join(","), "| C4:", C.join(","));
  const probe: any = await getTestState("lz-ppm", { what: "aiStorylines", planId: cf.planId, dry: "1" });
  console.log("DRY:", JSON.stringify({ strategy: probe.strategy, chains: probe.chains, storylineCount: probe.storylineCount, beatCount: probe.beatCount, smallerRuns: probe.smallerRuns }, null, 1));
  expect(cf.planId).toBeTruthy();
});

test("N-B Build from the Storyline tab (real model call) and read the page", async ({ page }) => {
  const st = readState();
  const errs: string[] = [];
  page.on("console", (m: any) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e: any) => errs.push(String(e).slice(0, 200)));
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);
  await frame.getByText(st.planName, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  await page.waitForTimeout(2500);
  console.log("PRE-BUILD EMPTY:", (await frame.locator('[data-testid="storyline-empty"]').innerText().catch(() => "(none)")).replace(/\n/g, " | "));
  await page.screenshot({ path: `${SHOT}/i2-0-prebuild.png` });
  const rb = frame.locator('[data-testid="storyline-rebuild"]');
  const build = frame.locator("button").filter({ hasText: /^Build the storyline$/i });
  console.log("REBUILD BUTTON COUNT:", await rb.count(), "BUILD BUTTON COUNT:", await build.count());
  const trigger = (await rb.count()) ? rb.first() : (await build.count()) ? build.first() : null;
  if (trigger) {
    await trigger.click();
    for (let i = 0; i < 100; i++) {
      const t = await bodyText(frame);
      if (!/Rebuilding the structure|Building the storyline|Reading the plan|Naming/i.test(t)) break;
      await page.waitForTimeout(3000);
    }
    await page.waitForTimeout(6000);
  }
  const view = frame.locator('[data-testid="storyline-view"]');
  console.log("VIEW COUNT:", await view.count());
  const pageText = (await view.innerText().catch(() => "")) || "";
  console.log("PAGE_TEXT_START\n" + pageText.slice(0, 4000) + "\nPAGE_TEXT_END");
  console.log("BLOCKS:", await frame.locator('[data-testid="storyline-block"]').count());
  const badges = await frame.locator('[data-testid="storyline-badge"]').all();
  for (const b of badges) console.log("BADGE kind=" + await b.getAttribute("data-kind") + " text=" + (await b.innerText()).replace(/\n/g, " "));
  console.log("SMALLER_RUNS_COUNT:", await frame.locator('[data-testid="smaller-runs"]').count());
  console.log("SMALLER_RUNS_TEXT:", (await frame.locator('[data-testid="smaller-runs"]').innerText().catch(() => "(none)")).replace(/\n/g, " | "));
  console.log("UNDATED_BLOCK:", await frame.locator('[data-testid="undated-block"]').count());
  await page.screenshot({ path: `${SHOT}/i3-1-storyline.png`, fullPage: true });

  // hues actually painted
  const hues = await frame.locator('[data-testid="storyline-block"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ color: e.getAttribute("data-color") || getComputedStyle(e).getPropertyValue("--lz-sl-color"), id: e.getAttribute("data-storyline-id") })));
  console.log("BLOCK_HUES:", JSON.stringify(hues));
  const allHues = await frame.locator('[data-testid="storyline-view"]').evaluate((root: any) => {
    const set = new Set<string>();
    root.querySelectorAll("*").forEach((el: any) => {
      const c = getComputedStyle(el).backgroundColor;
      if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") set.add(c);
    });
    return [...set];
  }).catch(() => []);
  console.log("ALL_BG_COLORS:", JSON.stringify(allHues));

  // cut tooltip
  const cuts = frame.locator('[data-testid="storyline-cut"], [data-testid="beat-cut"]');
  console.log("CUT_MARKERS:", await cuts.count());
  for (let i = 0; i < Math.min(3, await cuts.count()); i++) {
    console.log("CUT_TITLE_" + i + ":", JSON.stringify(await cuts.nth(i).getAttribute("title")), "aria:", JSON.stringify(await cuts.nth(i).getAttribute("aria-label")), "text:", JSON.stringify((await cuts.nth(i).innerText().catch(() => "")).replace(/\n/g, " ")));
  }
  console.log("STAGED:", /Apply \d+ change|Save \(\d+\)/.test(await bodyText(frame)));
  console.log("APP CONSOLE ERRORS:", errs.filter((e) => !/atlaskit-tokens|Failed to load resource/.test(e)).join(" || ") || "(none)");
  expect(await view.count()).toBeGreaterThan(0);
});

test("N-C Gantt: AI structure at Segments depth; persistence", async ({ page }) => {
  const st = readState();
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2000);
  await frame.getByText(st.planName, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);

  const probe = () => realFrame!.evaluate(() => ({
    depth: document.querySelector('[data-testid="gantt-depth-control"]')?.getAttribute("data-depth") || null,
    cables: document.querySelectorAll('[data-testid="dep-arrow-bundle"]').length,
    perEdge: document.querySelectorAll('[data-testid="dep-arrow-hit"]').length,
    rows: document.querySelectorAll('[data-testid="gantt-row"]').length,
    headers: [...document.querySelectorAll('[data-testid="gantt-group-header"]')].map((el) => ({
      label: el.getAttribute("data-group-label"), kind: el.getAttribute("data-row-kind"), count: Number(el.getAttribute("data-group-count")),
    })),
    chips: [...document.querySelectorAll('[data-testid="gantt-group-header"]')].map((el) => {
      const c = el.querySelector('[data-testid="gantt-segment-links"]');
      return c ? { label: el.getAttribute("data-group-label"), out: c.getAttribute("data-links-out"), in: c.getAttribute("data-links-in"), text: (c as HTMLElement).innerText } : null;
    }).filter(Boolean),
    groupLabel: (document.querySelector('[data-testid="gantt-group-select"]') as HTMLElement | null)?.innerText || null,
  }));

  console.log("BEFORE:", JSON.stringify(await probe()));
  await frame.getByText(/No grouping/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(800);
  await frame.getByText(/AI structure/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(7000);
  console.log("AFTER_GROUP:", JSON.stringify(await probe()));
  // force Segments depth
  const set = await realFrame!.evaluate(() => {
    const btn = document.querySelector('[data-testid="gantt-depth-segments"]') as HTMLElement | null;
    const all = [...document.querySelectorAll('[data-testid^="gantt-depth-"]')].map((e) => e.getAttribute("data-testid"));
    if (btn) btn.click();
    return { clicked: !!btn, available: all };
  });
  console.log("DEPTH_CONTROLS:", JSON.stringify(set));
  await page.waitForTimeout(3000);
  const seg = await probe();
  console.log("AT_SEGMENTS:", JSON.stringify(seg, null, 1));
  await page.screenshot({ path: `${SHOT}/i4-1-segments.png`, fullPage: false });

  // --- persistence: Table and back
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  console.log("AFTER_TABLE_ROUNDTRIP:", JSON.stringify(await probe()));
  // --- persistence: reload
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s2 = await enterForgeSurface(page, { surface: "custom" });
  const f2 = s2.kind === "custom" ? s2.frame : null; if (!f2) throw new Error("no frame2");
  const rf2 = await (await f2.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(3000);
  if (!/Gantt/i.test(await bodyText(f2))) { await f2.getByText(st.planName, { exact: false }).first().click().catch(() => {}); await page.waitForTimeout(4000); }
  await page.waitForTimeout(6000);
  const after = await rf2!.evaluate(() => ({
    depth: document.querySelector('[data-testid="gantt-depth-control"]')?.getAttribute("data-depth") || null,
    cables: document.querySelectorAll('[data-testid="dep-arrow-bundle"]').length,
    headers: [...document.querySelectorAll('[data-testid="gantt-group-header"]')].map((el) => el.getAttribute("data-group-label")),
    chips: [...document.querySelectorAll('[data-testid="gantt-segment-links"]')].map((c) => (c as HTMLElement).innerText),
  }));
  console.log("AFTER_RELOAD:", JSON.stringify(after, null, 1));
  await page.screenshot({ path: `${SHOT}/i4-2-after-reload.png` });
  console.log("STAGED:", /Apply \d+ change|Save \(\d+\)/.test(await bodyText(f2)));
  expect(true).toBeTruthy();
});

test("N-Z cleanup", async () => {
  if (process.env.KEEP === "1") { console.log("KEEP=1, skipping cleanup"); return; }
  const st = readState();
  await getTestState("lz-ppm", { what: "aiViewDelete", planId: st.planId }).catch(() => {});
  await getTestState("lz-ppm", { what: "deleteFixture", planId: st.planId }).catch(() => {});
  for (const k of st.all) await deleteIssue(k).catch(() => {});
  const plans: any = await getTestState("lz-ppm", { what: "plans" });
  const still = (plans.plans || []).some((p: any) => p.id === st.planId);
  console.log("STILL_EXISTS =", still);
  const left = await searchJql(`key in (${st.all.join(",")})`, ["summary"], 100).catch(() => []);
  console.log("ISSUES_LEFT =", left.length, left.map((i: any) => i.key).join(","));
  expect(still).toBe(false);
  expect(left.length).toBe(0);
});
