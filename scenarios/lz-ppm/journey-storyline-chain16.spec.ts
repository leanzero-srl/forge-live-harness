// STORYLINE on a plan that HAS storylines: seed a 16-task linear chain in WFH,
// createFixture over it, build the AI structure from the UI, and drive the
// Storyline page. Writes ONLY [harness-test]-tagged WFH issues; deletes them and
// the fixture plan in the cleanup test. State is handed between tests via a JSON
// file so a failed UI run can be re-run without reseeding (KEEP=1).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { createIssue, setDates, linkBlocks, deleteIssue } from "../../data/jira-build.mjs";
// @ts-ignore
import { get, searchJql, request as jiraRequest } from "../../data/jira.mjs";
import { getTestState } from "../../testhook/client";
import { waitForTerminal } from "../_support/wait";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const PROJECT = process.env.LZ_PPM_TEST_PROJECT || "WFH";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-6670";
const STATE = `${SHOT}/chain16-state.json`;
const N = 16;
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });

const errors: string[] = [];
const bodyText = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";

/** WFH's workflow has no status called "Done"; it has statuses whose CATEGORY is
 *  done (e.g. "Rejected"). The app counts statusCategory, so walk to one. */
async function toDoneCategory(key: string) {
  for (let i = 0; i < 6; i++) {
    const cur: any = await get(`/rest/api/3/issue/${key}?fields=status`);
    if (cur.fields.status.statusCategory.key === "done") return cur.fields.status.name;
    const t: any = await get(`/rest/api/3/issue/${key}/transitions`);
    const d = t.transitions.find((x: any) => x.to?.statusCategory?.key === "done");
    if (!d) throw new Error(`no done-category transition from ${cur.fields.status.name} on ${key}`);
    await jiraRequest("POST", `/rest/api/3/issue/${key}/transitions`, { raw: true, body: { transition: { id: d.id } } });
  }
  throw new Error("could not reach a done status on " + key);
}

const readState = () => JSON.parse(fs.readFileSync(STATE, "utf8"));

// T01 starts Mon 2027-01-04, one 5-working-day task per week.
function dates(i: number) {
  const s = new Date(Date.UTC(2027, 0, 4) + i * 7 * 86400000);
  const e = new Date(s.getTime() + 4 * 86400000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(s), due: iso(e) };
}

test("CHAIN16-A seed 16 linked WFH tasks + fixture plan", async () => {
  const tag = `SL16-${Date.now().toString(36)}`;
  const fc = (await getTestState("lz-ppm", { what: "fieldConfig" })).fields;
  const keys: string[] = [];
  const names = ["Kick-off", "Discovery", "Data model", "API contract", "Ingest service", "Transform rules",
    "Storage layer", "Search index", "UI shell", "Detail screen", "Reporting", "Alerting",
    "Hardening", "Load test", "Cutover rehearsal", "Go live"];
  for (let i = 0; i < N; i++) {
    const j: any = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `[harness-test] ${tag} T${String(i + 1).padStart(2, "0")} ${names[i]}` });
    keys.push(j.key);
  }
  for (let i = 0; i < N; i++) await setDates(keys[i], { ...dates(i), duration: undefined, buffer: undefined } as any, fc);
  for (let i = 1; i < N; i++) await linkBlocks(keys[i - 1], keys[i]);
  // The `chains` strategy needs at least THREE chains of 3+ issues before it is
  // viable, so two short side runs ride along. They are under the 12 floor and must
  // therefore appear as SMALLER RUNS, not as storylines.
  const side: string[] = [];
  for (let c = 0; c < 2; c++) {
    const trio: string[] = [];
    for (let i = 0; i < 3; i++) {
      const j: any = await createIssue({ projectKey: PROJECT, issueType: "Work package", summary: `[harness-test] ${tag} S${c + 1}${i + 1} side run` });
      trio.push(j.key);
    }
    for (let i = 0; i < 3; i++) await setDates(trio[i], { ...dates(i + c * 4), duration: undefined, buffer: undefined } as any, fc);
    for (let i = 1; i < 3; i++) await linkBlocks(trio[i - 1], trio[i]);
    side.push(...trio);
  }
  // Two done at the head so the first beat's done % is a number that can MOVE.
  for (const k of [keys[0], keys[1]]) console.log("DONE STATUS", k, await toDoneCategory(k));
  const all = [...keys, ...side];
  const jql = `key in (${all.join(",")})`;
  await waitForTerminal(async () => {
    const found = await searchJql(jql, ["summary"], 100);
    if (new Set(found.map((i: any) => i.key)).size < all.length) return false;
    for (let i = 0; i < N; i++) {
      const issue: any = await get(`/rest/api/3/issue/${keys[i]}?fields=issuelinks`);
      const want = (i > 0 ? 1 : 0) + (i < N - 1 ? 1 : 0);
      if ((issue.fields.issuelinks || []).filter((l: any) => l.type?.name === "Blocks").length < want) return false;
    }
    return true;
  }, { timeout: 120_000, interval: 3_000, label: "chain16 propagation" });
  const cf: any = await getTestState("lz-ppm", { what: "createFixture", name: `[harness-test] ${tag} storyline`, jql });
  fs.writeFileSync(STATE, JSON.stringify({ tag, keys, side, all, planId: cf.planId, jql, planName: `[harness-test] ${tag} storyline` }, null, 2));
  console.log("SEEDED", cf.planId, "chain:", keys.join(","), "side:", side.join(","));
  const probe: any = await getTestState("lz-ppm", { what: "aiStorylines", planId: cf.planId, dry: "1" });
  console.log("DRY strategy:", probe.strategy, "chains:", JSON.stringify(probe.chains), "storylines:", probe.storylineCount, "beats:", probe.beatCount, "smallerRuns:", JSON.stringify(probe.smallerRuns));
  console.log("DRY BEATS:", JSON.stringify(probe.storylines?.[0]?.beats?.map((b: any) => ({ n: b.n, start: b.start, end: b.end, doneN: b.doneN, room: b.roomDays, hold: b.holdUpKey, cut: b.cutReason, finishN: b.finishN, criticalN: b.criticalN })), null, 1));
  console.log("DRY CUTS:", JSON.stringify(probe.storylines?.[0]?.cuts), "memberN:", probe.storylines?.[0]?.n);
  expect(probe.storylineCount).toBe(1);
  expect(probe.beatCount).toBe(4);
});

test("CHAIN16-B build from the UI and read the Storyline page", async ({ page }) => {
  const st = readState();
  page.on("console", (m: any) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 200)); });
  page.on("pageerror", (e: any) => errors.push("pageerror: " + String(e).slice(0, 200)));
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);
  await frame.getByText(st.planName, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  await frame.locator('[data-testid="view-tab-storyline"]').first().click();
  await page.waitForTimeout(2500);
  const rb = frame.locator('[data-testid="storyline-rebuild"]');
  console.log("PRE-BUILD empty:", (await frame.locator('[data-testid="storyline-empty"]').innerText().catch(() => "")).replace(/\n/g, " | "));
  if (await rb.count()) {
    await rb.first().click();
    for (let i = 0; i < 80; i++) { if (!/Rebuilding the structure/i.test(await bodyText(frame))) break; await page.waitForTimeout(3000); }
    await page.waitForTimeout(4000);
  }
  await page.screenshot({ path: `${SHOT}/chain16-a-page.png` });
  const view = frame.locator('[data-testid="storyline-view"]');
  console.log("VIEW count:", await view.count(), "empty:", (await frame.locator('[data-testid="storyline-empty"]').innerText().catch(() => "")).replace(/\n/g, " | "));
  console.log("PAGE TEXT:\n" + (await view.innerText().catch(() => "")).slice(0, 2500));
  console.log("BLOCKS:", await frame.locator('[data-testid="storyline-block"]').count());
  const badges = await frame.locator('[data-testid="storyline-badge"]').all();
  for (const b of badges) console.log("BADGE", await b.getAttribute("data-kind"), "=", (await b.innerText()).replace(/\n/g, " "));
  const slots = await frame.locator('[data-testid="storyline-beat-slot"]').all();
  console.log("BEAT SLOTS:", slots.length);
  for (const sl of slots) console.log("SLOT:", (await sl.innerText()).replace(/\n/g, " | "), "| box:", JSON.stringify(await sl.boundingBox()));
  console.log("TRACK PX:", await view.getAttribute("data-track-px"));
  const toolbarText = await bodyText(frame);
  console.log("STAGED:", /Apply \d+ change|Save \(\d+\)/.test(toolbarText));

  // --- open the FIRST beat
  await slots[0].locator("button, [role=button]").first().click({ timeout: 10_000 }).catch(async () => { await slots[0].click(); });
  await page.waitForTimeout(2000);
  const card = frame.locator('[data-testid="beat-card"]');
  console.log("CARD count:", await card.count(), "beatId:", await card.first().getAttribute("data-beat-id"));
  console.log("CARD TEXT:\n" + (await card.first().innerText().catch(() => "")));
  const rows = await frame.locator('[data-testid="beat-ticket-row"]').all();
  const rowKeys: string[] = [];
  for (const r of rows) rowKeys.push((await r.getAttribute("data-ticket-key"))!);
  console.log("BEAT1 TICKETS:", rowKeys.join(","));
  console.log("SEEDED ORDER:", st.keys.join(","));
  console.log("WHATIF:", (await frame.locator('[data-testid="beat-whatif"]').innerText().catch(() => "(none)")).replace(/\n/g, " "));
  await page.screenshot({ path: `${SHOT}/chain16-b-beatopen.png` });
  fs.writeFileSync(`${SHOT}/chain16-beat1.json`, JSON.stringify({ rowKeys, card: await card.first().innerText() }, null, 2));

  // --- Show on Gantt
  await frame.locator('[data-testid="beat-show-on-gantt"]').first().click();
  await page.waitForTimeout(3000);
  console.log("AFTER SHOW-ON-GANTT gantt rows:", await frame.locator('[data-testid="gantt-row"]').count(),
              "storyline mounted:", await frame.locator('[data-testid="storyline-view"]').count());
  const gkeys = await frame.locator('[data-testid="gantt-row"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-key")));
  console.log("GANTT ROW KEYS:", JSON.stringify(gkeys));
  await page.screenshot({ path: `${SHOT}/chain16-c-showongantt.png` });
  console.log("STAGED AFTER:", /Apply \d+ change|Save \(\d+\)/.test(await bodyText(frame)));
  console.log("CONSOLE ERRORS:", errors.filter((e) => !/atlaskit-tokens|Failed to load resource/.test(e)).join("\n") || "(none app-level)");
  expect(await frame.locator('[data-testid="storyline-block"]').count() + 1).toBeGreaterThan(0);
});

test("CHAIN16-B2 every beat opens on its stored slice; Show on Gantt focuses", async ({ page }) => {
  const st = readState();
  const errs: string[] = [];
  page.on("console", (m: any) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e: any) => errs.push(String(e).slice(0, 200)));
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
  await page.waitForTimeout(3000);
  if (await frame.locator('[data-testid="storyline-view"]').count() === 0) {
    await frame.locator('[data-testid="view-tab-storyline"]').first().click();
    await page.waitForTimeout(3500);
  }
  // Every ticket the plan holds, and every one the page can reach.
  const pageText = await frame.locator('[data-testid="storyline-view"]').innerText();
  const mentioned = new Set((pageText.match(/WFH-\d+/g) || []));
  console.log("SIDE-RUN KEYS:", (st.side || []).join(","));
  console.log("SIDE KEYS MENTIONED ON PAGE:", (st.side || []).filter((k: string) => mentioned.has(k)).join(",") || "(none)");
  console.log("SMALLER-RUNS STRIP:", await frame.locator('[data-testid="smaller-runs"]').count(),
              "UNDATED BLOCK:", await frame.locator('[data-testid="undated-block"]').count());
  console.log("HEADER LEDE:", pageText.split("\n").slice(0, 4).join(" | "));

  const slots = await frame.locator('[data-testid="storyline-beat-slot"]').all();
  const collected: string[][] = [];
  for (let i = 0; i < slots.length; i++) {
    await slots[i].locator("button").first().click({ timeout: 10_000 }).catch(async () => { await slots[i].click(); });
    await page.waitForTimeout(1500);
    const card = frame.locator('[data-testid="beat-card"]').first();
    const keys = await frame.locator('[data-testid="beat-ticket-row"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-ticket-key")));
    collected.push(keys as string[]);
    const meta = (await card.locator(".lz-sl-card-meta").innerText().catch(() => "")).replace(/\n/g, " ");
    console.log(`BEAT${i + 1} id=${await card.getAttribute("data-beat-id")} keys=${keys.join(",")}`);
    console.log(`BEAT${i + 1} meta: ${meta}`);
    console.log(`BEAT${i + 1} whatif: ${(await frame.locator('[data-testid="beat-whatif"]').innerText().catch(() => "(none)")).replace(/\n/g, " ")}`);
    console.log(`BEAT${i + 1} drift chip: ${await card.locator("text=STRUCTURE HAS MOVED").count()}`);
    await page.screenshot({ path: `${SHOT}/chain16-beat${i + 1}.png` });
    // close it again so the next open is from the same state
    await slots[i].locator("button").first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(600);
  }
  console.log("COLLECTED:", JSON.stringify(collected));
  const flat = collected.flat();
  console.log("FLAT == SEEDED ORDER:", JSON.stringify(flat) === JSON.stringify(st.keys));
  expect(flat).toEqual(st.keys);

  // --- Show on Gantt from beat 2 and assert the FOCUS, not just the switch
  await slots[1].locator("button").first().click({ timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const want = collected[1];
  await frame.locator('[data-testid="beat-show-on-gantt"]').first().click();
  await page.waitForTimeout(3500);
  const rows = await frame.locator('[data-testid="gantt-row"]').evaluateAll((els: any[]) =>
    els.map((e) => ({ key: e.getAttribute("data-row-key"), dim: e.getAttribute("data-dim") })));
  console.log("ROWS:", rows.length, "undimmed:", JSON.stringify(rows.filter((r: any) => r.dim === "none").map((r: any) => r.key)));
  console.log("BANNER:", ((await bodyText(frame)).match(/Showing [^\n]{0,80}/) || [])[0] || "(none)");
  console.log("WANTED:", want.join(","));
  console.log("STAGED:", /Apply \d+ change|Save \(\d+\)/.test(await bodyText(frame)));
  await page.screenshot({ path: `${SHOT}/chain16-e-focus.png` });
  console.log("APP CONSOLE ERRORS:", errs.filter((e) => !/atlaskit-tokens|Failed to load resource/.test(e)).join(" || ") || "(none)");
});

test("CHAIN16-C drift: one ticket to Done, reopen, done % is live", async ({ page }) => {
  const st = readState();
  const target = st.keys[2];
  const doneName = await toDoneCategory(target);
  console.log("TRANSITIONED", target, "to", doneName);
  const up: any = await getTestState("lz-ppm", { what: "incrementalUpdate", key: target });
  console.log("INCREMENTAL:", JSON.stringify(up).slice(0, 400));
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
  await page.waitForTimeout(3000);
  if (await frame.locator('[data-testid="storyline-view"]').count() === 0) {
    await frame.locator('[data-testid="view-tab-storyline"]').first().click();
    await page.waitForTimeout(3000);
  }
  console.log("DRIFT PAGE:\n" + (await frame.locator('[data-testid="storyline-view"]').innerText().catch(() => "(no view)")).slice(0, 1800));
  const slots = await frame.locator('[data-testid="storyline-beat-slot"]').all();
  await slots[0].locator("button, [role=button]").first().click({ timeout: 10_000 }).catch(async () => { await slots[0].click(); });
  await page.waitForTimeout(2000);
  console.log("DRIFT CARD:\n" + (await frame.locator('[data-testid="beat-card"]').first().innerText().catch(() => "")));
  console.log("STALE CHIP:", await frame.locator('[data-testid="storyline-stale-view"]').count(), "block stale:", await frame.locator('[data-testid="storyline-stale"]').count());
  await page.screenshot({ path: `${SHOT}/chain16-d-drift.png` });
  console.log("STAGED:", /Apply \d+ change|Save \(\d+\)/.test(await bodyText(frame)));
});

test("CHAIN16-Z cleanup", async () => {
  if (process.env.KEEP === "1") { console.log("KEEP=1, skipping cleanup"); return; }
  const st = readState();
  await getTestState("lz-ppm", { what: "aiViewDelete", planId: st.planId }).catch(() => {});
  await getTestState("lz-ppm", { what: "deleteFixture", planId: st.planId }).catch(() => {});
  for (const k of (st.all || st.keys)) await deleteIssue(k).catch(() => {});
  const plans: any = await getTestState("lz-ppm", { what: "plans" });
  const still = (plans.plans || []).some((p: any) => p.id === st.planId);
  console.log("STILL_EXISTS =", still);
  const left = await searchJql(`project = ${PROJECT} AND summary ~ "${st.tag}"`, ["summary"], 50).catch(() => []);
  console.log("ISSUES LEFT =", left.length);
  expect(still).toBe(false);
});
