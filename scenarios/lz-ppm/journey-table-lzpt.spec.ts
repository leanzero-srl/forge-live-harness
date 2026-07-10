// PERSISTENT feature journey — Table features on the LZPT bed (read-only):
//   A. select-all picks LEAVES only (8 parents excluded → 37 of 45)
//   B. EDGE weekend-span renders with its Fri->Tue dates (working-day duration
//      itself is asserted by the cascade journey's working-day bands)
//   C. filter with no match → empty state
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const PLAN = "LZPT Scenarios";
test.describe.configure({ retries: 0, timeout: 220_000 });

async function bodyText(frame: any) { return (await frame.locator("body").textContent().catch(() => "")) || ""; }

test("LZPT Table: select-all=leaves, working-day duration, filter empty", async ({ page }) => {
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
  if (!/Table|Gantt/i.test(await bodyText(frame))) await frame.getByRole("button", { name: /Open plan/i }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  await frame.getByRole("button", { name: /^Table/i }).first().click().catch(() => {});
  await page.waitForTimeout(3000);

  // ---- A. Select-all picks LEAVES only (parents have no checkbox) ----
  await frame.locator('[title="Select all visible rows"]').first().click().catch(() => {});
  await page.waitForTimeout(800);
  const selBody = await bodyText(frame);
  const selected = Number((selBody.match(/(\d+)\s+selected/) || [])[1] || 0);
  console.log("SELECTED (expect 37 leaves, < 45):", selected);
  expect(selected, "select-all excludes the 8 parents (6 epics + 2 stories)").toBe(37);
  // Deselect (click again / clear) so no lingering selection.
  await frame.locator('[title="Select all visible rows"]').first().click().catch(() => {});
  await page.waitForTimeout(500);

  // ---- B. EDGE weekend-span renders with its Fri->Tue dates ----
  const filter = frame.getByPlaceholder(/Filter tasks/i).first();
  await filter.fill("EDGE weekend-span");
  await page.waitForTimeout(1200);
  const wsBody = await bodyText(frame);
  console.log("WEEKEND_SPAN_DATES May 8 + May 12:", /May 8/.test(wsBody), /May 12/.test(wsBody));
  expect(/EDGE weekend-span/.test(wsBody) && /May 8/.test(wsBody) && /May 12/.test(wsBody), "weekend-span row shows its Fri->Tue dates").toBeTruthy();

  // ---- C. Filter with no match → empty state ----
  await filter.fill("zzz-no-such-task-xyz");
  await page.waitForTimeout(1000);
  const emptyShown = /No tasks match/i.test(await bodyText(frame));
  console.log("EMPTY_STATE_SHOWN:", emptyShown);
  expect(emptyShown, "no-results filter shows the empty state").toBeTruthy();
  await filter.fill("");
});
