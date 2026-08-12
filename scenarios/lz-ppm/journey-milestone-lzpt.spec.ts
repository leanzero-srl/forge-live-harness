// PERSISTENT feature journey — MILESTONE / date-edge rendering on LZPT (read-only).
//
// A milestone is DECLARED, not inferred. The old rule was "start == due and
// duration <= 1", which made every one-day task an unlabelled diamond and — worse
// — let a cascade that collapsed a task to one day silently reclassify it, which
// is what the owner reported as "sometimes the work item appears like a romb".
// Now: duration 0 (or a milestone issue type) is a milestone; a one-day task is a
// one-day task and renders as a normal narrow bar carrying its key.
//
// Asserts BOTH sides of that rule against the seeded date edges, plus the
// no-dates case. NEVER Applies; mutates nothing.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT milestone: a one-day task is a BAR, not a diamond; unscheduled = no bar", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  const keyMap: Record<string, string> = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: "project = LZPT", maxResults: 100, fields: ["summary"] }) });
    const d = await res.json(); const m: Record<string, string> = {}; for (const i of d.issues || []) m[i.fields.summary] = i.key; return m;
  });
  const K = (x: string) => keyMap[x];
  const milestone = K("EDGE milestone (0-day)"), unscheduled = K("EDGE unscheduled (no dates)"), chain = K("CHAIN-1 kickoff");
  expect([milestone, unscheduled, chain].every(Boolean), "keys resolved").toBeTruthy();

  await page.waitForTimeout(1800);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);

  const bar = (key: string) => realFrame!.evaluate((k) => {
    const el = document.querySelector(`[data-testid="gantt-bar"][data-key="${k}"]`) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    // a rotated-square diamond glyph child marks a milestone render
    const diamond = el.querySelector('div[style*="rotate(45deg)"]');
    return { width: Math.round(r.width), milestone: el.getAttribute("data-milestone") === "1", hasDiamond: !!diamond };
  }, key);

  const ms = await bar(milestone);
  const c1 = await bar(chain);
  const un = await bar(unscheduled);
  console.log("MILESTONE:", JSON.stringify(ms), " CHAIN-1:", JSON.stringify(c1), " UNSCHEDULED:", JSON.stringify(un));

  // 1) THE REPORTED BUG. "EDGE milestone (0-day)" is start == due, but nothing
  //    DECLARES it a milestone — LZPT has no Milestone issue type and editmeta
  //    confirms PPM Duration is not even settable here, which is why every issue
  //    indexes with duration null. Under the old "start == due && duration <= 1"
  //    rule it rendered as an unlabelled diamond; it must now be an ordinary
  //    one-day bar that still shows its key.
  expect(ms, "the one-day task still renders a bar").not.toBeNull();
  expect(ms!.milestone, "a one-day task is NOT a milestone").toBeFalsy();
  expect(ms!.hasDiamond, "a one-day task must not render the diamond glyph").toBeFalsy();
  // 2) A 5-working-day chain task is a normal (wider) bar, NOT a milestone.
  expect(c1, "CHAIN-1 bar present").not.toBeNull();
  expect(c1!.milestone, "CHAIN-1 (5-day) is NOT a milestone").toBeFalsy();
  // 3) MATH: the single-day bar is still a single day — far narrower than 5 days.
  expect(ms!.width, "the one-day bar is much narrower than the 5-day chain task").toBeLessThan(c1!.width / 2);
  // 4) The unscheduled (no-dates) task renders NO bar at all.
  expect(un, "unscheduled task has NO bar (no dates → nothing to draw)").toBeNull();

  // 5) THE REGRESSION GUARD for the reported rhombuses: a single-day task that was
  //    never declared a milestone must render as a BAR, and must still be
  //    identifiable — the old rule turned these into unlabelled diamonds.
  const oneDay = await realFrame!.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('[data-testid="gantt-bar"]'))) {
      const b = el as HTMLElement;
      if (b.dataset.parent === "true" || b.dataset.milestone === "1") continue;
      const r = b.getBoundingClientRect();
      if (r.width > 0 && r.width <= 16) {  // ~1 day at Week zoom (14px)
        return { key: b.dataset.key, width: Math.round(r.width), text: (b.textContent || "").trim(),
                 hasDiamond: !!b.querySelector('div[style*="rotate(45deg)"]') };
      }
    }
    return null;
  });
  console.log("ONE-DAY NON-MILESTONE:", JSON.stringify(oneDay));
  if (oneDay) {
    expect(oneDay.hasDiamond, `${oneDay.key}: a one-day task must NOT render as a diamond`).toBeFalsy();
    expect(oneDay.text, `${oneDay.key}: a narrow bar must still show its key`).toContain(oneDay.key);
  }
});
