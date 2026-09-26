// What the plan VIEW itself shows for the lagged successor, and the dashboard hero
// beside it. Reconciles card (settled+lag) vs dashboard (client state).
import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";

const T = getTarget("lz-ppm-dashboard");
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lagbed";
const NAME = "LagStamp Probe";
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const txt = async (l: any) => (await l.innerText().catch(() => "(none)")) || "(none)";

test("plan view rows vs dashboard hero", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 90_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.frame;
  await page.waitForTimeout(4000);
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 120_000 });
  await page.waitForTimeout(2500);
  await frame.locator('[data-testid="plan-card"]').filter({ hasText: NAME }).first().click();
  await page.waitForTimeout(10000);
  // Table view
  await frame.getByRole("button", { name: /^Table$/i }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  const rows = await frame.locator('[data-testid="table-row"]').all();
  const out: any[] = [];
  for (const r of rows) {
    out.push({
      key: await r.getAttribute("data-row-key"),
      start: await r.getAttribute("data-row-start"),
      due: await r.getAttribute("data-row-due"),
    });
  }
  console.log("TABLE ROWS:", JSON.stringify(out));
  await page.screenshot({ path: `${OUT}/shot-table.png` });
  const bodyTxt = await txt(frame.locator("body"));
  fs.writeFileSync(`${OUT}/ui-table.json`, JSON.stringify({ rows: out, staged: /Apply \d+ change/.test(bodyTxt) }, null, 2));
  console.log("STAGED?", /Apply \d+ change/.test(bodyTxt));
  expect(rows.length).toBe(3);
});
