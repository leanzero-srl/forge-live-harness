// WIZARD JQL-GATE journey — a CONFIRMED-invalid JQL source must DISABLE the wizard's
// "Continue", and a valid one must ENABLE it (the live JqlValidation was shown but never
// wired to the button — the gate now is). Non-destructive: cancels before creating a plan.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
test.describe.configure({ retries: 1, timeout: 180_000 });
async function bodyText(f: any) { return (await f.locator("body").textContent().catch(() => "")) || ""; }

test("WIZARD: invalid JQL disables Continue, valid JQL enables it", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(1500);

  // Open the wizard + name step → Continue.
  await frame.getByRole("button", { name: /New plan/i }).first().click().catch(async () => {
    await frame.getByText(/New plan/i).first().click().catch(() => {});
  });
  await page.waitForTimeout(1500);
  await frame.getByPlaceholder(/Q2 Release Plan/i).first().fill("Wizard JQL Gate Test");
  const continueBtn = () => frame.getByRole("button", { name: /Continue/i }).first();
  await continueBtn().click();
  await page.waitForTimeout(1200);

  // Sources step: default source is JQL. Type a CONFIRMED-invalid query (unclosed paren —
  // a hard syntax error; note the string has no "Invalid"/"✗" so it can't false-match below).
  const jql = frame.getByPlaceholder(/project = PROJ/i).first();
  await jql.fill("project in (");
  // Wait for validation to actually RESOLVE (either ✗ or ✓ Valid appears — not just loading).
  await frame.getByText(/✗|✓ Valid/i).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1000);
  const invalidBody = await bodyText(frame);
  const disabledOnInvalid = await continueBtn().isDisabled().catch(() => false);
  console.log("INVALID: showsX=", /✗/.test(invalidBody), "showsValid=", /✓ Valid/i.test(invalidBody), "continueDisabled=", disabledOnInvalid);
  expect(/✗/.test(invalidBody), "the invalid JQL is confirmed invalid (✗ shown)").toBe(true);
  expect(disabledOnInvalid, "Continue is DISABLED on a confirmed-invalid JQL").toBe(true);

  // Now a VALID query → Continue must re-enable.
  await jql.fill("project = LZPT ORDER BY created ASC");
  await frame.getByText(/✓ Valid/i).first().waitFor({ state: "visible", timeout: 12_000 }).catch(() => {});
  await page.waitForTimeout(800);
  const validBody = await bodyText(frame);
  const disabledOnValid = await continueBtn().isDisabled().catch(() => true);
  console.log("VALID: showsValid=", /✓ Valid/i.test(validBody), "continueDisabled=", disabledOnValid);
  expect(/✓ Valid/i.test(validBody), "valid JQL shows the ✓ Valid affordance").toBe(true);
  expect(disabledOnValid, "Continue is ENABLED on a valid JQL").toBe(false);

  // Non-destructive: cancel out (never create a plan).
  await frame.getByRole("button", { name: /Cancel/i }).first().click().catch(() => {});
  console.log("WIZARD_JQL_GATE_DONE");
});
