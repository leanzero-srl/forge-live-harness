import { chromium } from "playwright";
const PROFILE = process.env.LZ_HARNESS_PROFILE
  ? `/Users/mihaiperdum/Projects/forge-live-harness/.auth/${process.env.LZ_HARNESS_PROFILE}`
  : "/Users/mihaiperdum/Projects/forge-live-harness/.auth/profile";
export const SHOTS = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/lz780/shots";
export const APP = "https://wolfaenpak.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/d6096af9-3082-4ee1-a05e-f8b61d766b77";
export const SITE = "https://wolfaenpak.atlassian.net";
export const P1_NAME = "LZ780 Rollout programme (tester)";
export const P2_NAME = "LZ780 Both programmes (tester)";
export async function open({ width = 1600, height = 1100 } = {}) {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: process.env.HEADED ? false : true, viewport: { width, height },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  await ctx.addInitScript(() => {
    const css = document.createElement('style');
    css.textContent = '#aui-flag-container,[id^="aui-flag"]{pointer-events:none !important;}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css));
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  return { ctx, page };
}
export async function appFrame(page, { timeout = 120000 } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const f of page.frames()) {
      try { if (await f.locator('#root, .lz-appbar, [data-testid="plans-page"]').first().count()) return f; } catch {}
    }
    await page.waitForTimeout(700);
  }
  throw new Error("app frame not found");
}
export const shot = async (page, name) => { await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false }); console.log("SHOT", name); };
export async function openPlan(page, f, name) {
  for (let i=0;i<60;i++){ const t = await f.locator('body').innerText().catch(()=>""); if (t.includes(name)) break; await page.waitForTimeout(2000); }
  await f.locator(`text=${name}`).first().click();
  for (let i=0;i<60;i++){ if (await f.locator('[data-testid="derived-count-chip"], [data-testid="gantt-bar"]').first().count()) break; await page.waitForTimeout(2000); }
  await page.waitForTimeout(3000);
}
export async function header(f) {
  return (await f.locator('.lz-appbar, header').first().innerText().catch(()=> "")).replace(/\n/g, " | ");
}
