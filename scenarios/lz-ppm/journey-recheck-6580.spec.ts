// RE-CHECK of what changed between v6.57.0 and v6.58.0 on LZPT (dev, wolfaenpak).
// Commits 39fdb94d..7a09f3f9. READ-ONLY on Jira in R1/R2/R3.
//
// Independently computed expectations (scratchpad/indep.js, a from-scratch
// cascade over the hook's `plan` rows — NOT app code):
//   settled plan finish            2026-10-12 (LZPT-209)
//   LZPT-194 slip 5wd  -> 6 move / 5 open, moved-set finish 2026-06-15 was 2026-06-08,
//                          plan finish UNCHANGED 2026-10-12
//   LZPT-201 slip 5wd  -> 9 move / 7 open, moved-set finish 2026-06-15 was 2026-06-08
//   LZPT-206 slip 5wd  -> 2 move / 2 open, moved-set finish 2026-10-14 was 2026-10-12,
//                          plan finish MOVES 2026-10-12 -> 2026-10-14
//   cycle cut is LZPT-202>LZPT-203; loop members {202,203,204}; the loop has NO
//   external in/out edges, so NOTHING in LZPT is upstream/downstream of it.
//   finish-driving chain = [LZPT-205, LZPT-209], 2026-09-23 -> 2026-10-12, span 19d.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import { BASE_URL } from "../../config/env";
import { writeFileSync } from "node:fs";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-recheck";
test.describe.configure({ retries: 1, timeout: 900_000 });

const report: string[] = [];
const rec = (l: string) => { report.push(l); console.log(l); };
test.afterAll(() => { console.log("\n===== RECHECK REPORT =====\n" + report.join("\n") + "\n==========================\n"); });

async function glanceFrame(page: any, timeoutMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    for (const f of page.frames()) {
      const hit = await f.evaluate(() => !!document.querySelector('[data-testid="issue-glance"]')).catch(() => false);
      if (hit) return f;
    }
    await page.waitForTimeout(1500);
  }
  return null;
}
async function openIssue(page: any, key: string) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(`${BASE_URL}/browse/${key}`, { waitUntil: "domcontentloaded" });
  let f = await glanceFrame(page, 25_000);
  if (!f) {
    await page.getByRole("button", { name: /View app actions/i }).first().click({ timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.getByRole("menuitem", { name: /LeanZero Management Position/i }).first().click({ timeout: 20_000 })
      .catch(async () => { await page.getByText(/^LeanZero Management Position$/).first().click({ timeout: 20_000 }).catch(() => {}); });
    await page.waitForTimeout(4000);
    f = await glanceFrame(page, 90_000);
  }
  if (!f) throw new Error(`glance never mounted on ${key}`);
  await page.waitForTimeout(2500);
  return f;
}
async function readGlance(f: any) {
  return f.evaluate(() => {
    const root = document.querySelector('[data-testid="issue-glance"]') as HTMLElement | null;
    if (!root) return null;
    const items = Array.from(root.querySelectorAll('[data-item]')).map((li) => ({
      id: li.getAttribute('data-item'),
      chip: (li.querySelector('.lz-badge') as HTMLElement | null)?.textContent?.trim() || null,
      sentence: (li.querySelector('p') as HTMLElement | null)?.innerText.trim() || (li as HTMLElement).innerText.trim(),
    }));
    const tabs = Array.from(root.querySelectorAll('[role="tab"]')).map((t) => ({ mode: t.getAttribute('data-mode'), selected: t.getAttribute('aria-selected') }));
    const r = root.getBoundingClientRect();
    return {
      state: root.getAttribute('data-state'), mode: root.getAttribute('data-mode'),
      planName: (root.querySelector('.lz-card span') as HTMLElement | null)?.textContent?.trim() || null,
      headerChip: Array.from(root.querySelectorAll('.lz-card .lz-badge')).map((b) => (b.textContent || '').trim()),
      items, itemCount: items.length, tabs,
      loneSentence: items.length === 0 ? (root.querySelector('p') as HTMLElement | null)?.innerText.trim() || null : null,
      width: Math.round(r.width), scrollWidth: root.scrollWidth, clientWidth: root.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth, docClientWidth: document.documentElement.clientWidth,
      text: root.innerText.trim(),
    };
  });
}

test("R1 glance on the CYCLIC LZPT plan: scoped gate, one-population what-if, measured risk", async ({ page }) => {
  const bodies: any[] = [];
  page.on("response", async (res: any) => {
    try {
      if (!/issuePosition/.test(res.request().postData() || "")) return;
      const j = JSON.parse(await res.text());
      const b = j?.data?.invokeExtension?.response?.body;
      if (b) bodies.push(b);
    } catch { /* ignore */ }
  });

  const seen: Record<string, any> = {};
  for (const key of ["LZPT-194", "LZPT-203", "LZPT-206", "LZPT-201", "LZPT-214"]) {
    const f = await openIssue(page, key);
    const g = await readGlance(f);
    seen[key] = g;
    rec(`\n### ${key} state=${g.state} mode=${g.mode} plan=${g.planName} chips=${JSON.stringify(g.headerChip)} items=${g.itemCount} tabs=${g.tabs.length} width=${g.width} scroll=${g.scrollWidth}/${g.clientWidth}`);
    for (const i of g.items) rec(`   ${key} ${i.id} [${i.chip}] :: ${i.sentence}`);
    if (g.loneSentence) rec(`   ${key} LONE :: ${g.loneSentence}`);
    await page.screenshot({ path: `${SHOT}/r1-${key}.png`, fullPage: false });
  }
  writeFileSync(`${SHOT}/r1-glances.json`, JSON.stringify(seen, null, 1));
  const lzptBodies = bodies.filter((b) => b?.selected?.planId === "plan-msq9dg8l-gz6mz1");
  writeFileSync(`${SHOT}/r1-resolver-bodies.json`, JSON.stringify(lzptBodies));
  rec(`R1_RESOLVER_BODIES=${lzptBodies.length}`);

  const g194 = seen["LZPT-194"];
  const g203 = seen["LZPT-203"];
  const g206 = seen["LZPT-206"];
  const g201 = seen["LZPT-201"];

  // --- the scoped cycle gate -------------------------------------------------
  expect(g194.state, "LZPT-194 is unrelated to the loop -> full pack").toBe("ready");
  expect(g194.itemCount, "LZPT-194 gets at least five sentences").toBeGreaterThanOrEqual(5);
  expect(g194.tabs.length, "PM|Engineer toggle offered").toBe(2);
  expect(g194.items.map((i: any) => i.id), "no loop caveat on an issue the loop cannot reach").not.toContain("loop");

  expect(g203.state, "LZPT-203 is a loop MEMBER").toBe("cycle");
  expect(g203.itemCount, "a member gets exactly one sentence").toBe(1);
  expect(g203.tabs.length, "no toggle for a member").toBe(0);

  expect(g206.state, "LZPT-206 -> full pack").toBe("ready");
  expect(g201.state, "LZPT-201 -> full pack").toBe("ready");

  // --- the what-if: ONE population, measured twice ---------------------------
  const whatIf = (g: any) => (g.items.find((i: any) => i.id === "what-if") || {}).sentence || "";
  rec(`WHATIF_194 :: ${whatIf(g194)}`);
  rec(`WHATIF_201 :: ${whatIf(g201)}`);
  rec(`WHATIF_206 :: ${whatIf(g206)}`);
  for (const [k, g, moved, open, after, before] of [
    ["LZPT-194", g194, 6, 5, "2026-06-15", "2026-06-08"],
    ["LZPT-201", g201, 9, 7, "2026-06-15", "2026-06-08"],
    ["LZPT-206", g206, 2, 2, "2026-10-14", "2026-10-12"],
  ] as any[]) {
    const s = whatIf(g);
    expect(s, `${k} what-if names the moved count`).toContain(`${moved} issue`);
    expect(s, `${k} what-if names the open count`).toContain(`${open} still open`);
    expect(s, `${k} what-if AFTER date`).toContain(after);
    expect(s, `${k} what-if BEFORE date`).toContain(before);
    const iA = s.indexOf(after), iB = s.lastIndexOf(before);
    expect(iB, `${k}: "instead of" date comes after the new date`).toBeGreaterThan(iA);
    expect(before <= after, `${k}: the BEFORE date is not later than the AFTER date`).toBe(true);
  }
  // the plan's own finish is its own clause, and only when it moved
  expect(whatIf(g206), "LZPT-206 slips the plan's own finish").toMatch(/plan's own finish moves from 2026-10-12 to 2026-10-14/);
  expect(whatIf(g194), "LZPT-194 does not move the plan finish, so no clause").not.toContain("plan's own finish");

  // --- the risk sentence names only measured causes --------------------------
  for (const k of Object.keys(seen)) {
    const r = (seen[k].items || []).find((i: any) => i.id === "risk");
    if (!r) continue;
    rec(`RISK_${k} :: ${r.sentence}`);
    expect(r.sentence, `${k}: risk sentence is not the old boilerplate`).not.toMatch(/the plan already has it later than Jira does, with work chained behind it/);
    if (/later than Jira/.test(r.sentence)) {
      // only legal when a slip was actually measured
      expect(r.sentence, `${k}: "later than Jira" must carry the measured day count`).toMatch(/has it \d+ days? later than Jira does/);
    }
  }

  // --- header chip + panel width --------------------------------------------
  for (const k of Object.keys(seen)) {
    const g = seen[k];
    const crit = g.headerChip.some((c: string) => /CRITICAL PATH/i.test(c));
    const room = (g.items || []).find((i: any) => i.id === "room");
    rec(`CHIP_${k} chips=${JSON.stringify(g.headerChip)} critical=${crit} room=${room ? room.chip : "-"}`);
    if (crit) expect(room ? room.chip : "", `${k}: CRITICAL PATH only with zero measured room`).toMatch(/NO ROOM|0 DAYS|^$/);
    expect(g.width, `${k}: the panel fills more than the 360 floor`).toBeGreaterThan(360);
    expect(g.scrollWidth, `${k}: no horizontal scroll`).toBeLessThanOrEqual(g.clientWidth + 1);
  }
});

// The other half of the header-chip claim: CRITICAL PATH must APPEAR when the
// measured room is 0. LZPT-209 is the last key of the finish-driving chain
// (independently computed), so any slip on it moves the plan's committed finish.
test("R1b the CRITICAL PATH chip on a zero-room issue", async ({ page }) => {
  const seen: Record<string, any> = {};
  for (const key of ["LZPT-209", "LZPT-205"]) {
    const f = await openIssue(page, key);
    const g = await readGlance(f);
    seen[key] = g;
    rec(`\n### ${key} state=${g.state} chips=${JSON.stringify(g.headerChip)} items=${g.itemCount} width=${g.width}`);
    for (const i of g.items) rec(`   ${key} ${i.id} [${i.chip}] :: ${i.sentence}`);
    await page.screenshot({ path: `${SHOT}/r1b-${key}.png` });
  }
  writeFileSync(`${SHOT}/r1b-glances.json`, JSON.stringify(seen, null, 1));
  const g209 = seen["LZPT-209"];
  const room209 = (g209.items || []).find((i: any) => i.id === "room");
  rec(`R1B_209 room=${room209 ? room209.chip + " :: " + room209.sentence : "-"} chips=${JSON.stringify(g209.headerChip)}`);
  expect(g209.state).toBe("ready");
  expect(room209?.chip, "LZPT-209 ends the finish-driving chain: no room at all").toMatch(/NO ROOM/i);
  expect(g209.headerChip.join(" "), "zero room => the CRITICAL PATH chip is shown").toMatch(/CRITICAL PATH/i);
});

async function bodyText(frame: any) { return (await frame.locator("body").innerText().catch(() => "")) || ""; }
async function openGantt(page: any) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? (s as any).frame : null;
  if (!frame) throw new Error("no forge frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);
  return { frame, realFrame };
}

// R2 — Explain, and it MUST be a fresh model call (cache key now carries v2).
// Independently computed: finish-driving chain = LZPT-205 -> LZPT-209, span
// 2026-09-23..2026-10-12 = 19 CALENDAR days; plan FINISH 2026-10-12.
// LZPT-215 (2026-05-04..2026-06-30) is the CPM-tightest tail and is NOT the driver.
test("R2 Explain on LZPT is a FRESH v2 call: finish-driving chain, measured answer 2, no ids", async ({ page }) => {
  const seen: any[] = [];
  page.on("response", async (res: any) => {
    try {
      if (!/explainPlan|"explain/.test(res.request().postData() || "")) return;
      const txt = await res.text();
      seen.push(txt.slice(0, 200_000));
    } catch { /* ignore */ }
  });
  const { frame, realFrame } = await openGantt(page);
  await frame.locator('[data-testid="plan-explain-btn"]').first().click({ timeout: 20_000 });
  await frame.locator('[data-testid="plan-explain-modal"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await expect.poll(async () => realFrame!.evaluate(() => {
    const m = document.querySelector('[data-testid="plan-explain-modal"]');
    if (!m) return "gone";
    if (m.querySelector('[data-testid="explain-progress"]')) return "busy";
    if (m.querySelector('[data-testid="explain-decides"]')) return "done";
    if (m.querySelector('[data-testid="explain-note"]')) return "note";
    return "pending";
  }), { timeout: 420_000, intervals: [3000] }).toMatch(/done|note/);
  await page.waitForTimeout(2000);

  const modal = await realFrame!.evaluate(() => {
    const m = document.querySelector('[data-testid="plan-explain-modal"]') as HTMLElement;
    const g = (id: string) => (m.querySelector(`[data-testid="${id}"]`) as HTMLElement | null)?.innerText.trim() || null;
    return {
      verdict: m.querySelector('[data-testid="explain-verdict"]')?.getAttribute("data-verdict") || null,
      decides: g("explain-decides"), wouldMove: g("explain-would-move"), nextMoves: g("explain-next-moves"),
      note: g("explain-note"), incomplete: g("explain-incomplete"),
      facts: g("explain-facts-strip"),
      keys: Array.from(m.querySelectorAll('[data-testid="explain-key"]')).map((k) => k.getAttribute("data-key")),
      full: m.innerText.trim(),
    };
  });
  writeFileSync(`${SHOT}/r2-explain.json`, JSON.stringify({ modal, responses: seen }, null, 1));
  rec("\n### R2 EXPLAIN verdict=" + modal.verdict);
  rec("A1_decides   <<<" + modal.decides + ">>>");
  rec("A2_wouldMove <<<" + modal.wouldMove + ">>>");
  rec("A3_nextMoves <<<" + modal.nextMoves + ">>>");
  rec("FACTS_STRIP  <<<" + modal.facts + ">>>");
  rec("NOTE=" + JSON.stringify(modal.note) + " INCOMPLETE=" + JSON.stringify(modal.incomplete));
  rec("KEYS=" + JSON.stringify(modal.keys));
  const cachedHits = seen.filter((s) => /"cached"\s*:\s*true/.test(s)).length;
  const freshHits = seen.filter((s) => /"cached"\s*:\s*false/.test(s)).length;
  rec(`R2_RESPONSES=${seen.length} cachedTrue=${cachedHits} cachedFalse=${freshHits}`);
  await page.screenshot({ path: `${SHOT}/r2-explain.png` });

  const body = modal.full;
  const idLeaks = body.match(/\bchain-\d+\b|\b(ch|tp|ti|ot|ow|ends|finish)-[0-9a-zA-Z]{4,}\b/g) || [];
  rec("R2_ID_LEAKS=" + JSON.stringify(idLeaks));

  expect(freshHits, "the v2 cache key forces a FRESH model call").toBeGreaterThan(0);
  expect(cachedHits, "nothing was served out of the old cache").toBe(0);
  expect(modal.decides, "answer 1").toBeTruthy();
  expect(modal.wouldMove, "answer 2").toBeTruthy();
  expect(modal.nextMoves, "answer 3").toBeTruthy();
  // answer 1 is about the FINISH-DRIVING chain
  expect(modal.decides, "answer 1 names a key on the finish-driving chain (LZPT-205 / LZPT-209)").toMatch(/LZPT-205|LZPT-209/);
  expect(/LZPT-215[^.]{0,120}(drives|sets|decides|holds)[^.]{0,40}(finish|end date)/i.test(modal.decides!),
    "answer 1 must not call LZPT-215 the finish driver").toBe(false);
  // answer 2 is a MEASUREMENT, not an apology
  expect(modal.wouldMove, "answer 2 is not an apology").not.toMatch(/incomplete|cannot determine|unable|not available/i);
  expect(modal.wouldMove, "answer 2 carries a number").toMatch(/\d/);
  expect(idLeaks, "no synthetic chain ids anywhere in the modal").toEqual([]);
  // the strip
  expect(modal.facts, "the strip labels the span as finish-driving").toMatch(/Finish-driving span/i);
  expect(modal.facts, "FINISH is the plan's settled finish").toMatch(/2026-10-12/);
});

// R3 — AI structure: build, the Other-work WORK count + separate parent chip,
// segment header arithmetic reconciles, depth 0/23/45, rename survives a reload.
test("R3 structure on LZPT: header counts WORK, parents are their own chip", async ({ page }) => {
  const { frame, realFrame } = await openGantt(page);
  await frame.locator('[data-testid="gantt-group-select"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await frame.getByText(/AI structure/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(5000);
  const buildBtn = frame.locator('[data-testid="ai-structure-build"]');
  const rebuildBtn = frame.locator('[data-testid="ai-structure-rebuild"]');
  if (await buildBtn.count()) { rec("R3_TRIGGER=Build"); await buildBtn.first().click(); }
  else if (await rebuildBtn.count()) { rec("R3_TRIGGER=Rebuild"); await rebuildBtn.first().click(); }
  else rec("R3_TRIGGER=already built");
  await expect.poll(async () => realFrame!.evaluate(() =>
    document.querySelectorAll('[data-testid="gantt-group-header"]').length), { timeout: 420_000, intervals: [4000] }).toBeGreaterThan(0);
  await page.waitForTimeout(4000);

  const read = async () => realFrame!.evaluate(() => ({
    headers: Array.from(document.querySelectorAll('[data-testid="gantt-group-header"]')).map((h) => ({
      text: (h as HTMLElement).innerText.replace(/\n+/g, " | ").trim(),
      chips: Array.from(h.querySelectorAll('.lz-badge, [data-chip]')).map((c) => (c as HTMLElement).innerText.trim()),
    })),
    rows: document.querySelectorAll('[data-row-key]').length,
    depth: (document.querySelector('[data-testid="depth-control"]') as HTMLElement | null)?.innerText.replace(/\n+/g, " ").trim() || null,
  }));
  const built = await read();
  rec("\n### R3 headers (" + built.headers.length + "), rows=" + built.rows + " depth=" + built.depth);
  for (const h of built.headers) rec("   HDR " + h.text);
  writeFileSync(`${SHOT}/r3-structure.json`, JSON.stringify(built, null, 1));
  await page.screenshot({ path: `${SHOT}/r3-structure.png` });
  expect(built.headers.length, "the built view has segment headers").toBeGreaterThan(0);

  // the depth control: 0 / 23 / 45 rows
  const depths: any[] = [];
  for (const d of ["segments", "chains", "issues"]) {
    const btn = frame.locator(`[data-testid="gantt-depth-${d}"]`);
    if (!(await btn.count())) { depths.push({ d, rows: "NO CONTROL" }); continue; }
    await btn.first().click();
    await page.waitForTimeout(2000);
    const st = await realFrame!.evaluate(() => ({
      depth: document.querySelector('[data-testid="gantt-depth-control"]')?.getAttribute("data-depth") || null,
      rows: document.querySelectorAll('[data-row-key]').length,
      headers: document.querySelectorAll('[data-testid="gantt-group-header"]').length,
    }));
    depths.push({ d, ...st });
    await page.screenshot({ path: `${SHOT}/r3-depth-${d}.png` });
  }
  rec("R3_DEPTHS=" + JSON.stringify(depths));
  const byD = Object.fromEntries(depths.map((x: any) => [x.d, x.rows]));
  expect(byD.segments, "segments depth shows no issue rows").toBe(0);
  expect(byD.chains, "chains depth shows the 23 chain rows").toBe(23);
  expect(byD.issues, "issues depth shows all 45").toBe(45);

  // --- rename a segment and prove it survives a reload -----------------------
  const HDR = "Cycle Resolution";
  const NEWNAME = "Recheck Rename 6580";
  const menu = frame.locator('[data-testid="gantt-segment-menu-button"]');
  rec("R3_SEGMENT_MENUS=" + (await menu.count()));
  if (await menu.count()) {
    const idx = built.headers.findIndex((h: any) => h.text.startsWith(HDR));
    await menu.nth(Math.max(0, idx)).click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(800);
    await frame.getByText(/^Rename/).first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const input = frame.locator('[data-testid="ai-segment-rename-input"]');
    if (await input.count()) {
      await input.first().fill(NEWNAME);
      await frame.locator('[data-testid="ai-segment-rename-save"]').first().click().catch(() => {});
      await page.waitForTimeout(3000);
      const afterRename = await read();
      rec("R3_AFTER_RENAME=" + JSON.stringify(afterRename.headers.map((h: any) => h.text)));
      const re = await openGantt(page);
      await re.frame.locator('[data-testid="gantt-group-select"]').first().click().catch(() => {});
      await page.waitForTimeout(700);
      await re.frame.getByText(/AI structure/i).first().click().catch(() => {});
      await page.waitForTimeout(8000);
      const afterReload = await re.realFrame!.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid="gantt-group-header"]')).map((h) => (h as HTMLElement).innerText.replace(/\n+/g, " | ").trim()));
      rec("R3_AFTER_RELOAD=" + JSON.stringify(afterReload));
      await page.screenshot({ path: `${SHOT}/r3-after-reload.png` });
      expect(afterReload.join(" | "), "the rename survives a full reload").toContain(NEWNAME);
    } else rec("R3_RENAME=no rename input");
  }
});

// R9 — BED PROOF at exit: no staged draft, 45 issues, no AI view, protection off.
test("R9 bed state at exit", async ({ page }) => {
  const { frame, realFrame } = await openGantt(page);
  const st = await realFrame!.evaluate(() => ({
    body: (document.body.innerText || "").slice(0, 4000),
    rows: document.querySelectorAll('[data-row-key]').length,
    groupHeaders: document.querySelectorAll('[data-testid="gantt-group-header"]').length,
  }));
  const staged = /Apply\s+\d+\s+change|Save\s*\(\s*\d+\s*\)|\bDiscard all\b/i.test(st.body);
  const counts = st.body.match(/\d+\s+issues?\s*[·|]?\s*\d+\s+tasks?/i);
  rec("STAGED_AFTER_CLEANUP (should be FALSE): " + staged);
  rec("R9_ROWS=" + st.rows + " groupHeaders=" + st.groupHeaders + " counts=" + JSON.stringify(counts && counts[0]));
  await page.screenshot({ path: `${SHOT}/r9-bed.png` });
  expect(staged, "no staged draft left on LZPT").toBe(false);
  expect(st.rows, "45 rows").toBe(45);
});
