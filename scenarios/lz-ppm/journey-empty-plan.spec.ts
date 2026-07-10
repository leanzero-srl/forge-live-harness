// PERSISTENT journey J13 — empty (0-issue) plan states. Creates a throwaway plan with a
// valid 0-match JQL, audits the empty states across views, then DELETES it (critical
// cleanup — assert it's gone). NEVER Apply.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/848bc036-f0f1-4281-b0cf-12ff9cf45fd9/scratchpad";
const NAME = "ZZZ empty — delete me";
test.describe.configure({ retries: 0, timeout: 260_000 });

test("J13 empty-plan states + delete cleanup", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 950 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2500);

  // --- Create the throwaway plan via the wizard ---
  await frame.getByRole("button", { name: /New Plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(1200);
  await frame.getByPlaceholder(/Q2 Release Plan/i).fill(NAME).catch(() => {});
  await page.waitForTimeout(400);
  await frame.getByRole("button", { name: /Continue/i }).first().click().catch(() => {}); // -> sources
  await page.waitForTimeout(1000);
  // Valid JQL that matches nothing.
  await frame.getByPlaceholder(/project = PROJ AND type/i).first().fill('project = WFH AND created > "2099-01-01"').catch(() => {});
  await page.waitForTimeout(3000); // let JqlValidation run (should say ~0 issues, valid)
  const jqlState = (await frame.locator("body").textContent().catch(() => "")) || "";
  console.log("JQL_VALID_0:", /Valid/i.test(jqlState), " (mentions 0?)", /~?0 issue/i.test(jqlState));

  // Continue through calendar/visibility/milestones until the Create button appears.
  for (let i = 0; i < 6; i++) {
    const createBtn = frame.getByRole("button", { name: /Create plan|Create Plan|^Create/i });
    if (await createBtn.first().isVisible().catch(() => false)) break;
    await frame.getByRole("button", { name: /Continue/i }).first().click().catch(() => {});
    await page.waitForTimeout(900);
  }
  await page.screenshot({ path: `${SHOT}/j13-review.png` });
  await frame.getByRole("button", { name: /Create plan|Create Plan|^Create/i }).first().click().catch(() => {});
  await page.waitForTimeout(9000); // create + index (0 issues)

  // --- Audit empty states across views ---
  async function viewText(tab: RegExp) {
    await frame!.getByRole("button", { name: tab }).first().click().catch(() => {});
    await page.waitForTimeout(2000);
    return (await frame!.locator("body").textContent().catch(() => "")) || "";
  }
  const ganttT = await viewText(/^Gantt/i);
  await page.screenshot({ path: `${SHOT}/j13-gantt.png` });
  const tableT = await viewText(/^Table/i);
  const dashT = await viewText(/^Dashboard/i);
  await page.screenshot({ path: `${SHOT}/j13-dash.png` });
  const schedT = await viewText(/^Schedule/i);
  const permT = await viewText(/^Permissions/i);

  const emptyOnData = /No issues indexed|Index this plan|Index Now/i.test(ganttT) || /No issues indexed/i.test(tableT);
  const leakOnConfig = /No issues indexed/i.test(schedT) || /No issues indexed/i.test(permT);
  const dashNaN = /NaN|Infinity/i.test(dashT);
  console.log("EMPTY_STATE_ON_DATA_VIEW:", emptyOnData);
  console.log("LEAK_ON_SCHEDULE_OR_PERMISSIONS (should be FALSE):", leakOnConfig);
  console.log("DASHBOARD_NaN_OR_INFINITY (should be FALSE):", dashNaN);

  // --- CLEANUP: delete the throwaway plan. NOTE: Delete is gated to Gantt/Table
  // views (hidden on Dashboard/Schedule/Permissions) — switch to Gantt first. ---
  await frame.getByRole("button", { name: /^Gantt/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await frame.getByRole("button", { name: /^Delete$/i }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await frame.locator('[role="dialog"]').getByRole("button", { name: /^Delete$/i }).first().click().catch(() => {});
  await page.waitForTimeout(4500);
  // Verify gone from the plan list.
  await page.waitForTimeout(1500);
  const listText = (await frame.locator("body").textContent().catch(() => "")) || "";
  const stillThere = listText.includes(NAME);
  console.log("THROWAWAY_PLAN_STILL_EXISTS (should be FALSE):", stillThere);
  await page.screenshot({ path: `${SHOT}/j13-after-delete.png` });

  expect(leakOnConfig, "no empty-state leak on schedule/permissions").toBeFalsy();
  expect(dashNaN, "dashboard shows no NaN/Infinity with 0 issues").toBeFalsy();
  expect(stillThere, "throwaway plan deleted").toBeFalsy();
});
