import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ctx = await chromium.launchPersistentContext(path.join(ROOT, ".auth", "profile"), { headless: false, viewport: { width: 1440, height: 900 } });
const page = ctx.pages()[0] || (await ctx.newPage());
try {
  await page.goto("https://wolfaenpak.atlassian.net/wiki/pages/viewpage.action?pageId=299238007", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  const item = page.locator(':is(button,a,span)[role], button, a').filter({ hasText: "Attachment Locker" }).first();
  console.log("byline item count:", await item.count());
  if (await item.count()) { await item.click().catch(() => {}); await page.waitForTimeout(6000); }
  for (const fr of page.frames()) {
    const u = fr.url();
    if (u && u !== "about:blank" && !u.includes("wolfaenpak.atlassian.net/wiki/pages")) console.log("FRAME:", u.slice(0, 220));
  }
  await page.screenshot({ path: "/tmp/sv-upm/byline.png", fullPage: true });
} finally { await ctx.close(); }
