import { test, expect } from "../../fixtures/forge";
import { getTarget } from "../../config/targets";
import { assertLoggedIn } from "../../forge/browser";
import { enterForgeSurface } from "../../forge/frame";
import * as fs from "fs";
const T = getTarget("lz-ppm-dashboard");
const SHOT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/critic2";
const st = JSON.parse(fs.readFileSync(`${SHOT}/bed.json`, "utf8"));
test.describe.configure({ retries: 0, timeout: 1_800_000, mode: "serial" });
const bodyText = async (f: any) => (await f.locator("body").innerText().catch(() => "")) || "";
const dump = (n: string, s: string) => fs.writeFileSync(`${SHOT}/${n}.txt`, s);
async function open(page: any) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await assertLoggedIn(page);
  await page.goto(T.deepLink(T.envId)!, { waitUntil: "domcontentloaded" });
  await page.locator('iframe[data-testid="hosted-resources-iframe"], iframe[title*="Iframe"]').first().waitFor({ state: "attached", timeout: 60_000 });
  const s = await enterForgeSurface(page, { surface: "custom" });
  const frame = s.kind === "custom" ? s.frame : null; if (!frame) throw new Error("no frame");
  await frame.locator('[data-testid="plan-card"]').first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  return frame;
}
test("V1 assign the bed plan to the portfolio", async ({ page }) => {
  const frame = await open(page);
  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: "three chains" }).first();
  await card.locator('[data-testid="plan-portfolio-add"]').click();
  await page.waitForTimeout(2000);
  const menu = card.locator('[data-testid="plan-card-menu"]');
  dump("V1-menu", await menu.innerText().catch(() => "(no menu)"));
  console.log("CARD MENU:\n" + (await menu.innerText().catch(() => "(none)")));
  await page.screenshot({ path: `${SHOT}/shots/96-card-menu.png` });
  const sel = card.locator('[data-testid="plan-assign-select"]');
  console.log("assign-select:", await sel.count(), (await sel.innerText().catch(() => "")).replace(/\n/g, " | "));
  await sel.locator("button").first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/shots/97-assign-open.png` });
  await frame.getByText("Critic2 Programme", { exact: true }).last().click().catch((e: any) => console.log("pick fail", e.message));
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SHOT}/shots/98-assigned.png`, fullPage: true });
  dump("98-assigned", await bodyText(frame));
  for (const c of await frame.locator('[data-testid="plan-card"]').all()) { const t = await c.innerText(); if (t.includes("three chains")) console.log("BED CARD:", t.replace(/\n/g, " | ")); }
  console.log("SECTIONS:", JSON.stringify(await frame.locator('[data-testid="plan-section-title"]').allInnerTexts().catch(() => [])));
  console.log("ROLLUPS:", JSON.stringify(await frame.locator('[data-testid="plan-section-rollup"]').allInnerTexts().catch(() => [])));
  const chip = frame.locator('[data-testid="plan-portfolio-chip"]').first();
  if (await chip.count()) { await chip.click(); await page.waitForTimeout(6000); await page.screenshot({ path: `${SHOT}/shots/99-pfpage.png`, fullPage: true }); dump("99-pfpage", await bodyText(frame)); console.log("PF PAGE:\n" + (await bodyText(frame)).slice(0, 3000)); }
  expect(1).toBe(1);
});
test("V2 glance", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1200 });
  await assertLoggedIn(page);
  for (const key of ["WFH-3248", "WFH-3232"]) {
    await page.goto(`https://wolfaenpak.atlassian.net/browse/${key}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12000);
    let found = false;
    for (const f of page.frames()) {
      const g = f.locator('[data-testid="issue-glance"]');
      if (await g.count().catch(() => 0)) {
        const t = await g.innerText();
        console.log(`--- GLANCE ${key} state=${await g.getAttribute("data-state")} mode=${await g.getAttribute("data-mode")}\n${t}`);
        dump(`glance-${key}`, t);
        await g.scrollIntoViewIfNeeded().catch(() => {});
        found = true;
        // toggle the other mode
        const tabs = f.locator('[data-testid="glance-mode"], button').filter({ hasText: /Engineer|PM/ });
        if (await tabs.count()) { await tabs.last().click().catch(() => {}); await page.waitForTimeout(2500); const t2 = await g.innerText(); console.log(`--- GLANCE ${key} OTHER MODE\n${t2}`); dump(`glance-${key}-alt`, t2); }
      }
    }
    await page.screenshot({ path: `${SHOT}/shots/glance-${key}.png`, fullPage: true });
    if (!found) console.log("NO GLANCE FRAME for", key);
  }
  expect(1).toBe(1);
});
