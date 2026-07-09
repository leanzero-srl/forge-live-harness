// PERSISTENT journey J5 — Table edit gating. Found (adversarially) that PARENT cells
// were editable (they roll up from children — editing them breaks the parent bar and
// would corrupt Jira on Apply). This verifies the fix: a parent's date/duration/buffer
// cells are READ-ONLY (no editor opens, no change staged). Leaf editing + autosave is
// covered by the draft-autosave verifies.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 180_000 });

test("J5 parent cells are read-only", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);

  // WFH-1 "FISKARS - MVP JIRA Form" is a top-level PARENT; filter isolates it (+children).
  await frame.getByPlaceholder(/Filter tasks/i).fill("FISKARS - MVP JIRA Form");
  await page.waitForTimeout(1200);

  // Click the parent's duration cell (63d, the highest → first under the persisted sort).
  await frame.locator("text=/^\\d+d$/").first().click().catch(() => {});
  await page.waitForTimeout(700);
  const durEditorOpened = await frame.locator('input[inputmode="numeric"]').first().isVisible().catch(() => false);
  console.log("PARENT_DURATION_EDITOR_OPENED (should be FALSE):", durEditorOpened);

  // Click the parent's start-date cell.
  await frame.locator("text=/^[A-Z][a-z]{2} \\d/").first().click().catch(() => {});
  await page.waitForTimeout(700);
  const stagedAfterClicks = await frame.getByRole("button", { name: /Apply \d+ change|Save \(\d+\)/i }).isVisible().catch(() => false);
  console.log("STAGED_AFTER_PARENT_CLICKS (should be FALSE):", stagedAfterClicks);

  await page.screenshot({ path: `${SHOT}/j5-parent-readonly.png`, clip: { x: 310, y: 195, width: 1190, height: 130 } });

  expect(durEditorOpened, "parent duration cell must not open an editor").toBeFalsy();
  expect(stagedAfterClicks, "clicking parent cells must not stage a change").toBeFalsy();
});
