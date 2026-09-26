// Item 5 gap-fill: DARK holiday list + DARK DatePicker showing TODAY's cell.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lagbed";
test.describe.configure({ retries: 0, timeout: 900_000, mode: "serial" });

test("dark holiday list + today cell", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  const h = await frame.locator(":root").elementHandle();
  const f = await h!.ownerFrame();
  const dark = async () => f!.evaluate(() => { document.documentElement.setAttribute("data-color-mode", "dark"); document.documentElement.setAttribute("data-theme", "dark"); });
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
  await dark();
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: "LagStamp Probe" }).first().click();
  await page.waitForTimeout(9000);
  await dark();
  await frame.getByRole("button", { name: /^Schedule$/i }).first().click();
  await page.waitForTimeout(4000);
  await dark();
  await frame.getByRole("button", { name: /^Bank Holidays/i }).first().click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/dark-13-holiday-list.png` });
  await frame.getByRole("button", { name: /Choose date/i }).first().click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/dark-14-datepicker-today.png` });
  expect(await frame.locator(".lz-datepicker").count()).toBeGreaterThan(0);
});
