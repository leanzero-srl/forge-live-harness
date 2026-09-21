import { chromium } from "playwright";
const PROFILE = "/Users/mihaiperdum/Projects/forge-live-harness/.auth/profile";
export const SHOTS = "/Users/mihaiperdum/Projects/forge-live-harness/scratch/r4t/shots";
export const APP = "https://wolfaenpak.atlassian.net/jira/apps/087a8e18-d45a-4cb7-9d87-3e84101ac4f3/d6096af9-3082-4ee1-a05e-f8b61d766b77";
export const SITE = "https://wolfaenpak.atlassian.net";
export const PLAN_NAME = "r4t Rollout programme (tester)";
export async function open() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: process.env.HEADED ? false : true, viewport: { width: 1600, height: 1100 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  // host flag banners float over the iframe and swallow clicks
  await ctx.addInitScript(() => {
    const css = document.createElement('style');
    css.textContent = '#aui-flag-container,[id^="aui-flag"]{pointer-events:none !important;}';
    document.addEventListener('DOMContentLoaded', () => document.head.appendChild(css));
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  return { ctx, page };
}
export async function appFrame(page, { timeout = 90000 } = {}) {
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
export async function openPlan(page, f) {
  const card = f.locator(`text=${PLAN_NAME}`).first();
  await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(700);
  await card.click(); await page.waitForTimeout(10000);
}
