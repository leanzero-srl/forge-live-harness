import { test, expect, chromium } from "@playwright/test";
const OUT = "/private/tmp/claude-501/-Users-mihaiperdum-Projects-lz-ppm-forge/b81453ad-b550-4f53-91ac-77d7f5856c36/scratchpad/lz720";
const PAGES: Record<string, string> = {
  sponsor: "https://wolfaenpak.atlassian.net/wiki/spaces/LZTEST/pages/344983305",
  storyline: "https://wolfaenpak.atlassian.net/wiki/spaces/LZTEST/pages/345147388",
};
test.describe.configure({ retries: 0, timeout: 600_000 });
test("render published pages", async () => {
  const ctx = await chromium.launchPersistentContext("/Users/mihaiperdum/Projects/forge-live-harness/.auth/profile", { headless: true, viewport: { width: 1500, height: 1100 } });
  const page = ctx.pages()[0] || await ctx.newPage();
  for (const [name, url] of Object.entries(PAGES)) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.mouse.move(950, 700);
    for (let i = 0; i < 5; i++) {
      await page.screenshot({ path: `${OUT}/page-${name}-${i}.png` });
      await page.mouse.wheel(0, 850);
      await page.waitForTimeout(1500);
    }
  }
  await ctx.close();
  expect(1).toBe(1);
});
