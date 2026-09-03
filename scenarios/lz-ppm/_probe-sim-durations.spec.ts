// TEMP PROBE: does the Schedule-confidence card see the SAME (normalized) durations
// the Table shows? Offline, the same plan data with normalized durations gives
// P50 Oct 13 / P90 Oct 14; with the raw KVS durations (null -> treated as 1) it gives
// P50=P80=P90=planned and one histogram bucket — which is exactly what the live card
// reported. This reads both surfaces in one session to settle it.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 0, timeout: 420_000 });

test("probe: card percentiles vs table durations", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(1500);
  await frame.getByText("LZPT Scenarios", { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  // Table first: the normalized durations.
  await frame.getByRole("button", { name: /^Table/i }).first().click();
  await page.waitForTimeout(4000);
  const rows = frame.locator('[data-testid="table-row"]');
  const durs: string[] = [];
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const key = await rows.nth(i).getAttribute("data-row-key");
    const d = await rows.nth(i).getAttribute("data-row-duration");
    if (["LZPT-209", "LZPT-192", "LZPT-215", "LZPT-205"].includes(key || "")) durs.push(`${key}=${d}`);
  }
  console.log("TABLE DURATIONS", durs.join(" "), "rows", n);

  // Then the dashboard card, in the same session (so normalization has certainly run).
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click();
  const card = frame.locator('[data-testid="schedule-confidence"]').first();
  await card.waitFor({ state: "visible", timeout: 60_000 });
  for (let i = 0; i < 120; i++) {
    if (await card.getAttribute("data-p90")) break;
    await page.waitForTimeout(500);
  }
  console.log("CARD p50=", await card.getAttribute("data-p50"), "p80=", await card.getAttribute("data-p80"),
    "p90=", await card.getAttribute("data-p90"), "runs=", await card.getAttribute("data-runs"), "leaves=", await card.getAttribute("data-leaves"));
  const bars = await card.locator('[data-testid="sc-bar"]').evaluateAll((els: any[]) => els.map((e) => e.getAttribute("data-count")));
  console.log("CARD bars", bars.join("/"));
  await page.screenshot({ path: "evidence/probe-schedule-confidence.png" }).catch(() => {});
});
