// PERSISTENT feature journey — Dashboard BASELINE VARIANCE table on LZPT.
// Beyond the ghost-bar render (journey-baseline), this asserts the NUMERIC variance math:
// set a baseline (freezes the seeded dates), drag the free head so a chain slips, then on the
// Dashboard the "Baseline & variance" panel must report each moved issue's slip == the ACTUAL
// date delta. Independently: baseline_due = the still-seeded Jira dueDate (the drag is only
// STAGED, never Applied), current_due = the post-drag Table dueDate, so
//   expected slip = round((current_due - baseline_due)/day)  (== the app's daysBetween).
// Also: net slip > 0, slipped count > 0. Restores LZPT in a finally (discard drag + clear
// baseline) so a mid-test failure can't leave a baseline in KVS. NEVER Applies to Jira.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 260_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }
function daysBetween(a: string, b: string) { const pa = a.split("-").map(Number), pb = b.split("-").map(Number); return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000); }

test("LZPT baseline variance: per-issue slip == actual date delta; net/slipped correct", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  let s = await enterForgeSurface(page, { surface: "custom" });
  let frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");

  // Baseline (seeded) dueDates straight from Jira — unchanged because the drag is only staged.
  const jiraDue: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["duedate", "summary"] }) });
    const d = await res.json(); const out: Record<string, string> = {};
    for (const i of d.issues || []) if (i.fields.duedate) out[i.key] = i.fields.duedate;
    return out;
  });
  const headSummary = "CROSS-A gate";
  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }) });
    const d = await res.json(); const m: Record<string, string> = {}; for (const i of d.issues || []) m[i.fields.summary] = i.key; return m;
  });
  const head = keyMap[headSummary];
  expect(head, "head key resolved").toBeTruthy();

  const reenter = async () => {
    await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
    const ss = await enterForgeSurface(page, { surface: "custom" });
    const f = ss.kind === "custom" ? ss.frame : null; if (!f) throw new Error("no frame"); return f;
  };
  const openPlan = async (fr: any, tab: RegExp) => {
    await fr.getByText(PLAN, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!/Gantt|Table|Dashboard/i.test(await bodyText(fr))) await fr.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    await fr.getByRole("button", { name: tab }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
  };
  const discardDraft = async (fr: any) => {
    for (let i = 0; i < 3; i++) { if (!(await isStaged(fr))) break; await fr.locator("button").filter({ hasText: /Apply \d+ change/i }).first().click().catch(() => {}); await page.waitForTimeout(1000); await fr.getByRole("button", { name: /Discard All/i }).first().click().catch(() => {}); await page.waitForTimeout(1800); }
  };

  await page.waitForTimeout(1500);
  await openPlan(frame, /^Gantt/i);
  await discardDraft(frame);

  let baselineSet = false;
  try {
    // --- Set a baseline (freeze the seeded dates) ---
    await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    await frame.locator('[data-testid="set-baseline"]').first().click().catch(() => {});
    await page.waitForTimeout(2500);
    expect(/Update baseline/i.test(await bodyText(frame)), "baseline set (button now 'Update')").toBeTruthy();
    baselineSet = true;

    // Reload so PlanView re-fetches the baseline, then drag the head to slip the chain.
    await page.reload({ waitUntil: "domcontentloaded" });
    frame = await reenter();
    await page.waitForTimeout(1500);
    await openPlan(frame, /^Gantt/i);

    const box = await frame.locator(`[data-testid="gantt-bar"][data-key="${head}"]`).first().boundingBox();
    if (!box) throw new Error("head bar not in viewport");
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2, dx = 120;
    await page.mouse.move(cx, cy); await page.mouse.down();
    for (const f of [0.25, 0.5, 0.75, 1]) await page.mouse.move(cx + dx * f, cy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(3000);
    expect(await isStaged(frame), "drag staged a change").toBeTruthy();

    // Post-drag CURRENT dueDates from the Table (reflect the staged drag).
    await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    const rf = await (await frame.locator(":root").elementHandle())!.ownerFrame();
    const curDue: Record<string, string> = await rf!.evaluate(() => {
      const out: Record<string, string> = {};
      for (const el of Array.from(document.querySelectorAll('[data-testid="table-row"]'))) { const k = el.getAttribute("data-row-key"); const due = el.getAttribute("data-row-due"); if (k && due) out[k] = due; }
      return out;
    });

    // Dashboard variance panel + rows.
    await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
    await page.waitForTimeout(3000);
    const rf2 = await (await frame.locator(":root").elementHandle())!.ownerFrame();
    const v = await rf2!.evaluate(() => {
      const p = document.querySelector('[data-testid="variance-panel"]');
      if (!p) return null;
      const n = (a: string) => Number(p.getAttribute(a));
      const rows = Array.from(document.querySelectorAll('[data-testid="variance-row"]')).map((el) => ({ key: el.getAttribute("data-key")!, slip: Number(el.getAttribute("data-slip")) }));
      return { net: n("data-net"), slipped: n("data-slipped"), ahead: n("data-ahead"), tracked: n("data-tracked"), rows };
    });
    console.log("VARIANCE:", JSON.stringify(v));
    expect(v, "variance panel shown after the slip").not.toBeNull();
    expect(v!.net, "net slip > 0").toBeGreaterThan(0);
    expect(v!.slipped, "at least one issue slipped").toBeGreaterThan(0);
    expect(v!.rows.length, "variance rows present").toBeGreaterThan(0);

    // CORE: each row's slip == the ACTUAL date delta (current Table due − baseline Jira due).
    let checked = 0;
    for (const r of v!.rows) {
      const base = jiraDue[r.key], cur = curDue[r.key];
      if (!base || !cur) continue;
      const expected = daysBetween(base, cur);
      console.log(`row ${r.key}: dash slip=${r.slip}  computed=${expected}  (base ${base} → cur ${cur})`);
      expect(r.slip, `${r.key} variance slip == actual date delta`).toBe(expected);
      checked += 1;
    }
    expect(checked, "cross-checked at least one variance row against real dates").toBeGreaterThan(0);
  } finally {
    // --- ALWAYS restore LZPT: discard the drag, then clear the baseline ---
    try { frame = await reenter(); } catch { /* keep last frame */ }
    await openPlan(frame, /^Gantt/i).catch(() => {});
    await discardDraft(frame);
    if (baselineSet) {
      await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
      await page.waitForTimeout(2000);
      await frame.locator('[data-testid="clear-baseline"]').first().click().catch(() => {});
      await page.waitForTimeout(2500);
      const after = await bodyText(frame);
      console.log("AFTER_CLEAR set-baseline?", /Set baseline/i.test(after), " update?", /Update baseline/i.test(after));
      expect(/Set baseline/i.test(after) && !/Update baseline/i.test(after), "baseline cleared (LZPT restored)").toBeTruthy();
    }
  }
});
