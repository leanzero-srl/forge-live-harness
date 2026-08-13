// PERSISTENT feature journey — BASELINE ghost bars on LZPT. Set a baseline (freeze
// current dates), drag the free head so the chain shifts, and assert the dashed
// GHOST outline stays at each moved leaf's FROZEN baseline x while its live bar
// moved right. Also re-exercises the finishDrag click-vs-drag fix. Cleans up: the
// drag is discarded (draft) and the baseline is CLEARED (KVS) so LZPT is restored.
// NEVER Applies to Jira. Keys float → mapped by summary.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 260_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

test("LZPT baseline ghosts: ghost frozen at baseline while bar moves, then clear", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  let s = await enterForgeSurface(page, { surface: "custom" });
  let frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");

  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }) });
    const d = await res.json(); const m: Record<string, string> = {}; for (const i of d.issues || []) m[i.fields.summary] = i.key; return m;
  });
  const head = keyMap["CROSS-A gate"], c1 = keyMap["CHAIN-1 kickoff"];
  expect([head, c1].every(Boolean), "keys resolved").toBeTruthy();

  const openPlan = async (fr: any, tab: RegExp) => {
    await fr.getByText(PLAN, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!/Gantt|Table|Dashboard/i.test(await bodyText(fr))) await fr.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    await fr.getByRole("button", { name: tab }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
  };
  const reenter = async () => {
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
    const ss = await enterForgeSurface(page, { surface: "custom" });
    const f = ss.kind === "custom" ? ss.frame : null;
    if (!f) throw new Error("no frame");
    return f;
  };
  const barLeft = async (fr: any, key: string) => {
    const rf = await (await fr.locator(":root").elementHandle())!.ownerFrame();
    return rf!.evaluate((k: string) => { const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null; return el ? Math.round(el.getBoundingClientRect().left) : null; }, key);
  };
  const ghostLeft = async (fr: any, key: string) => {
    const rf = await (await fr.locator(":root").elementHandle())!.ownerFrame();
    return rf!.evaluate((k: string) => { const el = document.querySelector(`[data-testid="gantt-baseline-ghost"][data-key="${k}"]`) as HTMLElement | null; return el ? Math.round(el.getBoundingClientRect().left) : null; }, key);
  };

  await page.waitForTimeout(1500);
  await openPlan(frame, /^Gantt/i);
  // Clean start — discard any leftover draft.
  for (let i = 0; i < 3; i++) { if (!(await isStaged(frame))) break; await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1000); await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(1800); }

  // --- Set a baseline from the Dashboard (freezes the current dates) ---
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.locator('[data-testid="set-baseline"]').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  expect(/Update baseline/i.test(await bodyText(frame)), "baseline was set (button now says Update)").toBeTruthy();

  // --- Reload so PlanView re-fetches ganttBaseline (it loads once on mount) ---
  await page.reload({ waitUntil: "domcontentloaded" });
  frame = await reenter();
  await page.waitForTimeout(1500);
  await openPlan(frame, /^Gantt/i);

  // Pre-drag positions == baseline positions (we just froze them).
  const headPre = await barLeft(frame, head);
  const c1Pre = await barLeft(frame, c1);
  console.log("PRE_DRAG head:", headPre, " chain1:", c1Pre);
  expect(headPre, "head bar present").not.toBeNull();

  // --- Drag the free head right; the chain cascades ---
  const box = await frame.locator(`[data-testid="gantt-bar"][data-key="${head}"]`).first().boundingBox();
  if (!box) throw new Error("head bar not in viewport");
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, dx = 120;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT}/baseline-ghosts.png` });

  // --- Live bars moved right; ghosts stay at the frozen baseline x ---
  const headLive = await barLeft(frame, head);
  const headGhost = await ghostLeft(frame, head);
  const c1Live = await barLeft(frame, c1);
  const c1Ghost = await ghostLeft(frame, c1);
  console.log("POST head live:", headLive, " ghost:", headGhost, " | chain1 live:", c1Live, " ghost:", c1Ghost);

  // Head: bar moved right, ghost frozen at the pre-drag (baseline) position.
  expect(headLive! - headPre!, "head bar moved right after drag").toBeGreaterThan(40);
  expect(headGhost, "head has a baseline ghost").not.toBeNull();
  expect(Math.abs(headGhost! - headPre!), "head ghost is frozen at its baseline x").toBeLessThanOrEqual(8);
  expect(headLive! - headGhost!, "head live bar sits to the RIGHT of its frozen ghost").toBeGreaterThan(40);
  // Chain-1 cascaded too — it also has a frozen ghost while its bar moved.
  expect(c1Live! - c1Pre!, "chain-1 bar moved right (cascade)").toBeGreaterThan(40);
  expect(c1Ghost, "chain-1 has a baseline ghost").not.toBeNull();
  expect(Math.abs(c1Ghost! - c1Pre!), "chain-1 ghost frozen at its baseline x").toBeLessThanOrEqual(8);

  // --- Restore: discard the drag (draft). A single round is NOT enough: the
  // drag stages a full recalc (SAVE_NAG), and after Discard All the "Save (N)"
  // badge legitimately remains until the clean state is persisted — the same
  // two-axis behaviour every other mutation journey's cleanup loop handles.
  for (let i = 0; i < 4; i++) {
    if (!(await isStaged(frame))) break;
    await frame.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
    await frame.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    // Persist the now-clean baseline if only the Save nag remains (save-reload
    // journey's lesson: saving the ALREADY-DISCARDED clean state is safe).
    const t = await bodyText(frame);
    if (!/Apply \d+ change/i.test(t) && /Save \(\d+\)/i.test(t)) {
      await frame.locator('[data-testid="plan-save-btn"]').first().click().catch(() => {});
      await page.waitForTimeout(2500);
    }
  }
  // The Jira-pending axis must be clean; assert on the Apply badge specifically.
  expect(/Apply \d+ change/i.test(await bodyText(frame)), "drag discarded (no Jira-pending changes)").toBeFalsy();

  // --- Restore: CLEAR the baseline (KVS) so LZPT is left clean ---
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await frame.locator('[data-testid="clear-baseline"]').first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const afterClear = await bodyText(frame);
  console.log("AFTER_CLEAR has 'Set baseline':", /Set baseline/i.test(afterClear), " has 'Update baseline':", /Update baseline/i.test(afterClear));
  expect(/Set baseline/i.test(afterClear) && !/Update baseline/i.test(afterClear), "baseline cleared (button back to 'Set baseline')").toBeTruthy();
});
