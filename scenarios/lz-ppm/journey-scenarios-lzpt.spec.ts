// PERSISTENT feature journey against the LZPT scenario bed — asserts
// COMPUTED-EXPECTED outcomes for each seeded shape, not just "it renders":
//   A. critical path == the linear CHAIN (longest dependency chain)
//   B. fan-out: FANOUT-src has exactly 4 outgoing dependency arrows
//   C. multi-level rollup: a parent bar spans its children's dates
//   D. cycle (CYCLE-X/Y/Z) renders without crashing the plan
//   E. date edges: 0-day milestone renders; the unscheduled task has no bar
// Read-only (no edits/apply). Keys float across reseeds, so map by summary.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 240_000 });

test("LZPT scenarios: critical path, fan-out, rollup, cycle, date edges", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  // Live summary -> key map from Jira. Run in the TOP page (wolfaenpak origin),
  // NOT the app iframe (Forge origin), so the same-origin REST call resolves.
  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" },
      credentials: "include",
      body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }),
    });
    const d = await res.json();
    const m: Record<string, string> = {};
    for (const i of d.issues || []) m[i.fields.summary] = i.key;
    return m;
  });
  const K = (summ: string) => keyMap[summ];
  console.log("KEYMAP_SIZE:", Object.keys(keyMap).length);
  expect(Object.keys(keyMap).length, "LZPT seeded issues present").toBeGreaterThanOrEqual(45);

  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test((await frame.locator("body").textContent().catch(() => "")) || "")) {
    await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  }
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4500);

  // Ensure all families are expanded so every seeded bar is in the DOM.
  const barKeys = () => realFrame!.evaluate(() => Array.from(document.querySelectorAll('[data-testid="gantt-bar"]')).map((b) => b.getAttribute("data-key")));
  let keys = await barKeys();
  // Expand any collapsed parents (chevrons) a couple of times.
  for (let i = 0; i < 2; i++) {
    keys = await barKeys();
    if (keys.length >= 40) break;
    await page.waitForTimeout(500);
  }
  console.log("BARS_IN_DOM:", keys.length);

  // ---- D. Cycle renders without crash: CYCLE-X/Y/Z all present ----
  const cycleKeys = ["CYCLE-X", "CYCLE-Y", "CYCLE-Z"].map(K);
  const cyclePresent = cycleKeys.every((k) => keys.includes(k));
  const errored = /Something went wrong|failed to load|error/i.test((await frame.locator("body").textContent().catch(() => "")) || "");
  console.log("CYCLE_PRESENT:", cyclePresent, "CYCLE_KEYS:", JSON.stringify(cycleKeys), "PLAN_ERRORED:", errored);
  expect(cyclePresent, "cycle CYCLE-X/Y/Z all render").toBeTruthy();
  expect(errored, "a dependency cycle must not crash the plan").toBeFalsy();

  // ---- B. Fan-out: FANOUT-src has exactly 4 outgoing dependency arrows ----
  const foSrc = K("FANOUT-src");
  const outArrows = await realFrame!.evaluate((src) => {
    return Array.from(document.querySelectorAll('[data-testid="dep-arrow-hit"]'))
      .map((a) => a.getAttribute("data-link") || "")
      .filter((l) => l.startsWith(src + "-")).length;
  }, foSrc);
  console.log("FANOUT_OUT_ARROWS (expect 4):", outArrows);
  expect(outArrows, "FANOUT-src blocks exactly 4 tasks").toBe(4);

  // ---- C. Multi-level rollup: ROLLUP story-1 spans its two subtasks ----
  const rollup = await realFrame!.evaluate((m) => {
    const rect = (k: string) => { const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null; if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; };
    const parent = rect(m.story), a = rect(m.subA), b = rect(m.subB);
    if (!parent || !a || !b) return { ok: false, parent, a, b };
    const childLeft = Math.min(a.left, b.left), childRight = Math.max(a.right, b.right);
    return { ok: true, parentLeft: parent.left, parentRight: parent.right, childLeft, childRight, leftDelta: Math.abs(parent.left - childLeft), rightDelta: Math.abs(parent.right - childRight) };
  }, { story: K("ROLLUP story-1"), subA: K("ROLLUP sub-1a"), subB: K("ROLLUP sub-1b") });
  console.log("ROLLUP:", JSON.stringify(rollup));
  expect(rollup.ok, "rollup parent + subtasks all have bars").toBeTruthy();
  expect(rollup.leftDelta, "parent bar starts at the earliest child").toBeLessThan(12);
  expect(rollup.rightDelta, "parent bar ends at the latest child").toBeLessThan(12);

  // ---- E. Date edges: milestone renders; unscheduled has no bar ----
  const milestoneKey = K("EDGE milestone (0-day)");
  const unschedKey = K("EDGE unscheduled (no dates)");
  console.log("MILESTONE_HAS_BAR:", keys.includes(milestoneKey), " UNSCHEDULED_HAS_BAR:", keys.includes(unschedKey));
  expect(keys.includes(milestoneKey), "0-day milestone renders").toBeTruthy();
  expect(keys.includes(unschedKey), "unscheduled task has no timeline bar").toBeFalsy();

  // ---- F. Diamond convergence: DIAMOND-C starts after BOTH predecessors,
  //         gated by the LONGER path (B2 is longer than B1) ----
  const diamond = await realFrame!.evaluate((m) => {
    const rect = (k: string) => { const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null; return el ? el.getBoundingClientRect() : null; };
    const b1 = rect(m.b1), b2 = rect(m.b2), c = rect(m.c);
    if (!b1 || !b2 || !c) return { ok: false };
    return { ok: true, cLeft: Math.round(c.left), b1Right: Math.round(b1.right), b2Right: Math.round(b2.right), afterB1: c.left >= b1.right - 2, afterB2: c.left >= b2.right - 2, b2LongerThanB1: b2.right > b1.right };
  }, { b1: K("DIAMOND-B1 left"), b2: K("DIAMOND-B2 right (longer)"), c: K("DIAMOND-C sink") });
  console.log("DIAMOND:", JSON.stringify(diamond));
  expect(diamond.ok, "diamond bars all render").toBeTruthy();
  expect(diamond.b2LongerThanB1, "B2 is the longer path").toBeTruthy();
  expect(diamond.afterB1 && diamond.afterB2, "C starts only after BOTH predecessors finish (gated by the longer B2)").toBeTruthy();

  // ---- G. Cross-epic gate: CHAIN-1 (E1) starts only after CROSS-A (E3), its
  //         predecessor in another epic, finishes — pinned to due + 1 wd. ----
  const gate = await realFrame!.evaluate((m) => {
    const rect = (k: string) => { const e = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null; return e ? e.getBoundingClientRect() : null; };
    const g = rect(m.gate), c1 = rect(m.chain1);
    if (!g || !c1) return { ok: false };
    return { ok: true, gateRight: Math.round(g.right), chain1Left: Math.round(c1.left), startsAfter: c1.left >= g.right - 4 };
  }, { gate: K("CROSS-A gate"), chain1: K("CHAIN-1 kickoff") });
  console.log("CROSS_EPIC_GATE:", JSON.stringify(gate));
  expect(gate.ok, "gate + chain-1 bars render").toBeTruthy();
  expect(gate.startsAfter, "CHAIN-1 starts only after its cross-epic predecessor CROSS-A finishes").toBeTruthy();

  // ---- A. Critical path == the linear CHAIN ----
  await frame.getByRole("button", { name: /^Critical/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SHOT}/lzpt-critical.png` });
  const chainKeys = ["CHAIN-1 kickoff", "CHAIN-2 build", "CHAIN-3 test", "CHAIN-4 review", "CHAIN-5 release"].map(K);
  const crit = await realFrame!.evaluate((chain) => {
    const isCrit = (k: string) => document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`)?.getAttribute("data-critical") === "1";
    const critAll = Array.from(document.querySelectorAll('[data-testid="gantt-bar"][data-critical="1"]')).map((b) => b.getAttribute("data-key"));
    return { chainCritical: chain.map(isCrit), critAll };
  }, chainKeys);
  console.log("CHAIN_CRITICAL:", JSON.stringify(crit.chainCritical), " ALL_CRITICAL:", JSON.stringify(crit.critAll));
  expect(crit.chainCritical.every(Boolean), "the whole linear CHAIN is on the critical path").toBeTruthy();

  // ---- H. Critical-path COUNT: the Critical button badge == the number of
  //         critical bars rendered (the two derive independently). ----
  const critBtnText = (await frame.getByRole("button", { name: /Critical/i }).first().textContent().catch(() => "")) || "";
  const badge = (critBtnText.match(/\((\d+)\)/) || [])[1];
  console.log("CRITICAL_BADGE:", critBtnText.trim(), " CRIT_BARS:", crit.critAll.length);
  expect(badge, "Critical button shows a count badge").toBeTruthy();
  expect(Number(badge), "critical-path count == number of critical bars").toBe(crit.critAll.length);

  // Toggle Critical back off.
  await frame.getByRole("button", { name: /^Critical/i }).first().click().catch(() => {});
});
