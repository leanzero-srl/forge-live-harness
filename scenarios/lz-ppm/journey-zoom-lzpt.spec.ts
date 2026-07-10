// PERSISTENT feature journey — Gantt zoom scaling on LZPT (read-only). A fixed-
// duration bar (CHAIN-1) must get progressively NARROWER from Day → Week → Month
// → Quarter (px/day decreases as the zoom coarsens) — the core zoom math.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 200_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Gantt zoom: a bar scales Day > Week > Month > Quarter", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  // Resolve CHAIN-1's key (a 5-working-day task).
  const key = await page.evaluate(async () => {
    const res = await fetch("/rest/api/3/search/jql", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "X-Atlassian-Token": "no-check" }, credentials: "include", body: JSON.stringify({ jql: 'project = LZPT AND summary ~ "CHAIN-1 kickoff"', maxResults: 1, fields: ["summary"] }) });
    return (await res.json()).issues?.[0]?.key;
  });
  await page.waitForTimeout(1500);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(4000);

  const width = async () => {
    const b = await frame.locator(`[data-testid="gantt-bar"][data-key="${key}"]`).first().boundingBox().catch(() => null);
    return b ? Math.round(b.width) : 0;
  };
  const widths: Record<string, number> = {};
  for (const z of ["Day", "Week", "Month", "Quarter"]) {
    await frame.getByRole("button", { name: new RegExp(`^${z}$`, "i") }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    widths[z] = await width();
  }
  console.log("BAR_WIDTHS:", JSON.stringify(widths));
  expect(widths.Day, "bar renders at Day zoom").toBeGreaterThan(0);
  expect(widths.Day, "Day is wider than Week").toBeGreaterThan(widths.Week);
  expect(widths.Week, "Week is wider than Month").toBeGreaterThan(widths.Month);
  expect(widths.Month, "Month is wider than Quarter").toBeGreaterThan(widths.Quarter);
  // Restore to Week (the default).
  await frame.getByRole("button", { name: /^Week$/i }).first().click().catch(() => {});
});
