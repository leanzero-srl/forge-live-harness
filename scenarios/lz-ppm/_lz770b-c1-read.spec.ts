// LZ770B C1-read — read the Schedule-confidence card in whatever state the bed is in.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const PLAN = "[harness-test] LZ770B saved-edit bed";
const TAG = process.env.LZ_READ_TAG || "read";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

test("C1-read: schedule confidence snapshot", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(6000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click();
  await page.waitForTimeout(18000);
  const card = frame.locator('[data-testid="schedule-confidence"]').first();
  for (let i = 0; i < 30; i++) { if (await card.getAttribute("data-p50")) break; await page.waitForTimeout(2000); }
  console.log(`[${TAG}] SC`, JSON.stringify({
    p50: await card.getAttribute("data-p50"), p80: await card.getAttribute("data-p80"), p90: await card.getAttribute("data-p90"),
    runs: await card.getAttribute("data-runs"), leaves: await card.getAttribute("data-leaves"),
    uncertainty: await card.getAttribute("data-uncertainty"), onbaseline: await card.getAttribute("data-onbaseline"),
  }));
  const cov = frame.locator('[data-testid="sc-coverage"]').first();
  console.log(`[${TAG}] COVERAGE`, JSON.stringify({ dated: await cov.getAttribute("data-dated"), total: await cov.getAttribute("data-total"), excluded: await cov.getAttribute("data-excluded") }));
  console.log(`[${TAG}] NOTE`, (await frame.locator('[data-testid="sc-coverage-note"]').first().textContent().catch(() => null))?.trim() ?? "ABSENT");
  const t = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log(`[${TAG}] AMBER`, /Forecast unavailable — correct the schedule dates first\./.test(t) ? "PRESENT" : "absent");
  console.log(`[${TAG}] COVERAGE_BODY`, ((await cov.textContent()) || "").replace(/\s+/g, " ").slice(0, 420));
  await page.screenshot({ path: `${OUT}/c1-read-${TAG}.png` });
});
