// LZ770B C1 — one undated leaf must be COVERAGE, not a refusal.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const PLAN = "[harness-test] LZ770B saved-edit bed";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

test("C1: one undated leaf — forecast still runs, coverage says so", async ({ page }) => {
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
  await page.waitForTimeout(15000);

  const card = frame.locator('[data-testid="schedule-confidence"]').first();
  await card.waitFor({ state: "attached", timeout: 60_000 });
  for (let i = 0; i < 40; i++) { if (await card.getAttribute("data-p50")) break; await page.waitForTimeout(2000); }
  const got = {
    p50: await card.getAttribute("data-p50"), p80: await card.getAttribute("data-p80"), p90: await card.getAttribute("data-p90"),
    runs: await card.getAttribute("data-runs"), leaves: await card.getAttribute("data-leaves"),
  };
  console.log("SCHEDULE_CONFIDENCE", JSON.stringify(got));
  const cov = frame.locator('[data-testid="sc-coverage"]').first();
  console.log("COVERAGE", JSON.stringify({ dated: await cov.getAttribute("data-dated"), total: await cov.getAttribute("data-total"), excluded: await cov.getAttribute("data-excluded") }));
  const note = frame.locator('[data-testid="sc-coverage-note"]').first();
  console.log("COVERAGE_NOTE", (await note.textContent().catch(() => null)) ?? "ABSENT");
  const t = (await bodyText(frame)).replace(/\s+/g, " ");
  console.log("UNAVAILABLE_BANNER", /Forecast unavailable/.test(t) ? "PRESENT (bad)" : "absent (good)");
  const eff = await frame.locator('[data-testid="finish-effect"]').count();
  const sens = await frame.locator('[data-testid="finish-sensitivity"]').count();
  console.log("FINISH_SENSITIVITY section=", sens, " rows=", eff);
  for (let i = 0; i < eff; i++) console.log("  effect", await frame.locator('[data-testid="finish-effect"]').nth(i).getAttribute("data-key"), (await frame.locator('[data-testid="finish-effect"]').nth(i).textContent())?.replace(/\s+/g, " "));
  await card.screenshot({ path: `${OUT}/c1-01-confidence.png` }).catch(async () => { await page.screenshot({ path: `${OUT}/c1-01-confidence.png` }); });
  await page.screenshot({ path: `${OUT}/c1-02-full.png`, fullPage: false });

  expect(got.p50, "p50 present").toBeTruthy();
  expect(got.p80, "p80 present").toBeTruthy();
  expect(got.p90, "p90 present").toBeTruthy();
  expect(await cov.getAttribute("data-excluded")).toBe("1");
  expect((await note.textContent())!.trim()).toBe("1 of 4 tasks has no usable dates and is not in this finish.");
  expect(/Forecast unavailable/.test(t)).toBeFalsy();
});
