// ISSUE GLANCE live journey (dev v6.57.0, commits 079e9d02 + 326e45bf).
//
// Drives the REAL jira:issuePanel "LeanZero Management Position" in the Jira
// issue view on wolfaenpak and reads every sentence it renders, then compares it
// to a pack computed OUTSIDE the browser from the same resolver response.
//
// LZPT Scenarios carries a deliberate dependency LOOP (LZPT-202→203→204→202), and
// buildIssuePosition's cycle gate is PLAN-WIDE — so every one of the 45 issues
// degrades to the single LOOP sentence. To exercise PM/Engineer at all a second,
// ACYCLIC plan over the same project is needed; the runner creates it with the
// hook when LZ_GLANCE_FIXTURE_PLAN is set, and MUST delete it afterwards.
//
// Env: LZ_GLANCE_FIXTURE_PLAN=<planId of the acyclic fixture> (optional).
// READ-ONLY on Jira. No Apply. Keys float → chosen by summary via the hook.
import { test, expect } from "../../fixtures/forge";
import { assertLoggedIn } from "../../forge/browser";
import { BASE_URL } from "../../config/env";
import { writeFileSync } from "node:fs";

const LZPT_PLAN = "plan-msq9dg8l-gz6mz1";
const FIXTURE_PLAN = process.env.LZ_GLANCE_FIXTURE_PLAN || "";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-glance";
test.describe.configure({ retries: 1, timeout: 420_000 });

const report: string[] = [];
const rec = (l: string) => { report.push(l); console.log(l); };

/** Find the frame that actually hosts the glance (the issue page has several). */
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
  // The panel is a jira:issuePanel: it mounts in the issue body, sometimes behind
  // a collapsed section. Expand anything named after the module first.
  // TRAP (found 2026-09-16): a Forge jira:issuePanel does NOT render on a Jira
  // issue until the reader adds it once from the issue's "View app actions" menu.
  // Nothing is on the page before that — and the pre-existing render smoke was
  // passing against ANOTHER vendor's panel iframe because of it.
  let f = await glanceFrame(page, 20_000);
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

/** Everything the user can see, enumerated. */
async function readGlance(f: any) {
  return f.evaluate(() => {
    const root = document.querySelector('[data-testid="issue-glance"]') as HTMLElement | null;
    if (!root) return null;
    const items = Array.from(root.querySelectorAll('[data-item]')).map((li) => ({
      id: li.getAttribute('data-item'),
      chip: (li.querySelector('.lz-badge') as HTMLElement | null)?.textContent?.trim() || null,
      sentence: (li.querySelector('p') as HTMLElement | null)?.innerText.trim() || (li as HTMLElement).innerText.trim(),
      bold: Array.from(li.querySelectorAll('strong')).map((s) => (s.textContent || '').trim()),
    }));
    const tabs = Array.from(root.querySelectorAll('[role="tab"]')).map((t) => ({
      mode: t.getAttribute('data-mode'), selected: t.getAttribute('aria-selected'), label: (t.textContent || '').trim(),
    }));
    const planBtns = Array.from(root.querySelectorAll('[role="group"] button')).map((b) => ({
      name: (b.textContent || '').trim(), pressed: b.getAttribute('aria-pressed'), disabled: (b as HTMLButtonElement).disabled,
    }));
    return {
      state: root.getAttribute('data-state'), mode: root.getAttribute('data-mode'),
      planName: (root.querySelector('.lz-card span') as HTMLElement | null)?.textContent?.trim() || null,
      headerChip: Array.from(root.querySelectorAll('.lz-card .lz-badge')).map((b) => (b.textContent || '').trim()),
      items, itemCount: items.length, tabs, planBtns,
      loneSentence: items.length === 0 ? (root.querySelector('p') as HTMLElement | null)?.innerText.trim() || null : null,
      // horizontal-scroll audit at the rail width
      scrollWidth: root.scrollWidth, clientWidth: root.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth, docClientWidth: document.documentElement.clientWidth,
      text: root.innerText.trim(),
    };
  });
}

test("GLANCE1 chained dated issue: PM pack, Engineer pack, toggle persists, no h-scroll", async ({ page }) => {
  test.skip(!FIXTURE_PLAN, "needs LZ_GLANCE_FIXTURE_PLAN (an ACYCLIC plan over LZPT)");
  const calls: any[] = [];
  page.on("response", async (res: any) => {
    try {
      const post = res.request().postData() || "";
      if (!/issuePosition/.test(post)) return;
      calls.push({ status: res.status(), body: (await res.text().catch(() => "")).slice(0, 400_000) });
    } catch { /* ignore */ }
  });

  let f = await openIssue(page, "LZPT-194");
  let g = await readGlance(f);
  rec("GLANCE1_DEFAULT=" + JSON.stringify({ state: g.state, mode: g.mode, plan: g.planName, chips: g.headerChip, tabs: g.tabs, plans: g.planBtns, n: g.itemCount }));
  for (const i of g.items) rec(`  PM_ITEM ${i.id} [${i.chip}] :: ${i.sentence}`);
  await page.screenshot({ path: `${SHOT}/01-lzpt194-default.png`, fullPage: false });

  // If the default selection landed on the cyclic plan, switch to the acyclic one.
  if (g.state === "cycle") {
    rec("GLANCE1 default plan is the CYCLIC one — switching via the plan chip");
    const btn = g.planBtns.find((b: any) => /glance acyclic/i.test(b.name));
    expect(btn, "the acyclic plan is offered as a chip").toBeTruthy();
    await f.evaluate((n: string) => {
      const b = Array.from(document.querySelectorAll('[role="group"] button')).find((x) => (x.textContent || '').trim() === n) as HTMLButtonElement;
      b?.click();
    }, btn!.name);
    await page.waitForTimeout(6000);
    g = await readGlance(f);
    rec("GLANCE1_AFTER_SWITCH=" + JSON.stringify({ state: g.state, plan: g.planName, n: g.itemCount }));
    for (const i of g.items) rec(`  PM_ITEM ${i.id} [${i.chip}] :: ${i.sentence}`);
    await page.screenshot({ path: `${SHOT}/02-lzpt194-acyclic.png` });
  }

  expect(g.state, "a dated chained issue in an acyclic plan reaches the ready state").toBe("ready");
  expect(g.itemCount, "PM mode renders at most six sentences").toBeLessThanOrEqual(6);
  expect(g.itemCount, "PM mode renders at least three").toBeGreaterThanOrEqual(3);
  expect(g.tabs.length, "the PM | Engineer toggle is offered").toBe(2);
  expect(g.mode).toBe("pm");
  // no horizontal scroll inside the rail
  rec(`GLANCE1_WIDTH root ${g.scrollWidth}/${g.clientWidth} doc ${g.docScrollWidth}/${g.docClientWidth}`);
  expect(g.scrollWidth, "the glance does not scroll horizontally").toBeLessThanOrEqual(g.clientWidth + 1);

  // ENGINEER
  await f.evaluate(() => (document.querySelector('[role="tab"][data-mode="engineer"]') as HTMLButtonElement)?.click());
  await page.waitForTimeout(1500);
  const e = await readGlance(f);
  rec("GLANCE1_ENGINEER=" + JSON.stringify({ mode: e.mode, n: e.itemCount, tabs: e.tabs }));
  for (const i of e.items) rec(`  ENG_ITEM ${i.id} [${i.chip}] :: ${i.sentence}`);
  await page.screenshot({ path: `${SHOT}/03-lzpt194-engineer.png` });
  expect(e.mode).toBe("engineer");
  expect(e.itemCount).toBeLessThanOrEqual(6);
  const engIds = e.items.map((i: any) => i.id);
  expect(engIds, "engineer mode names the start/finish").toContain("dates");
  expect(engIds, "engineer mode names what it waits on").toContain("waiting");
  expect(engIds, "engineer mode names what it unblocks").toContain("unblocks");
  expect(e.scrollWidth).toBeLessThanOrEqual(e.clientWidth + 1);

  // PERSIST across a full reload
  f = await openIssue(page, "LZPT-194");
  let r = await readGlance(f);
  if (r.state === "cycle") {
    const btn = r.planBtns.find((b: any) => /glance acyclic/i.test(b.name));
    await f.evaluate((n: string) => { (Array.from(document.querySelectorAll('[role="group"] button')).find((x) => (x.textContent || '').trim() === n) as HTMLButtonElement)?.click(); }, btn!.name);
    await page.waitForTimeout(6000);
    r = await readGlance(f);
  }
  rec("GLANCE1_AFTER_RELOAD mode=" + r.mode + " selectedTab=" + JSON.stringify(r.tabs));
  await page.screenshot({ path: `${SHOT}/04-lzpt194-after-reload.png` });
  expect(r.mode, "the PM|Engineer choice survives a reload").toBe("engineer");

  // restore PM for the rest of the sweep
  await f.evaluate(() => (document.querySelector('[role="tab"][data-mode="pm"]') as HTMLButtonElement)?.click());
  await page.waitForTimeout(800);

  // the resolver response the panel actually used
  rec("GLANCE1_RESOLVER_CALLS=" + calls.length);
  if (calls.length) {
    const last = JSON.parse(calls[calls.length - 1].body);
    const payload = last?.result ?? last;
    rec("GLANCE1_RESPONSE_TOPKEYS=" + JSON.stringify(Object.keys(payload || {})));
    writeFileSync(`${SHOT}/resolver-response.json`, JSON.stringify(payload));
  }
});

test("GLANCE2 an issue in the CYCLE LOOP: one sentence, no toggle", async ({ page }) => {
  const f = await openIssue(page, "LZPT-203");
  const g = await readGlance(f);
  rec("GLANCE2=" + JSON.stringify({ state: g.state, plan: g.planName, n: g.itemCount, tabs: g.tabs.length, text: g.text }));
  for (const i of g.items) rec(`  CYCLE_ITEM ${i.id} [${i.chip}] :: ${i.sentence}`);
  await page.screenshot({ path: `${SHOT}/10-lzpt203-cycle.png` });
  expect(g.state).toBe("cycle");
  expect(g.itemCount, "the cycle state is exactly one sentence").toBe(1);
  expect(g.tabs.length, "no PM|Engineer toggle when both modes say the same thing").toBe(0);
  expect(g.scrollWidth).toBeLessThanOrEqual(g.clientWidth + 1);
});

test("GLANCE3 the plan-wide cycle gate blanks an issue far from the loop", async ({ page }) => {
  // LZPT-186..196 are the linear chain under E1; the loop is under E3. They share
  // nothing but the plan. This test records what the PM sees.
  const f = await openIssue(page, "LZPT-196");
  const g = await readGlance(f);
  rec("GLANCE3_LZPT196=" + JSON.stringify({ state: g.state, plan: g.planName, n: g.itemCount, tabs: g.tabs.length, plans: g.planBtns, text: g.text }));
  await page.screenshot({ path: `${SHOT}/20-lzpt196.png` });
  // No assertion on the defect: the verdict is in the report. Only the honesty
  // invariant is asserted — whatever it shows, it must not be blank.
  expect(g.itemCount + (g.loneSentence ? 1 : 0)).toBeGreaterThan(0);
});

test("GLANCE4 undated issue: three sentences", async ({ page }) => {
  test.skip(!FIXTURE_PLAN, "needs LZ_GLANCE_FIXTURE_PLAN");
  const f = await openIssue(page, "LZPT-212");
  let g = await readGlance(f);
  if (g.state === "cycle") {
    const btn = g.planBtns.find((b: any) => /glance acyclic/i.test(b.name));
    expect(btn, "the acyclic plan chip is offered").toBeTruthy();
    await f.evaluate((n: string) => { (Array.from(document.querySelectorAll('[role="group"] button')).find((x) => (x.textContent || '').trim() === n) as HTMLButtonElement)?.click(); }, btn!.name);
    await page.waitForTimeout(6000);
    g = await readGlance(f);
  }
  rec("GLANCE4_UNDATED=" + JSON.stringify({ state: g.state, plan: g.planName, mode: g.mode, n: g.itemCount }));
  for (const i of g.items) rec(`  UNDATED_ITEM ${i.id} [${i.chip}] :: ${i.sentence}`);
  await page.screenshot({ path: `${SHOT}/30-lzpt212-undated.png` });
  expect(g.state).toBe("ready");
  expect(g.itemCount, "an undated issue gets three sentences").toBe(3);
  expect(g.items.map((i: any) => i.id)).toContain("no-dates");
  expect(g.text, "nothing prints an em-dash placeholder").not.toMatch(/—\s*$/m);
});

test("GLANCE5 an issue in no plan: one sentence, no chip, no toggle", async ({ page }) => {
  const f = await openIssue(page, "WFH-1");
  const g = await readGlance(f);
  rec("GLANCE5_NOTINPLAN=" + JSON.stringify(g));
  await page.screenshot({ path: `${SHOT}/40-wfh1-not-in-plan.png` });
  expect(g.state, "no data-state attribute on the lone-sentence panel").toBeNull();
  expect(g.itemCount).toBe(0);
  expect(g.loneSentence).toMatch(/not in any LeanZero plan/i);
  expect(g.tabs.length).toBe(0);
  expect(g.scrollWidth).toBeLessThanOrEqual(g.clientWidth + 1);
});

test.afterAll(async () => {
  console.log("\n============== ISSUE GLANCE REPORT ==============\n" + report.join("\n") + "\n================================================\n");
});

// The DECISIVE test for the plan-wide cycle gate: LZPT-196 is the tail of the
// linear chain under Epic E1; the loop lives under E3 and shares nothing with it
// but the plan. Switching the plan chip to "LZPT Scenarios" must therefore be the
// ONLY thing that changes — and it replaces five measured sentences with one.
// It also captures the resolver response the panel used, for the REST comparison.
test("GLANCE6 same issue, two plans: the cyclic plan's pack vs the acyclic one's", async ({ page }) => {
  test.skip(!FIXTURE_PLAN, "needs LZ_GLANCE_FIXTURE_PLAN");
  const bodies: any[] = [];
  page.on("response", async (res: any) => {
    try {
      if (!/issuePosition/.test(res.request().postData() || "")) return;
      const j = JSON.parse(await res.text());
      const b = j?.data?.invokeExtension?.response?.body;
      if (b) bodies.push(b);
    } catch { /* ignore */ }
  });
  const f = await openIssue(page, "LZPT-196");
  const acyclic = await readGlance(f);
  rec("GLANCE6_ACYCLIC=" + JSON.stringify({ plan: acyclic.planName, state: acyclic.state, n: acyclic.itemCount, tabs: acyclic.tabs.length }));
  for (const i of acyclic.items) rec(`  A_ITEM ${i.id} [${i.chip}] :: ${i.sentence}`);
  await page.screenshot({ path: `${SHOT}/50-lzpt196-acyclic.png` });

  await f.evaluate(() => {
    const b = Array.from(document.querySelectorAll('[role="group"] button')).find((x) => (x.textContent || '').trim() === 'LZPT Scenarios') as HTMLButtonElement;
    b?.click();
  });
  await page.waitForTimeout(8000);
  const cyclic = await readGlance(f);
  rec("GLANCE6_CYCLIC=" + JSON.stringify({ plan: cyclic.planName, state: cyclic.state, n: cyclic.itemCount, tabs: cyclic.tabs.length, text: cyclic.text }));
  for (const i of cyclic.items) rec(`  C_ITEM ${i.id} [${i.chip}] :: ${i.sentence}`);
  await page.screenshot({ path: `${SHOT}/51-lzpt196-cyclic.png` });

  const forLzpt = bodies.filter((b) => b?.selected?.planId === LZPT_PLAN).pop();
  if (forLzpt) writeFileSync(`${SHOT}/panel-pack-lzpt196.json`, JSON.stringify(forLzpt));
  rec("GLANCE6_PANEL_PACK_CAPTURED=" + !!forLzpt + " bodies=" + bodies.length);

  expect(acyclic.state, "the acyclic plan gives LZPT-196 a real position").toBe("ready");
  expect(acyclic.itemCount).toBeGreaterThanOrEqual(3);
  expect(cyclic.state, "the SAME issue in the plan that has a loop elsewhere").toBe("cycle");
  expect(cyclic.itemCount, "…is reduced to one sentence about two other issues").toBe(1);
  expect(cyclic.text).toContain("LZPT-202");
});
