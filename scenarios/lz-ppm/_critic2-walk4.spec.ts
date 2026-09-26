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

test("Z1 portfolio create + assign + page", async ({ page }) => {
  const frame = await open(page);
  await frame.locator('[data-testid="new-portfolio-btn"]').click();
  await frame.locator('[data-testid="portfolio-dialog"]').waitFor({ state: "visible", timeout: 20000 });
  await page.screenshot({ path: `${SHOT}/shots/90-pf-dialog.png` });
  dump("90-pf-dialog", await frame.locator('[data-testid="portfolio-dialog"]').innerText());
  console.log("DIALOG:\n" + (await frame.locator('[data-testid="portfolio-dialog"]').innerText()));
  await frame.locator('[data-testid="portfolio-dialog-name"]').fill("Critic2 Programme");
  await frame.locator('[data-testid="portfolio-dialog-save"]').click();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SHOT}/shots/91-after-create.png`, fullPage: true });
  dump("91-after-create", await bodyText(frame));
  console.log("AFTER CREATE:\n" + (await bodyText(frame)).slice(0, 2200));

  const card = frame.locator('[data-testid="plan-card"]').filter({ hasText: st.planName }).first();
  await card.locator('[data-testid="plan-portfolio-add"]').click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT}/shots/92-assign.png`, fullPage: true });
  dump("92-assign", await bodyText(frame));
  console.log("ASSIGN UI:\n" + (await bodyText(frame)).slice(0, 2000));
  await frame.getByText("Critic2 Programme", { exact: false }).last().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SHOT}/shots/93-assigned.png`, fullPage: true });
  dump("93-assigned", await bodyText(frame));
  console.log("SECTIONS:", JSON.stringify(await frame.locator('[data-testid="plan-section-title"]').allInnerTexts().catch(() => [])));
  console.log("ROLLUPS:", JSON.stringify(await frame.locator('[data-testid="plan-section-rollup"]').allInnerTexts().catch(() => [])));
  for (const c of await frame.locator('[data-testid="plan-card"]').all()) { const t = await c.innerText(); if (t.includes("three chains")) console.log("BED CARD:", t.replace(/\n/g, " | ")); }
  // the portfolio PAGE
  await frame.getByText("Critic2 Programme", { exact: false }).first().click().catch(() => {});
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${SHOT}/shots/94-pf-page.png`, fullPage: true });
  dump("94-pf-page", await bodyText(frame));
  console.log("PF PAGE:\n" + (await bodyText(frame)).slice(0, 3000));
  expect(1).toBe(1);
});

test("Z2 glance on WFH-3248", async ({ page }) => {
  await page.setViewportSize({ width: 1500, height: 1200 });
  await assertLoggedIn(page);
  await page.goto("https://wolfaenpak.atlassian.net/browse/WFH-3248", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(14000);
  for (const f of page.frames()) {
    const t = await f.locator("body").innerText().catch(() => "");
    if (/room|finish|plan/i.test(t) && t.length > 30 && t.length < 4000) {
      console.log("--- FRAME", f.url().slice(0, 90), "\n" + t);
      dump("95-glance-" + Math.random().toString(36).slice(2, 6), t);
    }
  }
  await page.screenshot({ path: `${SHOT}/shots/95-glance.png`, fullPage: true });
  expect(1).toBe(1);
});
