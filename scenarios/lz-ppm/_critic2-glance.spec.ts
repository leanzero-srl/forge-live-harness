import { test, expect } from "../../fixtures/forge";
import { assertLoggedIn } from "../../forge/browser";
import { BASE_URL } from "../../config/env";
import * as fs from "fs";
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/critic2";
test.describe.configure({ retries: 0, timeout: 900_000 });
async function glanceFrame(page: any, ms = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    for (const f of page.frames()) {
      const hit = await f.evaluate(() => !!document.querySelector('[data-testid="issue-glance"]')).catch(() => false);
      if (hit) return f;
    }
    await page.waitForTimeout(1500);
  }
  return null;
}
test("G glance on WFH-3248 and WFH-3232", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  await assertLoggedIn(page);
  for (const key of ["WFH-3248", "WFH-3232"]) {
    await page.goto(`${BASE_URL}/browse/${key}`, { waitUntil: "domcontentloaded" });
    let f = await glanceFrame(page, 20_000);
    if (!f) {
      await page.getByRole("button", { name: /View app actions/i }).first().click({ timeout: 30_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.getByRole("menuitem", { name: /LeanZero Management Position/i }).first().click({ timeout: 20_000 })
        .catch(async () => { await page.getByText(/^LeanZero Management Position$/).first().click({ timeout: 20_000 }).catch(() => {}); });
      await page.waitForTimeout(5000);
      f = await glanceFrame(page, 90_000);
    }
    if (!f) { console.log("NO GLANCE", key); continue; }
    await page.waitForTimeout(3000);
    const g = f.locator('[data-testid="issue-glance"]');
    const t = await g.innerText();
    console.log(`=== GLANCE ${key} state=${await g.getAttribute("data-state")} mode=${await g.getAttribute("data-mode")}\n${t}`);
    fs.writeFileSync(`${SHOT}/glance-${key}.txt`, t);
    await g.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: `${SHOT}/shots/glance-${key}.png` });
    const tabs = f.locator('button').filter({ hasText: /^(Engineer|PM)$/ });
    const n = await tabs.count();
    console.log("MODE TABS:", n);
    if (n) {
      for (let i = 0; i < n; i++) {
        await tabs.nth(i).click().catch(() => {});
        await page.waitForTimeout(2500);
        const label = await tabs.nth(i).innerText();
        const tx = await g.innerText();
        console.log(`--- ${key} mode ${label}\n${tx}`);
        fs.writeFileSync(`${SHOT}/glance-${key}-${label}.txt`, tx);
        await page.screenshot({ path: `${SHOT}/shots/glance-${key}-${label}.png` });
      }
    }
  }
  expect(1).toBe(1);
});
