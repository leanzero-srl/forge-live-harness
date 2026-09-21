// LZ770B C1c — dates back: the note counts all tasks, and the sensitivity panel recovers.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz770b";
const PLAN = "[harness-test] LZ770B saved-edit bed";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

test("C1c: all tasks dated", async ({ page }) => {
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
  for (let i = 0; i < 40; i++) { if (await card.getAttribute("data-p50")) break; await page.waitForTimeout(2000); }
  console.log("SC", JSON.stringify({ p50: await card.getAttribute("data-p50"), p80: await card.getAttribute("data-p80"), p90: await card.getAttribute("data-p90"), leaves: await card.getAttribute("data-leaves") }));
  const cov = frame.locator('[data-testid="sc-coverage"]').first();
  console.log("COVERAGE", JSON.stringify({ dated: await cov.getAttribute("data-dated"), total: await cov.getAttribute("data-total"), excluded: await cov.getAttribute("data-excluded") }));
  const note = (await frame.locator('[data-testid="sc-coverage-note"]').first().textContent().catch(() => null))?.trim();
  console.log("NOTE", note);
  const btn = frame.getByRole("button", { name: /Test finish sensitivity/i }).first();
  await btn.scrollIntoViewIfNeeded().catch(() => {});
  await btn.click();
  for (let i = 0; i < 90; i++) { if (await frame.locator('[data-testid="finish-effect"]').count()) break; if (/Unavailable:/.test(await bodyText(frame))) break; await page.waitForTimeout(1000); }
  const sect = ((await frame.locator('[data-testid="finish-sensitivity"]').first().textContent()) || "").replace(/\s+/g, " ");
  console.log("SENS_SECTION", sect.slice(0, 700));
  const n = await frame.locator('[data-testid="finish-effect"]').count();
  console.log("SENS_ROWS", n);
  for (let i = 0; i < n; i++) console.log("  ", await frame.locator('[data-testid="finish-effect"]').nth(i).getAttribute("data-key"), (await frame.locator('[data-testid="finish-effect"]').nth(i).textContent())?.replace(/\s+/g, " "));
  await page.screenshot({ path: `${OUT}/c1-04-redated.png` });
  expect(note).toBe("All 4 tasks carry dates.");
});
