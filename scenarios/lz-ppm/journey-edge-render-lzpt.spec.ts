// PERSISTENT feature journey — DATE-EDGE render ROBUSTNESS on LZPT (read-only). The
// seeded "EDGE invalid start-after-due" task has start (05-20) AFTER due (05-12) — a
// data anomaly. The plan must render it SANELY: a finite, clamped (>=6px) bar, no
// NaN geometry, no crash. Also a plan-wide invariant: EVERY bar has finite, >=0
// dimensions (no NaN / negative rendered width). Non-mutating. NEVER Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT date edges: invalid start>due renders a sane clamped bar; no NaN/negative bars", async ({ page }) => {
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
  const invalid = keyMap["EDGE invalid start-after-due"];
  expect(invalid, "invalid-edge key resolved").toBeTruthy();

  await page.waitForTimeout(1800);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);

  // Read EVERY bar's rendered geometry.
  const bars = await realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="gantt-bar"]')).map((el) => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return { key: (el as HTMLElement).getAttribute("data-key"), w: Math.round(r.width), left: Math.round(r.left), parent: (el as HTMLElement).getAttribute("data-parent") === "true" };
    }),
  );
  console.log("BAR_COUNT:", bars.length);
  const invalidBar = bars.find((b) => b.key === invalid);
  console.log("INVALID_BAR:", JSON.stringify(invalidBar));
  const bad = bars.filter((b) => !Number.isFinite(b.w) || !Number.isFinite(b.left) || b.w < 0);
  console.log("BAD_BARS:", JSON.stringify(bad));

  // Plan-wide: no bar has NaN/negative rendered width (getBarPos clamps w to >=6px).
  expect(bad.length, "no bar renders with NaN or negative width").toBe(0);
  expect(bars.length, "bars rendered").toBeGreaterThan(20);

  // The invalid start>due task renders a sane, finite, CLAMPED bar (not a giant
  // negative-width smear, not a NaN). getBarPos gives w<0 → the bar clamps to 6px.
  expect(invalidBar, "invalid-edge task renders a bar (not dropped)").toBeTruthy();
  expect(Number.isFinite(invalidBar!.w) && Number.isFinite(invalidBar!.left), "invalid bar has finite geometry (no NaN)").toBeTruthy();
  expect(invalidBar!.w, "invalid bar is clamped small (not a wide negative-span smear)").toBeLessThanOrEqual(20);
  expect(invalidBar!.w, "invalid bar still has a minimum visible width").toBeGreaterThanOrEqual(4);

  // No crash / error banner in the rendered plan.
  const body = await bodyText(frame);
  expect(/something went wrong|failed to load|cannot read|undefined is not|NaN(px)?/i.test(body), "no crash/NaN error surfaced").toBeFalsy();
});
