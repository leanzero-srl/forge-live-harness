// ONE-OFF bed restore: recreates the "LZPT Scenarios" plan through the real wizard,
// so it is owned by the logged-in user (createFixture stamps createdBy:'harness' with
// defaultAccess:'none', which hides the plan from the owner's own plan list).
//
// The LZPT Jira project itself is NOT touched — its 45 issues, including the
// DIAMOND-A/B1/B2/C set the owner reported against, are intact and their keys must
// stay stable. Do NOT run _seed-lzpt, which wipes and recreates them.
//
// Guarded: only runs with RESTORE=1.
//   RESTORE=1 npx playwright test --project=chromium scenarios/lz-ppm/_restore-lzpt-plan.spec.ts
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";

const T = getTarget("lz-ppm-dashboard");
const NAME = "LZPT Scenarios";
const JQL = "project = LZPT";
test.describe.configure({ retries: 0, timeout: 600_000 });
const bodyText = async (f: any) => (await f.locator("body").textContent().catch(() => "")) || "";

test(`restore the "${NAME}" plan`, async ({ page }) => {
  test.skip(process.env.RESTORE !== "1", "guarded — set RESTORE=1");

  await page.setViewportSize({ width: 1600, height: 1000 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first()
    .waitFor({ state: "attached", timeout: 30_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null;
  if (!frame) throw new Error("no frame");
  await page.waitForTimeout(2000);

  if (new RegExp(NAME, "i").test(await bodyText(frame))) {
    console.log(`"${NAME}" already exists — nothing to do`);
    return;
  }

  await frame.getByRole("button", { name: /New plan/i }).first().click()
    .catch(async () => { await frame.getByText(/New plan/i).first().click().catch(() => {}); });
  await page.waitForTimeout(1500);

  await frame.getByPlaceholder(/Q2 Release Plan/i).first().fill(NAME);
  const cont = () => frame.getByRole("button", { name: /Continue/i }).first();
  await cont().click();
  await page.waitForTimeout(1000);

  await frame.getByPlaceholder(/project = PROJ/i).first().fill(JQL);
  await frame.getByText(/✓ Valid/i).first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  await cont().click(); await page.waitForTimeout(900); // calendar (Standard Mon-Fri)
  await cont().click(); await page.waitForTimeout(900); // visibility
  await cont().click(); await page.waitForTimeout(900); // milestones (skip)
  await frame.getByRole("button", { name: /Create & Index/i }).first().click();

  // Indexing 45 issues; poll until the plan view is up with the full count.
  let indexed = false;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(3000);
    const t = await bodyText(frame);
    if (/Showing\s+45\s+of\s+45|45\s+issues/i.test(t)) { indexed = true; break; }
  }
  const text = await bodyText(frame);
  console.log("plan body sample:", text.slice(0, 300).replace(/\s+/g, " "));
  expect(indexed, `"${NAME}" should index all 45 LZPT issues`).toBe(true);

  await page.screenshot({ path: "test-results/restore-lzpt-plan.png", fullPage: false });
});
