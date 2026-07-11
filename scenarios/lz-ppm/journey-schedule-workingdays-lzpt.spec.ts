// PERSISTENT feature journey — Schedule-view WORKING-DAY correctness on LZPT
// (read-only). Beyond the render-smoke journey, this asserts the MATH of the plan's
// calendar: the ACTIVE preset is "Standard (Mon-Fri)" with working days EXACTLY
// {Mon..Fri} = [1,2,3,4,5], weekend (Sun 0 / Sat 6) NOT working, and exactly ONE
// preset is active. This is the working-day pattern that drives every cascade.
// Non-mutating. NEVER Applies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Schedule: active calendar = Standard Mon-Fri, working days exactly [1..5]", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();

  await page.waitForTimeout(1800);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Schedule/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Schedule/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  const presets = await realFrame!.evaluate(() =>
    Array.from(document.querySelectorAll('[data-testid="calendar-preset"]')).map((el) => ({
      name: el.getAttribute("data-preset-name"),
      active: el.getAttribute("data-active") === "1",
      days: (el.getAttribute("data-working-days") || "").split(",").filter(Boolean).map(Number),
    })),
  );
  console.log("PRESETS:", JSON.stringify(presets));
  expect(presets.length, "calendar presets render").toBeGreaterThanOrEqual(3);

  // Exactly ONE preset is active — the plan's calendar.
  const active = presets.filter((p) => p.active);
  expect(active.length, "exactly one calendar is active").toBe(1);
  const cal = active[0];
  console.log("ACTIVE_CALENDAR:", cal.name, " DAYS:", JSON.stringify(cal.days));

  // It's the seeded Standard (Mon-Fri) calendar.
  expect(cal.name, "active calendar is Standard (Mon-Fri)").toMatch(/Standard \(Mon-Fri\)/i);
  // Working days are EXACTLY Mon..Fri (1..5) — the pattern that drives cascade.
  expect([...cal.days].sort((a, b) => a - b), "working days are exactly Mon..Fri").toEqual([1, 2, 3, 4, 5]);
  // The weekend is NOT working.
  expect(cal.days.includes(0), "Sunday (0) is NOT a working day").toBeFalsy();
  expect(cal.days.includes(6), "Saturday (6) is NOT a working day").toBeFalsy();
});
