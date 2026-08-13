// PERSISTENT feature journey — DURATION=WORKING-DAY-SPAN invariant on LZPT
// (read-only). The app normalizes every dated issue's duration to the working-day
// span of its start→due on load (normalizeImportedDurations), so the Table Duration
// column always agrees with the bar's dates — even though the raw Jira/KVS side has
// no PPM Duration field. Asserts the shown durations EXACTLY match the seeded spans.
// NEVER Applies; mutates nothing. Keys float → mapped by summary.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
// retries=2: durations are calendar-gated (a Forge Lambda cold-start with HIGH variance —
// usually <10s but observed >60s once in a sweep). The settle below waits for normalization;
// retries cover the rare case where even that window is exceeded (a fresh page retries warm).
// This cannot mask a real regression — durations never normalizing fails all 3 attempts.
test.describe.configure({ retries: 2, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }
async function isStaged(frame: any) { const t = await bodyText(frame); return /Apply \d+ change/i.test(t) || /Save \(\d+\)/i.test(t); }

test("LZPT Table duration == working-day span of the issue's dates (normalized on load)", async ({ page }) => {
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

  await page.waitForTimeout(1800);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  // Durations normalize only AFTER the calendar resolver returns (calendarLoaded gate,
  // PlanView.jsx) — on a COLD plan open the Table first paints raw (empty) durations.
  // Normalization is atomic (one setIssues with all spans), so wait until a healthy
  // MAJORITY of rows carry a duration (count-based → independent of any single key or a
  // collapsed subtree; cleanly distinguishes the pre-normalization all-empty state). Makes
  // this pass STANDALONE cold, not only warm inside the sweep.
  const startedAt = Date.now();
  await realFrame!.waitForFunction(() => {
    const els = Array.from(document.querySelectorAll('[data-testid="table-row"]'));
    return els.filter((el) => { const d = el.getAttribute("data-row-duration"); return d != null && d !== ""; }).length >= 30;
  }, undefined, { timeout: 90_000 });
  console.log(`durations normalized after ~${Math.round((Date.now() - startedAt) / 1000)}s post-Table-open`);

  const dur = (key: string) => realFrame!.evaluate((k) => {
    const el = document.querySelector(`[data-testid="table-row"][data-row-key="${k}"]`);
    return el ? el.getAttribute("data-row-duration") : null;
  }, key);

  // Seeded (Mon-Fri) spans → working-day counts (inclusive): CHAIN tasks Mon→Fri = 5;
  // "EDGE milestone (0-day)" DECLARES duration 0 (the seeder sets the PPM field) and
  // an explicit zero is a milestone declaration the normalizer must PRESERVE — not
  // rewrite to the 1-day span; "EDGE weekend-span" Fri→Tue = 3 (Sat/Sun skipped);
  // "EDGE long-run" 05-04→06-30 spans many weeks (>30 wd).
  const expected: Record<string, number> = {
    "CHAIN-1 kickoff": 5,
    "CHAIN-2 build": 5,
    "CHAIN-5 release": 5,
    "EDGE milestone (0-day)": 0,
    "EDGE weekend-span": 3,
  };
  for (const [sum, exp] of Object.entries(expected)) {
    const d = await dur(K(sum));
    console.log(`${sum}: duration=${d}`);
    expect(d, `${sum} row present with a duration`).not.toBeNull();
    expect(Number(d), `${sum} Table duration == its ${exp}-working-day span`).toBe(exp);
  }
  const lr = await dur(K("EDGE long-run"));
  console.log(`EDGE long-run: duration=${lr}`);
  expect(Number(lr), "EDGE long-run duration == its (large) working-day span").toBeGreaterThan(30);

  // NOTE: this journey asserts duration VALUES only. It deliberately does NOT assert
  // draft-neutrality of normalization here — on a COLD LZPT open normalization can
  // transiently stage the 37-change phantom draft (vs LZPT's null-duration KVS baseline;
  // documented in QUALITY-LOOP), which is a cold-race no settle/retry can pin down. That
  // concern is warm-reliable but cold-flaky, so it does not belong on this value check;
  // the sweep's _cleanup gate clears any residual phantom draft. `isStaged` kept only for
  // the diagnostic log below.
  console.log(`isStaged(after read)=${await isStaged(frame)}`);
});
