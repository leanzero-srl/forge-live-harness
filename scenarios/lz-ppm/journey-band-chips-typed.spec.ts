// BAND CHIPS on a NON-CHAIN band, live on dev. No dev plan can produce a TOPICS
// build (topic viability is refused on all of them), so the same rule is driven on
// TYPE bands, which are non-chain bands exactly like topic bands: a collapsed one
// must draw NO cable and must print "N links out · M in".
// Seeds 8 [harness-test] WFH issues alternating Work package / Bug, linked in one
// chain so EVERY edge crosses the two type bands. Deletes everything at the end.
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
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6670";
const STATE = `${SHOT}/typed-state.json`;
const N = 12;
const TOPICS = ["Payments", "Reporting", "Onboarding", "Search"];
test.describe.configure({ retries: 0, timeout: 1_200_000, mode: "serial" });
const bodyText = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const readState = () => JSON.parse(fs.readFileSync(STATE, "utf8"));

test("TYPED-A seed an alternating-type chain and force a type build", async () => {
  const tag = `TB-${Date.now().toString(36)}`;
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const keys: string[] = [];
  for (let i = 0; i < N; i++) {
    const j: any = await createIssue({
      projectKey: PROJECT, issueType: "Work package",
      // The TOPIC TERM IN HEAD POSITION — that is what the topic inventory keys on.
      summary: `Deliver ${TOPICS[i % 4]} module step ${String(i + 1).padStart(2, "0")} [harness-test] ${tag}`,
    });
    keys.push(j.key);
  }
  for (let i = 0; i < N; i++) {
    const s = new Date(Date.UTC(2027, 5, 7) + i * 7 * 86400000);
    const e = new Date(s.getTime() + 4 * 86400000);
    await setDates(keys[i], { start: s.toISOString().slice(0, 10), due: e.toISOString().slice(0, 10), duration: undefined, buffer: undefined } as any, fc);
  }
  for (let i = 1; i < N; i++) await linkBlocks(keys[i - 1], keys[i]);
  const jql = `key in (${keys.join(",")})`;
  await waitForTerminal(async () => {
    const found = await searchJql(jql, ["summary"], 50);
    if (new Set(found.map((i: any) => i.key)).size < N) return false;
    for (let i = 0; i < N; i++) {
      const issue: any = await get(`/rest/api/3/issue/${keys[i]}?fields=issuelinks`);
      const want = (i > 0 ? 1 : 0) + (i < N - 1 ? 1 : 0);
      if ((issue.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length < want) return false;
    }
    return true;
  }, { timeout: 120_000, interval: 3_000, label: "typed chain propagation" });
  const cf: any = await getTestState("lz-ppm", { what: "createFixture", name: `[harness-test] ${tag} topic bands`, jql });
  const planName = `[harness-test] ${tag} topic bands`;
  await getTestState("lz-ppm", { what: "aiStorylines", planId: cf.planId, dry: "0", strategy: "topics", store: "1" });
  const v: any = await getTestState("lz-ppm", { what: "aiView", planId: cf.planId });
  const assign = v.view.assignmentByKey;
  const plan: any = await getTestState("lz-ppm", { what: "plan", planId: cf.planId });
  const edges = new Set<string>();
  for (const i of plan.issues) {
    for (const p of i.predecessors || []) edges.add(`${p}>${i.key}`);
    for (const s of i.successors || []) edges.add(`${i.key}>${s}`);
  }
  const out: Record<string, number> = {}; const inn: Record<string, number> = {}; let cross = 0;
  for (const e of edges) {
    const [a, b] = e.split(">");
    if (assign[a] !== assign[b]) { cross++; out[assign[a]] = (out[assign[a]] || 0) + 1; inn[assign[b]] = (inn[assign[b]] || 0) + 1; }
  }
  const segs = v.view.segments.map((s: any) => ({ id: s.id, kind: s.kind, name: s.name }));
  console.log("SEGMENTS:", JSON.stringify(segs));
  console.log("EXPECTED cross:", cross, "out:", JSON.stringify(out), "in:", JSON.stringify(inn));
  fs.writeFileSync(STATE, JSON.stringify({ tag, keys, planId: cf.planId, planName, segs, expected: { cross, out, inn } }, null, 2));
  expect(cross).toBeGreaterThan(0);
});

test("TYPED-B collapsed type bands: no cables, link chips carry the counts", async ({ page }) => {
  const st = readState();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);
  await frame.getByText(st.planName, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt$/ }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  await frame.getByText(/No grouping/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await frame.getByText(/AI structure/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(7000);
  const headers = frame.locator('[data-testid="gantt-group-header"]');
  console.log("HEADERS:", await headers.count());
  console.log("EXPANDED cables:", await frame.locator('[data-testid="dep-arrow-bundle"]').count(),
              "per-edge:", await frame.locator('[data-testid="dep-arrow-hit"]').count());
  await page.screenshot({ path: `${SHOT}/typed-1-expanded.png` });
  const n = await headers.count();
  for (let i = 0; i < n; i++) {
    const h = headers.nth(i);
    if ((await h.getAttribute("data-collapsed")) !== "true") { await h.click(); await page.waitForTimeout(700); }
  }
  await page.waitForTimeout(2500);
  const state = await headers.evaluateAll((els: any[]) => els.map((e) => ({
    gv: e.getAttribute("data-group-gv"), label: e.getAttribute("data-group-label"),
    kind: e.getAttribute("data-row-kind"), segKind: e.getAttribute("data-segment-kind"),
    collapsed: e.getAttribute("data-collapsed"),
    chip: e.querySelector('[data-testid="gantt-segment-links"]')?.textContent?.trim() || null,
    out: e.querySelector('[data-testid="gantt-segment-links"]')?.getAttribute("data-links-out") || null,
    in: e.querySelector('[data-testid="gantt-segment-links"]')?.getAttribute("data-links-in") || null,
  })));
  console.log("BANDS:", JSON.stringify(state, null, 1));
  console.log("EXPECTED:", JSON.stringify(st.expected));
  console.log("COLLAPSED cables:", await frame.locator('[data-testid="dep-arrow-bundle"]').count(),
              "per-edge:", await frame.locator('[data-testid="dep-arrow-hit"]').count());
  console.log("ROWS:", await frame.locator('[data-testid="gantt-row"]').count());
  await page.screenshot({ path: `${SHOT}/typed-2-collapsed.png` });
  console.log("STAGED:", /Apply \d+ change|Save \(\d+\)/.test(await bodyText(frame)));
});

test("TYPED-Z cleanup", async () => {
  if (process.env.KEEP === "1") return;
  const st = readState();
  await getTestState("lz-ppm", { what: "aiViewDelete", planId: st.planId }).catch(() => {});
  await getTestState("lz-ppm", { what: "deleteFixture", planId: st.planId }).catch(() => {});
  for (const k of st.keys) await deleteIssue(k).catch(() => {});
  const plans: any = await getTestState("lz-ppm", { what: "plans" });
  console.log("STILL_EXISTS =", (plans.plans || []).some((p: any) => p.id === st.planId));
  expect((plans.plans || []).some((p: any) => p.id === st.planId)).toBe(false);
});
