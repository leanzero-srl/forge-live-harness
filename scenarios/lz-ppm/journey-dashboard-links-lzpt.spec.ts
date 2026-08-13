// PERSISTENT journey — #5 "Schedule-risk and Milestone rows are not clickable".
// The fix wired openIssueRow() onto the risk, milestone and baseline-variance
// rows (role/tabIndex/Enter/Space, like KpiTile). Assert: both row kinds are
// keyboard-operable buttons, and clicking one opens the Jira issue view (the
// dialog appears in the OUTER page — jira-bridge openIssueModal). Read-only.
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 1, timeout: 240_000 });
async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT dashboard: risk and milestone rows are clickable and open the issue", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  const realFrame = await (await frame.locator(":root").elementHandle())!.ownerFrame();
  await page.waitForTimeout(2000);
  await frame.getByText(PLAN, { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  if (!/Gantt|Table|Dashboard/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await frame.getByRole("button", { name: /^Dashboard/i }).first().click().catch(() => {});
  await page.waitForTimeout(3500);

  // Both row kinds must be interactive: role=button + focusable.
  const rows = await realFrame!.evaluate(() => {
    const probe = (sel: string) => {
      const els = Array.from(document.querySelectorAll(sel));
      return {
        count: els.length,
        buttons: els.filter((e) => e.getAttribute("role") === "button" || e.tagName === "BUTTON").length,
        focusable: els.filter((e) => e.tagName === "BUTTON" || (e as HTMLElement).tabIndex >= 0).length,
        firstKey: els[0]?.getAttribute("data-key") || null,
      };
    };
    return { risk: probe('[data-testid="risk-item"]'), milestone: probe('[data-testid="milestone-row"]') };
  });
  console.log("ROWS", JSON.stringify(rows));
  expect(rows.risk.count, "risk rows rendered").toBeGreaterThan(0);
  expect(rows.milestone.count, "milestone rows rendered").toBeGreaterThan(0);
  expect(rows.risk.buttons, "every risk row is a button").toBe(rows.risk.count);
  expect(rows.milestone.buttons, "every milestone row is a button").toBe(rows.milestone.count);
  expect(rows.risk.focusable, "every risk row is keyboard-focusable").toBe(rows.risk.count);
  expect(rows.milestone.focusable, "every milestone row is keyboard-focusable").toBe(rows.milestone.count);

  // Clicking a risk row opens the Jira issue view — the dialog lands in the
  // OUTER page. This is the user-visible outcome the report was about.
  const clickedKey = rows.risk.firstKey;
  await frame.locator('[data-testid="risk-item"]').first().click();
  let dialogText = "";
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1500);
    dialogText = (await page.locator('[role="dialog"]').last().textContent().catch(() => "")) || "";
    if (clickedKey && dialogText.includes(clickedKey)) break;
  }
  console.log("ISSUE_DIALOG contains", clickedKey, ":", !!(clickedKey && dialogText.includes(clickedKey)));
  expect(clickedKey && dialogText.includes(clickedKey), `the Jira issue dialog opened for ${clickedKey}`).toBeTruthy();
  await page.keyboard.press("Escape").catch(() => {});
});
