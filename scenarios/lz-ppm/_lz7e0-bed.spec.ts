// LZ7E0 exit sweep — prove the LZPT bed is as it was found: no report, no target,
// no retained capture from this run, no staged draft, no baseline, protection off.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz7e0";
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 1_200_000 });
const txt = async (l: any) => ((await l.textContent().catch(() => "")) || "").replace(/\s+/g, " ");
const bodyText = async (f: any) => ((await f.locator("body").textContent().catch(() => "")) || "").replace(/\s+/g, " ");

test("E0: bed state at exit", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame: any = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await page.waitForTimeout(9000);
  console.log("SHELL_REV", ((await bodyText(frame)).match(/rev\s*v?([\d.]+)/) || [])[1]);
  await frame.getByText(PLAN, { exact: true }).first().click().catch(() => {});
  await page.waitForTimeout(9000);
  if (!/Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(8000);
  console.log("STAGED_ON_COLD_OPEN", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  console.log("PROTECTION_TEXT", JSON.stringify(((await bodyText(frame)).match(/[^.]{0,80}protect[^.]{0,80}/i) || [])[0] ?? null));
  await page.screenshot({ path: `${OUT}/e0-00-plan.png` });
  await frame.getByRole("button", { name: /^Planning$/i }).first().click().catch(() => {});
  await page.waitForTimeout(7000);
  console.log("HISTORY", JSON.stringify((await bodyText(frame)).slice(0, 1200)));
  await page.screenshot({ path: `${OUT}/e0-01-history.png`, fullPage: true });
  await frame.getByRole("button", { name: /^Targets$/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  console.log("TARGET_ROWS", await frame.locator('[data-testid="target-row"]').count(), JSON.stringify(await frame.locator('[data-testid="target-row"]').allTextContents().catch(() => [])));
  await frame.getByRole("button", { name: /Sponsor reports?/i }).first().click().catch(() => {});
  await frame.locator('[data-testid="sponsor-reports"]').waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(6000);
  console.log("REPORTS", JSON.stringify((await txt(frame.locator('[data-testid="sponsor-reports"]'))).slice(0, 500)));
  console.log("CAPTURE_BANNER", await frame.locator('[data-testid="report-capture-progress"]').count());
  console.log("FINISH_BTN", await frame.locator("button").filter({ hasText: /Finish capture cleanup/i }).count());
  await page.screenshot({ path: `${OUT}/e0-02-reports.png`, fullPage: true });
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(5000);
  console.log("STAGED_AFTER_CLEANUP", /Apply\s+\d+\s+change|Save\s*\(\d+\)/i.test(await bodyText(frame)));
  await page.screenshot({ path: `${OUT}/e0-03-final.png` });
});
