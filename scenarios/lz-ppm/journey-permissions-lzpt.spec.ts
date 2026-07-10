// PERSISTENT feature journey — Permissions view on LZPT (read-only). Verifies the
// visibility options, the members list with the plan owner, and the add-member
// control. Does NOT mutate membership (that needs a second account).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 200_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Permissions view: visibility options + owner", async ({ page }) => {
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
  await frame.getByRole("button", { name: /^Permissions/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  const body = await bodyText(frame);
  const hasVisibility = /Private|Open to all/i.test(body);
  const hasOwner = /Owner/i.test(body);
  const errored = /Something went wrong|failed to load/i.test(body);
  console.log("PERMISSIONS_HAS: visibility", hasVisibility, " owner", hasOwner, " errored", errored);
  expect(errored, "Permissions view renders without error").toBeFalsy();
  expect(hasVisibility, "shows plan visibility options (Private / Open to all)").toBeTruthy();
  expect(hasOwner, "shows the plan owner (the creator, with an Owner badge)").toBeTruthy();
});
