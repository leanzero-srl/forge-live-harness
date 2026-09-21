// LZ790 item 7 — the scoped coverage sentence on the IN-APP RECEIPT.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz790shots";
const PLAN = "LZ790 retest bed";
test.describe.configure({ retries: 0, timeout: 900_000 });
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("I7: the receipt prints the scoped coverage sentence", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  for (let i = 0; i < 8; i++) { await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {}); await page.waitForTimeout(3000); if (await frame.getByRole("button", { name: /^Planning/i }).count()) break; }
  await frame.getByRole("button", { name: /^Planning/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/i7-00-planning.png`, fullPage: true });
  const t = await bodyText(frame);
  console.log("PLANNING_SNIP", t.slice(0, 1500));
  // Planning has SUB-TABS: Scenarios & history | Targets | Forecast outcomes | Sponsor reports | Plan decisions
  await frame.getByText("Sponsor reports", { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  console.log("REPORTS_TAB", (await bodyText(frame)).slice(600, 2200));
  await page.screenshot({ path: `${OUT}/i7-02-reports-tab.png`, fullPage: true });
  await frame.getByText("LZ790 coverage receipt", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/i7-03-report-open.png`, fullPage: true });
  console.log("REPORT_OPEN", (await bodyText(frame)).slice(600, 2600));
  // "Preview section" is the app's CUSTOM Select (button + panel), not a native one.
  await frame.locator("button").filter({ hasText: /^Timeline \(\d+\)$/ }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/i7-04-section-open.png`, fullPage: true });
  const opts = await frame.locator('[role="option"]').allTextContents().catch(() => []);
  console.log("SECTION_OPTIONS", JSON.stringify(opts));
  // Forge sizes the iframe TALL, so a fixed popup can read as outside the viewport.
  await frame.locator('[role="option"]').filter({ hasText: /^Targets \(\d+\)$/ }).first().dispatchEvent("click").catch((e: any) => console.log("OPT_ERR", String(e).slice(0, 120)));
  await page.waitForTimeout(7000);
  const t2 = await bodyText(frame);
  console.log("HAS_SENTENCE", /1 of 3 scoped tasks has no usable dates and is not in this finish\./.test(t2));
  const m = t2.match(/.{0,200}scoped tasks has no usable dates.{0,120}/);
  console.log("SENTENCE_CONTEXT", m ? m[0] : "(not found)");
  console.log("HAS_SCOPE_NOT_FORECAST", /Not simulated: a target is forecast over every task in its scope/.test(t2));
  console.log("HAS_OLD_SENTENCE", /dependency network is incomplete or the forecast could not finish/.test(t2));
  await page.screenshot({ path: `${OUT}/i7-01-receipt.png`, fullPage: true });
});
