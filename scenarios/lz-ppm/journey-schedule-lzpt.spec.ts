// PERSISTENT feature journey — Schedule view on LZPT (read-only). The plan was
// seeded with the Standard (Mon-Fri) calendar; verify the Schedule surface shows
// the plan calendar, the calendar presets, and the holidays tab.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 200_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Schedule view: plan calendar, presets, holidays tab", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Schedule/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  const body = await bodyText(frame);
  console.log("SCHEDULE_HAS: title", /Plan Schedule/i.test(body), " cal", /Standard \(Mon-Fri\)/i.test(body), " presets", /Select a Calendar/i.test(body), " holidays", /Holidays/i.test(body));
  expect(/Plan Schedule/i.test(body), "Schedule view renders its title").toBeTruthy();
  expect(/Standard \(Mon-Fri\)/i.test(body), "shows the plan's Standard (Mon-Fri) calendar").toBeTruthy();
  expect(/Select a Calendar/i.test(body), "shows calendar presets to choose from").toBeTruthy();
  expect(/Holidays/i.test(body), "has a Holidays tab").toBeTruthy();

  // Holidays tab renders without crashing.
  await frame.getByRole("button", { name: /Holidays/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  const errored = /Something went wrong|failed to load/i.test(await bodyText(frame));
  expect(errored, "Holidays tab renders without error").toBeFalsy();
});
