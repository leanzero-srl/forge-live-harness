// PERSISTENT feature journey — MILESTONE / date-edge rendering on LZPT (read-only).
// A 0-day task (start==due) renders as a single-day MILESTONE (diamond glyph, ~1-day
// bar span — not a multi-day bar); a task with NO dates renders NO bar at all.
// Asserts the MATH against the seeded date edges. NEVER Applies; mutates nothing.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT milestone: 0-day task = single-day diamond; unscheduled task = no bar", async ({ page }) => {
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

  // 1) The 0-day task renders as a MILESTONE: flagged, a diamond glyph, single-day span.
  expect(ms, "milestone bar present").not.toBeNull();
  expect(ms!.milestone, "0-day task is flagged data-milestone=1").toBeTruthy();
  expect(ms!.hasDiamond, "milestone renders the diamond glyph").toBeTruthy();
  // 2) A 5-working-day chain task is a normal (wider) bar, NOT a milestone.
  expect(c1, "CHAIN-1 bar present").not.toBeNull();
  expect(c1!.milestone, "CHAIN-1 (5-day) is NOT a milestone").toBeFalsy();
  // 3) MATH: the single-day milestone is far narrower than the 5-day task (~1/5).
  expect(ms!.width, "milestone bar is a single day — much narrower than the 5-day chain task").toBeLessThan(c1!.width / 2);
  // 4) The unscheduled (no-dates) task renders NO bar at all.
  expect(un, "unscheduled task has NO bar (no dates → nothing to draw)").toBeNull();
});
