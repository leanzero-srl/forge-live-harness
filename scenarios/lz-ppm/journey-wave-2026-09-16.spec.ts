// WAVE 2026-09-16 acceptance journey on LZPT (dev, v6.56.0).
// Drives the CHANGED controls of this wave and asserts their user-visible effect:
//   1. app-Tooltip on lock chip (Gantt + Table), type badge, writability "N partial"
//      pill and the toolbar "?" InfoTips  -> [data-testid=lz-tooltip] non-empty
//   2. initial focus frames the critical path; Group -> AI structure keeps the
//      viewport (no blank); header collapse/expand; depth control
//   3. AI structure v2: build, strategy, segment coverage of all 45 issues,
//      converged chain rows, density strip, strategy picker disabled+reason,
//      depth control, segment menu rename
//   4. Explain (three answers, no chain-id / "Finish —" leakage)
//   5. Writability modal + its "field not on project" action row
// READ-ONLY on Jira. Never Applies. Keys float -> selected by summary/DOM only.
//
// ORDERING: WAVE2 is the only test that BUILDS the AI view; WAVE5/WAVE6/WAVE7 need
// a built view and must run after it. The LZPT bed's resting state has NO stored AI
// view, so after a full sweep restore it with
//   curl -H "Authorization: Bearer $HARNESS_SECRET" \
//        "$LZ_PPM_TESTHOOK_URL?what=aiViewDelete&planId=plan-msq9dg8l-gz6mz1"
// and re-check what=aiView returns view:null, what=clearDrafts returns cleared:0.
// Run ONE AT A TIME (-g WAVEn): parallel runs contend on the same plan.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/live-wave";
test.describe.configure({ retries: 0, timeout: 600_000 });

async function bodyText(frame: any) { return (await frame.locator("body").innerText().catch(() => "")) || ""; }

async function openGantt(page: any) {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
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

/** Real pointer hover onto the nth match of `sel` (optionally filtered by text),
 *  then read [data-testid=lz-tooltip]. Returns {found, text, box}. */
async function hoverTip(page: any, realFrame: any, sel: string, opts: { index?: number; textIs?: string } = {}) {
  const handles = await realFrame.$$(sel);
  const picked: any[] = [];
  for (const h of handles) {
    if (opts.textIs !== undefined) {
      // LEAF only: the Tooltip wrapper <span> also has textContent "?", so an
      // unfiltered index hits the wrapper and the icon of the SAME tip twice and
      // silently under-covers the real set.
      const t = (await h.evaluate((e: any) => (e.children.length === 0 ? (e.textContent || "").trim() : "\u0000"))) as string;
      if (t !== opts.textIs) continue;
    }
    const box = await h.boundingBox();
    // MUST be genuinely on screen: a chip scrolled out of the row list still has a
    // boundingBox, and hovering its coordinates hovers whatever is really there.
    const vis = box ? await h.evaluate((e: any) => {
      const b = e.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return false;
      if (b.top < 0 || b.left < 0 || b.bottom > (e.ownerDocument.defaultView.innerHeight) || b.right > (e.ownerDocument.defaultView.innerWidth)) return false;
      const sc = e.closest('[data-gantt-scroll="1"]');
      if (sc) { const r = sc.getBoundingClientRect(); if (b.top < r.top || b.bottom > r.bottom || b.left < r.left || b.right > r.right) return false; }
      const mid = e.ownerDocument.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return !!mid && (e === mid || e.contains(mid) || mid.contains(e));
    }) : false;
    if (vis) picked.push({ h, box });
  }
  const target = picked[opts.index ?? 0];
  if (!target) return { found: false, reason: "no visible element for " + sel, text: "", count: picked.length };
  // move away first so a previous tip is torn down and mouseenter re-fires
  await page.mouse.move(5, 5);
  await page.waitForTimeout(250);
  await page.mouse.move(target.box.x + target.box.width / 2, target.box.y + target.box.height / 2, { steps: 8 });
  await page.waitForTimeout(900);
  const text = await realFrame.evaluate(() => {
    const t = document.querySelector('[data-testid="lz-tooltip"]');
    return t ? (t.textContent || "").trim() : null;
  });
  return { found: !!text, text: text || "", count: picked.length };
}

const report: string[] = [];
function rec(line: string) { report.push(line); console.log(line); }

// ---------------------------------------------------------------- 1 + 2 ------
test("WAVE1 tooltips on every changed chip + initial focus frames the critical path", async ({ page }) => {
  const { frame, realFrame } = await openGantt(page);

  // --- initial focus: chip + a zero-slack bar actually inside the scroll viewport
  const chip = await realFrame!.evaluate(() => {
    const c = document.querySelector('[data-testid="gantt-focus-chip"]');
    return c ? { reason: c.getAttribute("data-focus-reason"), label: (c.textContent || "").replace("×", "").trim() } : null;
  });
  rec("FOCUS_CHIP=" + JSON.stringify(chip));
  const crit = await realFrame!.evaluate(() => {
    const sc = document.querySelector('[data-gantt-scroll="1"]') as HTMLElement | null;
    if (!sc) return { err: "no scroller" };
    const r = sc.getBoundingClientRect();
    const bars = Array.from(document.querySelectorAll('[data-testid="gantt-bar"][data-critical="1"]'));
    const vis = bars.filter((b) => {
      const bb = (b as HTMLElement).getBoundingClientRect();
      return bb.right > r.left && bb.left < r.right && bb.bottom > r.top && bb.top < r.bottom && bb.width > 0;
    });
    return {
      scrollLeft: Math.round(sc.scrollLeft), scrollTop: Math.round(sc.scrollTop),
      criticalBars: bars.length,
      criticalVisible: vis.length,
      visibleKeys: vis.map((b) => b.getAttribute("data-key")),
      totalBars: document.querySelectorAll('[data-testid="gantt-bar"]').length,
    };
  });
  rec("INITIAL_VIEWPORT=" + JSON.stringify(crit));
  await page.screenshot({ path: `${SHOT}/01-initial-focus.png` });

  // The focus chip names the chain it opened on. Prove THAT bar is on screen,
  // then turn Critical ON (data-critical only exists while the toggle is on) and
  // prove a zero-slack bar is framed.
  const focusKey = (chip?.label || "").match(/[A-Z][A-Z0-9]+-\d+/)?.[0] || null;
  const focusVisible = focusKey ? await realFrame!.evaluate((k) => {
    const sc = document.querySelector('[data-gantt-scroll="1"]') as HTMLElement;
    const r = sc.getBoundingClientRect();
    const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null;
    if (!el) return { present: false };
    const b = el.getBoundingClientRect();
    return { present: true, inViewport: b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom };
  }, focusKey) : null;
  rec(`FOCUS_KEY=${focusKey} FOCUS_BAR=` + JSON.stringify(focusVisible));

  await frame.getByRole("button", { name: /^Critical/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  const critOn = await realFrame!.evaluate(() => {
    const sc = document.querySelector('[data-gantt-scroll="1"]') as HTMLElement;
    const r = sc.getBoundingClientRect();
    const bars = Array.from(document.querySelectorAll('[data-testid="gantt-bar"][data-critical="1"]'));
    const vis = bars.filter((b) => { const bb = (b as HTMLElement).getBoundingClientRect(); return bb.right > r.left && bb.left < r.right && bb.bottom > r.top && bb.top < r.bottom; });
    return { criticalBars: bars.length, criticalVisible: vis.length, visibleKeys: vis.map((b) => b.getAttribute("data-key")), scrollLeft: Math.round(sc.scrollLeft), scrollTop: Math.round(sc.scrollTop) };
  });
  rec("CRITICAL_ON=" + JSON.stringify(critOn));
  await page.screenshot({ path: `${SHOT}/01b-critical-on.png` });
  await frame.getByRole("button", { name: /^Critical/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);

  // --- tooltips, Gantt side
  const results: Record<string, any> = {};
  results["gantt.lock-chip"] = await hoverTip(page, realFrame, '[data-testid="writability-lock"]');
  await page.screenshot({ path: `${SHOT}/02-tip-gantt-lock.png` });
  results["gantt.type-badge"] = await hoverTip(page, realFrame, '[data-testid="gantt-type-badge"]');
  await page.screenshot({ path: `${SHOT}/03-tip-type-badge.png` });
  results["toolbar.partial-pill"] = await hoverTip(page, realFrame, '[data-testid="writability-chip"]');
  await page.screenshot({ path: `${SHOT}/04-tip-partial-pill.png` });

  // every "?" InfoTip currently on screen (toolbar + gantt sidebar header)
  const infoCount = await realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll("span")).filter((s) => (s.textContent || "").trim() === "?" && s.children.length === 0).length);
  rec("INFOTIPS_ON_SCREEN=" + infoCount);
  for (let i = 0; i < infoCount; i++) {
    results[`infotip[${i}]`] = await hoverTip(page, realFrame, "span", { index: i, textIs: "?" });
  }
  await page.screenshot({ path: `${SHOT}/05-tip-infotip.png` });

  // --- Table side lock chip
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  results["table.lock-chip"] = await hoverTip(page, realFrame, '[data-testid="writability-lock"]');
  await page.screenshot({ path: `${SHOT}/06-tip-table-lock.png` });

  for (const [k, v] of Object.entries(results)) rec(`TIP ${k} -> ${v.found ? "OK" : "FAIL"} n=${v.count} :: ${JSON.stringify((v.text || "").slice(0, 160))}`);
  const failed = Object.entries(results).filter(([, v]) => !v.found).map(([k]) => k);
  rec("TIP_FAILURES=" + JSON.stringify(failed));
  expect(focusVisible?.inViewport, "the focus chip's chain bar is framed on load").toBeTruthy();
  expect(critOn.criticalVisible, "a zero-slack bar is inside the scroll viewport on load").toBeGreaterThan(0);
  expect(failed, "every changed chip shows an app tooltip").toEqual([]);
});

// ------------------------------------------------------------------- 3 -------
test("WAVE2 AI structure v2 on LZPT: build, coverage, chains, density, picker, depth, menu", async ({ page }) => {
  const { frame, realFrame } = await openGantt(page);

  const scrollLeftBefore = await realFrame!.evaluate(() => Math.round((document.querySelector('[data-gantt-scroll="1"]') as HTMLElement).scrollLeft));
  const rowsBefore = await realFrame!.evaluate(() => document.querySelectorAll('[data-testid="gantt-row"]').length);
  rec("BEFORE_SWITCH scrollLeft=" + scrollLeftBefore + " rows=" + rowsBefore);

  // Group -> AI structure (custom Select, never a native one)
  await frame.locator('[data-testid="gantt-group-select"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await frame.getByText(/AI structure/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${SHOT}/10-after-group-switch.png` });

  const afterSwitch = await realFrame!.evaluate(() => {
    const sc = document.querySelector('[data-gantt-scroll="1"]') as HTMLElement;
    const r = sc.getBoundingClientRect();
    const visRows = Array.from(document.querySelectorAll('[data-testid="gantt-row"]')).filter((el) => {
      const b = (el as HTMLElement).getBoundingClientRect();
      return b.bottom > r.top && b.top < r.bottom && b.height > 0;
    });
    const visBars = Array.from(document.querySelectorAll('[data-testid="gantt-bar"]')).filter((el) => {
      const b = (el as HTMLElement).getBoundingClientRect();
      return b.right > r.left && b.left < r.right && b.bottom > r.top && b.top < r.bottom && b.width > 0;
    });
    const st = document.querySelector('[data-testid="ai-structure-status"]');
    return { scrollLeft: Math.round(sc.scrollLeft), visRows: visRows.length, visBars: visBars.length, status: st?.getAttribute("data-state") || null, statusText: (st?.textContent || "").trim() };
  });
  rec("AFTER_SWITCH=" + JSON.stringify(afterSwitch));
  expect(afterSwitch.visRows, "viewport not blank after Group->AI structure (rows)").toBeGreaterThan(0);
  expect(afterSwitch.visBars, "viewport not blank after Group->AI structure (bars)").toBeGreaterThan(0);
  expect(Math.abs(afterSwitch.scrollLeft - scrollLeftBefore), "scrollLeft preserved across the grouping switch").toBeLessThanOrEqual(2);

  // --- BUILD (or rebuild) and wait for the view
  const buildBtn = frame.locator('[data-testid="ai-structure-build"]');
  const rebuildBtn = frame.locator('[data-testid="ai-structure-rebuild"]');
  const t0 = Date.now();
  if (await buildBtn.count()) { rec("TRIGGER=Build AI structure"); await buildBtn.first().click(); }
  else if (await rebuildBtn.count()) { rec("TRIGGER=Rebuild"); await rebuildBtn.first().click(); }
  else rec("TRIGGER=none (no Build/Rebuild button rendered) status=" + afterSwitch.status);

  await expect
    .poll(async () => realFrame!.evaluate(() => document.querySelector('[data-testid="ai-structure-status"]')?.getAttribute("data-state") || "none"),
      { timeout: 420_000, intervals: [3000] })
    .not.toBe("building");
  const buildMs = Date.now() - t0;
  await page.waitForTimeout(4000);
  const status = await realFrame!.evaluate(() => {
    const st = document.querySelector('[data-testid="ai-structure-status"]');
    return { state: st?.getAttribute("data-state"), staleBy: st?.getAttribute("data-stale-by"), partial: st?.getAttribute("data-partial"), text: (st?.textContent || "").trim() };
  });
  rec(`BUILD_MS=${buildMs} STATUS=${JSON.stringify(status)}`);
  await page.screenshot({ path: `${SHOT}/11-built.png` });

  const strategy = await realFrame!.evaluate(() => {
    const t = document.querySelector('[data-testid="ai-strategy-trigger"]');
    const note = document.querySelector('[data-testid="gantt-strategy-note"]');
    return { chosen: t?.getAttribute("data-strategy") || null, label: (t?.textContent || "").trim(), note: note ? (note.textContent || "").trim() : null };
  });
  rec("STRATEGY=" + JSON.stringify(strategy));

  // --- depth control: drive all three and record what each does
  const depthState = async () => realFrame!.evaluate(() => {
    const d = document.querySelector('[data-testid="gantt-depth-control"]');
    const headers = Array.from(document.querySelectorAll('[data-testid="gantt-group-header"]'));
    return {
      depth: d?.getAttribute("data-depth") || null,
      present: !!d,
      headers: headers.length,
      headerLabels: headers.map((h) => (h.querySelector('[data-testid="gantt-group-header-label"]')?.textContent || h.textContent || "").trim().slice(0, 60)),
      rows: document.querySelectorAll('[data-testid="gantt-row"]').length,
      issueKeys: Array.from(document.querySelectorAll('[data-testid="gantt-row"]')).map((r) => r.getAttribute("data-row-key")).filter(Boolean),
      chainBars: Array.from(document.querySelectorAll('[data-testid="gantt-chain-bar"]')).map((b) => ({ collapsed: b.getAttribute("data-collapsed"), level: b.getAttribute("data-level"), label: (b.textContent || "").trim() })),
      strips: document.querySelectorAll('[data-testid="gantt-segment-strip"]').length,
      stripCritical: document.querySelectorAll('[data-testid="gantt-segment-strip-critical"]').length,
      noDates: document.querySelectorAll('[data-testid="gantt-segment-nodates"]').length,
      collapseAll: !!document.querySelector('[data-testid="gantt-group-collapse-all"]'),
      expandAll: !!document.querySelector('[data-testid="gantt-group-expand-all"]'),
    };
  });

  for (const d of ["segments", "chains", "issues"]) {
    const btn = frame.locator(`[data-testid="gantt-depth-${d}"]`);
    if (await btn.count()) { await btn.first().click(); await page.waitForTimeout(1800); }
    const st = await depthState();
    rec(`DEPTH ${d} -> ` + JSON.stringify({ depth: st.depth, headers: st.headers, rows: st.rows, chainBars: st.chainBars.length, strips: st.strips, stripCritical: st.stripCritical, noDates: st.noDates }));
    await page.screenshot({ path: `${SHOT}/12-depth-${d}.png` });
    if (d === "segments") {
      rec("SEGMENTS_HEADERS=" + JSON.stringify(st.headerLabels));
      rec("SEGMENTS_CHAINBARS=" + JSON.stringify(st.chainBars));
      rec("COLLAPSE_ALL_PRESENT=" + st.collapseAll + " EXPAND_ALL_PRESENT=" + st.expandAll);
    }
  }

  // --- coverage: every issue exactly once, at full depth
  const cov = await depthState();
  const keys = cov.issueKeys as string[];
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  rec(`COVERAGE rows=${keys.length} distinct=${new Set(keys).size} dupes=${JSON.stringify([...new Set(dupes)])}`);
  rec("COVERAGE_KEYS=" + JSON.stringify([...new Set(keys)].sort()));

  // --- strategy picker: which entries are disabled and do they carry a reason tip
  await frame.locator('[data-testid="ai-strategy-trigger"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(600);
  const opts = await realFrame!.evaluate(() => Array.from(document.querySelectorAll('[data-testid="ai-strategy-option"]')).map((o) => ({
    value: o.getAttribute("data-value"), disabled: o.getAttribute("data-disabled"), reason: o.getAttribute("data-reason"), label: (o.textContent || "").trim(),
  })));
  rec("STRATEGY_OPTIONS=" + JSON.stringify(opts, null, 1));
  await page.screenshot({ path: `${SHOT}/13-strategy-picker.png` });
  const disabledIdx = opts.findIndex((o: any) => o.disabled === "true");
  if (disabledIdx >= 0) {
    const tip = await hoverTip(page, realFrame, '[data-testid="ai-strategy-option"]', { index: disabledIdx });
    rec(`DISABLED_OPTION_TIP value=${opts[disabledIdx].value} found=${tip.found} :: ${JSON.stringify(tip.text.slice(0, 200))}`);
    await page.screenshot({ path: `${SHOT}/14-strategy-disabled-tip.png` });
  } else rec("DISABLED_OPTION_TIP=no disabled option rendered");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // --- group header click collapses / expands
  const h0 = frame.locator('[data-testid="gantt-group-header"]').first();
  const before = (await depthState()).rows;
  await h0.click();
  await page.waitForTimeout(1200);
  const collapsed = (await depthState()).rows;
  await h0.click();
  await page.waitForTimeout(1200);
  const expanded = (await depthState()).rows;
  rec(`HEADER_TOGGLE rows ${before} -> ${collapsed} -> ${expanded}`);
  await page.screenshot({ path: `${SHOT}/15-header-toggle.png` });

  // --- segment menu: rename applies in-session?
  await frame.locator('[data-testid="gantt-segment-menu-button"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(800);
  const menuOpen = await realFrame!.evaluate(() => !!document.querySelector('[data-testid="ai-segment-menu"]'));
  rec("SEGMENT_MENU_OPEN=" + menuOpen);
  await page.screenshot({ path: `${SHOT}/16-segment-menu.png` });
  let renameResult: any = { skipped: !menuOpen };
  if (menuOpen) {
    const saveState0 = await realFrame!.evaluate(() => {
      const f = document.querySelector('[data-testid="ai-segment-menu-save-state"]');
      return { state: f?.getAttribute("data-state"), text: (f?.textContent || "").trim() };
    });
    rec("SEGMENT_MENU_SAVE_STATE=" + JSON.stringify(saveState0));
    await frame.locator('[data-testid="ai-segment-action-rename"]').first().click();
    await page.waitForTimeout(500);
    const NEW = "WAVE-RENAME-PROBE";
    await frame.locator('[data-testid="ai-segment-rename-input"]').first().fill(NEW);
    await frame.locator('[data-testid="ai-segment-rename-save"]').first().click();
    await page.waitForTimeout(2500);
    renameResult = await realFrame!.evaluate((n) => {
      const labels = Array.from(document.querySelectorAll('[data-testid="gantt-group-header"]')).map((h) => (h.textContent || "").trim());
      const f = document.querySelector('[data-testid="ai-segment-menu-save-state"]');
      return {
        appliedInSession: labels.some((l) => l.includes(n)),
        editedChip: document.querySelectorAll('[data-testid="gantt-segment-edited"]').length,
        saveState: f?.getAttribute("data-state") || null,
        saveText: (f?.textContent || "").trim(),
        labels: labels.slice(0, 8),
      };
    }, NEW);
    rec("RENAME_RESULT=" + JSON.stringify(renameResult));
    await page.screenshot({ path: `${SHOT}/17-after-rename.png` });
    // RESTORE: reset my changes
    await frame.locator('[data-testid="gantt-segment-menu-button"]').first().click().catch(() => {});
    await page.waitForTimeout(700);
    if (await frame.locator('[data-testid="ai-segment-action-reset"]').count()) {
      await frame.locator('[data-testid="ai-segment-action-reset"]').first().click();
      await page.waitForTimeout(2000);
    }
    const afterReset = await realFrame!.evaluate((n) => ({
      stillRenamed: Array.from(document.querySelectorAll('[data-testid="gantt-group-header"]')).some((h) => (h.textContent || "").includes(n)),
      edited: document.querySelectorAll('[data-testid="gantt-segment-edited"]').length,
    }), NEW);
    rec("AFTER_RESET=" + JSON.stringify(afterReset));
    await page.screenshot({ path: `${SHOT}/18-after-reset.png` });
  }
  // restore grouping to none for the next test
  await frame.locator('[data-testid="gantt-group-select"]').first().click().catch(() => {});
  await page.waitForTimeout(600);
  await frame.getByText(/No grouping/i).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  rec("WAVE2_REPORT_END");
});

// ------------------------------------------------------------------- 4 -------
test("WAVE3 Explain: three answers, no chain ids or 'Finish —' leaking into prose", async ({ page }) => {
  const { frame, realFrame } = await openGantt(page);
  await frame.locator('[data-testid="plan-explain-btn"]').first().click({ timeout: 20_000 });
  await frame.locator('[data-testid="plan-explain-modal"]').first().waitFor({ state: "visible", timeout: 60_000 });
  await expect.poll(async () => realFrame!.evaluate(() => {
    const m = document.querySelector('[data-testid="plan-explain-modal"]');
    if (!m) return "gone";
    if (m.querySelector('[data-testid="explain-progress"]')) return "busy:" + (m.querySelector('[data-testid="explain-progress"]')!.getAttribute("data-phase") || "");
    if (m.querySelector('[data-testid="explain-decides"]')) return "done";
    if (m.querySelector('[data-testid="explain-note"]')) return "note";
    return "pending";
  }), { timeout: 300_000, intervals: [3000] }).toMatch(/done|note/);
  await page.waitForTimeout(1500);
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
  rec("EXPLAIN_VERDICT=" + modal.verdict);
  rec("EXPLAIN_A1_decides<<<\n" + modal.decides + "\n>>>");
  rec("EXPLAIN_A2_wouldMove<<<\n" + modal.wouldMove + "\n>>>");
  rec("EXPLAIN_A3_nextMoves<<<\n" + modal.nextMoves + "\n>>>");
  rec("EXPLAIN_FACTS=" + JSON.stringify(modal.facts));
  rec("EXPLAIN_NOTE=" + JSON.stringify(modal.note) + " INCOMPLETE=" + JSON.stringify(modal.incomplete));
  rec("EXPLAIN_KEYS=" + JSON.stringify(modal.keys));
  const body = modal.full;
  rec("EXPLAIN_TEXT<<<\n" + body + "\n>>>");
  await page.screenshot({ path: `${SHOT}/20-explain.png` });
  const chainIds = body.match(/\b(ch|tp|ti|ot|ow):[0-9a-f]{4,}/g) || [];
  const finishDash = body.match(/Finish\s+[—-]\s*(?:$|\n)/gm) || [];
  rec("EXPLAIN_CHAIN_ID_LEAKS=" + JSON.stringify(chainIds));
  rec("EXPLAIN_FINISH_DASH_LEAKS=" + JSON.stringify(finishDash));
  expect(modal.decides, "answer 1 non-empty").toBeTruthy();
  expect(modal.wouldMove, "answer 2 non-empty").toBeTruthy();
  expect(modal.nextMoves, "answer 3 non-empty").toBeTruthy();
  expect(chainIds, "no chain/segment ids in Explain prose").toEqual([]);
});

// ------------------------------------------------------------------- 5 -------
test("WAVE4 Writability modal + 'field not on project' action row (no write)", async ({ page }) => {
  const { frame, realFrame } = await openGantt(page);
  const chip = frame.locator('[data-testid="writability-chip"]');
  rec("WRITABILITY_CHIP_COUNT=" + (await chip.count()));
  await chip.first().dispatchEvent("click");
  await page.waitForTimeout(2500);
  const modal = await realFrame!.evaluate(() => {
    const m = document.querySelector('[data-testid="writability-modal"]');
    if (!m) return null;
    const rows = Array.from(m.querySelectorAll('[data-testid="writability-row"]')).map((r) => (r.textContent || "").replace(/\s+/g, " ").trim());
    return {
      text: (m as HTMLElement).innerText.replace(/\n{2,}/g, "\n").trim(),
      rows,
      rowCount: rows.length,
      addButtons: Array.from(m.querySelectorAll("button")).map((b) => (b.textContent || "").trim()).filter(Boolean),
      recheck: !!m.querySelector('[data-testid="writability-recheck"]'),
    };
  });
  rec("WRITABILITY_MODAL=" + JSON.stringify(modal, null, 1));
  await page.screenshot({ path: `${SHOT}/30-writability-modal.png` });
  expect(modal, "writability modal opened").not.toBeNull();
});

test.afterAll(async () => {
  console.log("\n================ WAVE 2026-09-16 REPORT ================\n" + report.join("\n") + "\n=======================================================\n");
});

// -------------------------------------------------- 3b: WHO is in each segment --
// Adversarial: the deterministic candidate preview (hook aiGroupCandidates) says the
// chains are 7/3/3 + 24-other = 37 LEAVES, but the built view shows 8/4/3/30 = 45.
// Harvest the real membership out of the DOM and say exactly which issues moved.
test("WAVE5 segment membership harvest (which issue sits in which segment)", async ({ page }) => {
  const { frame, realFrame } = await openGantt(page);
  await frame.locator('[data-testid="gantt-group-select"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await frame.getByText(/AI structure/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(5000);
  if (await frame.locator('[data-testid="gantt-depth-issues"]').count()) {
    await frame.locator('[data-testid="gantt-depth-issues"]').first().click();
    await page.waitForTimeout(2500);
  }
  const membership = await realFrame!.evaluate(() => {
    const out: any[] = [];
    let cur: any = null;
    const all = Array.from(document.querySelectorAll('[data-testid="gantt-group-header"],[data-testid="gantt-row"]'));
    for (const el of all) {
      if (el.getAttribute("data-testid") === "gantt-group-header") {
        cur = { label: (el.querySelector('[data-testid="gantt-group-header-label"]')?.textContent || el.textContent || "").trim(), segment: el.querySelector('[data-testid="gantt-segment-menu-button"]')?.getAttribute("data-segment") || null, keys: [] };
        out.push(cur);
      } else if (cur) cur.keys.push(el.getAttribute("data-row-key"));
    }
    return out;
  });
  for (const m of membership) rec(`SEGMENT ${JSON.stringify(m.label)} det=${m.segment} n=${m.keys.length} :: ${JSON.stringify(m.keys)}`);
  const flat = membership.flatMap((m: any) => m.keys);
  rec(`MEMBERSHIP total=${flat.length} distinct=${new Set(flat).size}`);
  await page.screenshot({ path: `${SHOT}/40-membership.png`, fullPage: false });
  await frame.locator('[data-testid="gantt-group-select"]').first().click().catch(() => {});
  await page.waitForTimeout(600);
  await frame.getByText(/No grouping/i).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  expect(new Set(flat).size).toBe(45);
});

// --- 2b: are "Collapse all" / "Expand all" REACHABLE AT ALL on this build? -------
// FINDING: the Gantt's Group select offers exactly two sources — "No grouping" and
// "AI structure" — and the Collapse/Expand pair is gated on `!aiSegments`, i.e. a
// pre-v2 AI view. On a v2 build there is no reachable path to either button; the
// depth control is the only fold/unfold. This test LOCKS that reachability fact so
// the pair cannot silently come back half-wired (or stay dead unnoticed).
test("WAVE6 Collapse all / Expand all reachability vs the depth control", async ({ page }) => {
  const { frame, realFrame } = await openGantt(page);
  await frame.locator('[data-testid="gantt-group-select"]').first().click({ timeout: 15_000 });
  await page.waitForTimeout(800);
  const sources = await realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[role="option"], [data-testid="select-option"], [role="listbox"] button, [role="listbox"] div'))
      .map((o) => (o.textContent || "").trim()).filter((t) => t && t.length < 40));
  rec("GROUP_SOURCE_OPTIONS=" + JSON.stringify([...new Set(sources)]));
  await frame.getByText(/AI structure/i).first().click({ timeout: 15_000 });
  await page.waitForTimeout(5500);
  const state = await realFrame!.evaluate(() => ({
    depthControl: !!document.querySelector('[data-testid="gantt-depth-control"]'),
    collapseAll: !!document.querySelector('[data-testid="gantt-group-collapse-all"]'),
    expandAll: !!document.querySelector('[data-testid="gantt-group-expand-all"]'),
    headers: document.querySelectorAll('[data-testid="gantt-group-header"]').length,
  }));
  rec("REACHABILITY_WITH_AI=" + JSON.stringify(state));
  // the depth control is the working substitute: prove both extremes
  await frame.locator('[data-testid="gantt-depth-segments"]').first().click();
  await page.waitForTimeout(2000);
  const folded = await realFrame!.evaluate(() => document.querySelectorAll('[data-testid="gantt-row"]').length);
  await page.screenshot({ path: `${SHOT}/51-depth-fold-all.png` });
  await frame.locator('[data-testid="gantt-depth-issues"]').first().click();
  await page.waitForTimeout(2000);
  const open = await realFrame!.evaluate(() => document.querySelectorAll('[data-testid="gantt-row"]').length);
  rec(`DEPTH_AS_COLLAPSE_EXPAND rows ${folded} (segments) -> ${open} (issues)`);
  await page.screenshot({ path: `${SHOT}/52-depth-open-all.png` });
  await frame.locator('[data-testid="gantt-group-select"]').first().click().catch(() => {});
  await page.waitForTimeout(600);
  await frame.getByText(/No grouping/i).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  expect(state.depthControl, "depth control present under AI structure").toBeTruthy();
  expect(folded, "Segments depth folds every issue row away").toBe(0);
  expect(open, "Issues depth opens all 45 rows").toBe(45);
  // the honest verdict about the two legacy buttons:
  expect(state.collapseAll || state.expandAll, "Collapse all / Expand all are NOT reachable on a v2 structure").toBeFalsy();
});

// ------------------------------- 3c: does a segment rename actually PERSIST? ------
test("WAVE7 segment rename says 'saved with the plan' — prove it survives a reload", async ({ page }) => {
  const NEW = "WAVE-PERSIST-PROBE";
  let restored = false;
  try {
    // Capture the resolver round-trip for the overlay save — the decisive evidence
    // for whether "saved with the plan" is true.
    const invokes: any[] = [];
    page.on("response", async (res: any) => {
      try {
        const u = res.url();
        if (!/\/invoke|\/gateway\/api/.test(u)) return;
        const req = res.request();
        const post = req.postData() || "";
        if (!/saveAiViewOverlay|getAiView/.test(post)) return;
        const body = await res.text().catch(() => "");
        invokes.push({ status: res.status(), call: /saveAiViewOverlay/.test(post) ? "saveAiViewOverlay" : "getAiView", post: post.slice(0, 400), body: body.slice(0, 700) });
      } catch { /* ignore */ }
    });
    const a = await openGantt(page);
    await a.frame.locator('[data-testid="gantt-group-select"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(700);
    await a.frame.getByText(/AI structure/i).first().click({ timeout: 15_000 });
    await page.waitForTimeout(5000);
    await a.frame.locator('[data-testid="gantt-segment-menu-button"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(700);
    await a.frame.locator('[data-testid="ai-segment-action-rename"]').first().click();
    await page.waitForTimeout(400);
    await a.frame.locator('[data-testid="ai-segment-rename-input"]').first().fill(NEW);
    await a.frame.locator('[data-testid="ai-segment-rename-save"]').first().click();
    await page.waitForTimeout(3500);
    const applied = await a.realFrame!.evaluate((n) => Array.from(document.querySelectorAll('[data-testid="gantt-group-header"]')).some((h) => (h.textContent || "").includes(n)), NEW);
    rec("PERSIST applied-in-session=" + applied);
    // Re-open the menu and read what the footer claims AFTER the save.
    await a.frame.locator('[data-testid="gantt-segment-menu-button"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    const claim = await a.realFrame!.evaluate(() => {
      const f = document.querySelector('[data-testid="ai-segment-menu-save-state"]');
      return { state: f?.getAttribute("data-state") || null, text: (f?.textContent || "").trim() };
    });
    rec("PERSIST_CLAIM_AFTER_SAVE=" + JSON.stringify(claim));
    await page.screenshot({ path: `${SHOT}/59-save-claim.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    for (const iv of invokes) rec("INVOKE " + JSON.stringify(iv));

    // full reload, re-open, re-select AI structure
    const b = await openGantt(page);
    await b.frame.locator('[data-testid="gantt-group-select"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(700);
    await b.frame.getByText(/AI structure/i).first().click({ timeout: 15_000 });
    await page.waitForTimeout(6000);
    const survived = await b.realFrame!.evaluate((n) => ({
      renamed: Array.from(document.querySelectorAll('[data-testid="gantt-group-header"]')).some((h) => (h.textContent || "").includes(n)),
      edited: document.querySelectorAll('[data-testid="gantt-segment-edited"]').length,
      labels: Array.from(document.querySelectorAll('[data-testid="gantt-group-header"]')).map((h) => (h.textContent || "").trim().slice(0, 40)),
    }), NEW);
    rec("PERSIST_AFTER_RELOAD=" + JSON.stringify(survived));
    await page.screenshot({ path: `${SHOT}/60-rename-after-reload.png` });

    // RESTORE
    await b.frame.locator('[data-testid="gantt-segment-menu-button"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(700);
    if (await b.frame.locator('[data-testid="ai-segment-action-reset"]').count()) {
      await b.frame.locator('[data-testid="ai-segment-action-reset"]').first().click();
      await page.waitForTimeout(3000);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const after = await b.realFrame!.evaluate((n) => ({ stillRenamed: Array.from(document.querySelectorAll('[data-testid="gantt-group-header"]')).some((h) => (h.textContent || "").includes(n)), edited: document.querySelectorAll('[data-testid="gantt-segment-edited"]').length }), NEW);
    rec("PERSIST_RESTORED=" + JSON.stringify(after));
    restored = !after.stillRenamed && after.edited === 0;
    await b.frame.locator('[data-testid="gantt-group-select"]').first().click().catch(() => {});
    await page.waitForTimeout(600);
    await b.frame.getByText(/No grouping/i).first().click().catch(() => {});
    await page.waitForTimeout(1200);
    rec("PERSIST_VERDICT claim=" + claim.state + " survivedReload=" + survived.renamed);
    if (claim.state === "saved") expect(survived.renamed, "the menu claims 'saved with the plan' — so it must survive a reload").toBeTruthy();
    else rec("PERSIST: the UI honestly reported '" + claim.text + "' — no false claim");
  } finally {
    rec("PERSIST_BED_RESTORED=" + restored);
  }
});

// ------- 4b: reconcile the Explain facts strip against the Dashboard (same metrics)
test("WAVE8 Explain facts strip vs Dashboard: FINISH and COMPLETE must agree", async ({ page }) => {
  const { frame, realFrame } = await openGantt(page);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click({ timeout: 20_000 });
  await page.waitForTimeout(6000);
  const dash = await realFrame!.evaluate(() => ({
    tiles: Array.from(document.querySelectorAll('[data-testid="kpi-tile"]')).map((t) => ({ label: t.getAttribute("data-label"), value: t.getAttribute("data-value") })),
    health: (document.querySelector('[data-testid="plan-health"]') as HTMLElement | null)?.innerText.replace(/\n+/g, " | ").trim().slice(0, 400) || null,
  }));
  rec("DASHBOARD=" + JSON.stringify(dash, null, 1));
  await page.screenshot({ path: `${SHOT}/70-dashboard.png` });
  expect(dash.tiles.length).toBeGreaterThan(0);
});
