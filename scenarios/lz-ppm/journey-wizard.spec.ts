// PERSISTENT journey J6 — create-plan wizard validation gates. Probes: empty name blocks
// Continue; an INVALID JQL — does it still let you proceed? (isSourceValid only checks
// non-empty, so likely YES = a validation gap). Cancels out — creates NO plan.
import { test } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 200_000 });

test("J6 wizard: validation gates (empty name, invalid JQL)", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  // Do NOT open a plan — we want the plan list. Click "+ New Plan".
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /New Plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/j6-1-name.png` });

  // Step 1: NAME. Empty → Continue disabled.
  const contDisabledEmpty = await frame.getByRole("button", { name: /Continue/i }).first().isDisabled().catch(() => null);
  console.log("CONTINUE_DISABLED_ON_EMPTY_NAME (should be TRUE):", contDisabledEmpty);
  await frame.getByPlaceholder(/Q2 Release Plan/i).fill("ZZZ J6 throwaway — delete me").catch(() => {});
  await page.waitForTimeout(500);
  const contEnabledNamed = await frame.getByRole("button", { name: /Continue/i }).first().isEnabled().catch(() => null);
  console.log("CONTINUE_ENABLED_AFTER_NAME (should be TRUE):", contEnabledNamed);
  await frame.getByRole("button", { name: /Continue/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);

  // Step 2: SOURCES. Enter an INVALID JQL and see if we can still proceed.
  await page.screenshot({ path: `${SHOT}/j6-2-sources.png` });
  const jql = frame.getByPlaceholder(/project = PROJ AND type/i).first();
  const jqlFound = await jql.isVisible().catch(() => false);
  console.log("JQL_INPUT_FOUND:", jqlFound);
  if (jqlFound) {
    await jql.fill("this is definitely not valid jql !!!");
    await page.waitForTimeout(2500); // let JqlValidation run
    const body = (await frame.locator("body").textContent().catch(() => "")) || "";
    const showsError = /invalid|error|not valid|syntax|could not|failed/i.test(body);
    const contDisabled = await frame.getByRole("button", { name: /Continue|Create/i }).first().isDisabled().catch(() => null);
    console.log("INVALID_JQL_SHOWS_ERROR:", showsError, " PROCEED_BLOCKED (Continue/Create disabled?):", contDisabled);
    await page.screenshot({ path: `${SHOT}/j6-3-invalid-jql.png` });
  }

  // Cancel out — create NO plan.
  await frame.getByRole("button", { name: /Cancel/i }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
  // If a confirm appears, dismiss.
  await frame.getByRole("button", { name: /Discard|Leave|Yes|Confirm/i }).first().click().catch(() => {});
  await page.waitForTimeout(1000);
});
