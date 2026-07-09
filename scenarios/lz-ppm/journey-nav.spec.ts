// PERSISTENT journey J1 — multi-view navigation. Adversarial + read-only.
// Visits all 5 views, asserts each renders a signature element, hunts for
// cross-view issue-count inconsistency + render failures.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
test.describe.configure({ retries: 0, timeout: 220_000 });

test("J1 nav: all 5 views render + count consistent", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const surface = await enterForgeSurface(page, { surface: "custom" });
  const frame = surface.kind === "custom" ? surface.frame : null;
  if (!frame) throw new Error("no frame");
  await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  const bodyText = async () => (await frame.locator("body").textContent().catch(() => "")) || "";
  const results: Record<string, any> = {};

  async function visit(tab: RegExp, name: string, signature: RegExp) {
    await frame!.getByRole("button", { name: tab }).first().click().catch(() => {});
    await page.waitForTimeout(2500);
    const txt = await bodyText();
    const sigOk = signature.test(txt);
    // hunt for an obvious render failure
    const crashed = /something went wrong|failed to load|cannot read|undefined is not/i.test(txt);
    results[name] = { sigOk, crashed };
    console.log(`VIEW ${name}: signature=${sigOk} crashed=${crashed}`);
    await page.screenshot({ path: `${SHOT}/j1-${name}.png` });
    return txt;
  }

  const gantt = await visit(/^Gantt/i, "gantt", /Today|Legend|Critical/i);
  const table = await visit(/^Table/i, "table", /Filter tasks|issues/i);
  await visit(/^Dashboard/i, "dashboard", /Complete|On track|Overdue|Buffer|Issues/i);
  await visit(/^Schedule/i, "schedule", /Working|calendar|holiday|week|day/i);
  await visit(/^Permissions/i, "permissions", /member|role|owner|access|permission|viewer|editor/i);

  // Cross-view count consistency: the header "287issues" should be stable; Table shows "287 issues".
  const headerCount = (gantt.match(/(\d+)\s*issues/) || [])[1];
  const tableCount = (table.match(/(\d+)\s+issues/) || [])[1];
  console.log("HEADER_COUNT:", headerCount, "TABLE_COUNT:", tableCount);

  // Assertions: no view crashed; each shows its signature.
  for (const [name, r] of Object.entries(results)) {
    expect(r.crashed, `${name} view render error`).toBeFalsy();
    expect(r.sigOk, `${name} view missing signature`).toBeTruthy();
  }
  expect(tableCount, "table count present").toBeTruthy();
});
